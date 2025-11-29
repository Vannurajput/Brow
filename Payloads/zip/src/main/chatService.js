// chatService.js — OpenAI-compatible Hugging Face Router (single-file, drop-in)

// Endpoint (OpenAI-compatible)
const CHAT_URL = 'https://router.huggingface.co/v1/chat/completions';

// Models (override via env if you like)
const MODEL_PRIMARY  = process.env.HF_MODEL_PRIMARY  || 'HuggingFaceTB/SmolLM2-135M-Instruct';
const MODEL_FALLBACK = process.env.HF_MODEL_FALLBACK || 'google/gemma-2-2b-it';

// Default generation settings
const DEFAULTS = {
  max_tokens: 256,
  temperature: 0.7,
  top_p: 0.95,
};

const log = (...args) => console.log('[ChatService]', ...args);

function toMessages(prompt, history = []) {
  const msgs = Array.isArray(history)
    ? history
        .filter(h => h && h.role && h.content)
        .map(({ role, content }) => ({ role, content }))
    : [];
  msgs.push({ role: 'user', content: prompt });
  return msgs;
}

async function callOnce(token, model, messages, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, ...DEFAULTS }),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function ask({ prompt, history }) {
  if (!prompt || !prompt.trim()) throw new Error('Prompt is empty.');

  // Trim accidental quotes/spaces (common on Windows)
  const token = (process.env.HF_TOKEN || '').replace(/^["']|["']$/g, '').trim();
  if (!token) {
    log('HF_TOKEN missing');
    return 'Set HF_TOKEN in your environment to enable chat.';
  }

  const messages = toMessages(prompt, history);
  log('request', { prompt: prompt.slice(0, 80) });

  // Try primary model first
  let res = await callOnce(token, MODEL_PRIMARY, messages);

  // If model not supported/known (400/404), try fallback
  if (res.status === 400 || res.status === 404) {
    const body = await res.text().catch(() => '');
    log(`Primary model failed (${res.status})`, body.slice(0, 200));
    log('Falling back to', MODEL_FALLBACK);
    res = await callOnce(token, MODEL_FALLBACK, messages);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) {
      log('HF API error 401 (bad token / no Inference permission):', text);
      return 'Your Hugging Face token was rejected (401). Create a new token with Inference access.';
    }
    if (res.status === 403) {
      log('HF API error 403 (forbidden):', text);
      return 'Hugging Face denied access (403). Check model access or token permissions.';
    }
    if (res.status === 429) {
      log('HF API error 429 (rate limited):', text);
      return 'Rate limited by Hugging Face (429). Please try again shortly.';
    }
    if (res.status === 408 || text.toLowerCase().includes('aborted')) {
      log('HF API timeout/abort:', text);
      return 'The chat request timed out. Please try again.';
    }
    log('HF API error', res.status, text);
    return 'The chat service is unavailable right now.';
  }

  const data = await res.json().catch(() => null);
  const answer = data?.choices?.[0]?.message?.content?.trim();
  return answer || 'Sorry, I could not generate a reply.';
}

module.exports = { ask };
