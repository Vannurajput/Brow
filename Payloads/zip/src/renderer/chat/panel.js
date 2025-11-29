export function initChatPanel({ bridge, toggleButton }) {
  const drawer = document.getElementById('chatDrawer');
  const closeBtn = document.getElementById('chatClose');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');
  const messagesEl = document.getElementById('chatMessages');
  const statusEl = document.getElementById('chatStatus');

  if (!drawer || !bridge) return;

  let history = [];
  let pending = false;

  const log = (...args) => console.log('[ChatPanel]', ...args);

  const setOpen = (next) => {
    document.body.classList.toggle('chat-open', !!next);
    const header = document.querySelector('.header');
    const top = header ? Math.ceil(header.getBoundingClientRect().bottom) : 64;
    drawer.style.top = `${top}px`;
    drawer.style.height = `calc(100vh - ${top}px)`;
  };

  const pushMessage = (role, content) => {
    const bubble = document.createElement('div');
    bubble.className = `chat-message ${role === 'user' ? 'me' : 'bot'}`;
    bubble.textContent = content;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    history.push({ role: role === 'user' ? 'user' : 'assistant', content });
  };

  const setPending = (state) => {
    pending = state;
    statusEl.hidden = !state;
    input.disabled = state;
    sendBtn.disabled = state;
  };

  const handleToggle = async () => {
    try {
      const res = await bridge.toggle();
      setOpen(res?.open);
      log('toggle', res);
    } catch (err) {
      console.error('chat toggle failed', err);
    }
  };

  toggleButton?.addEventListener('click', handleToggle);
  closeBtn?.addEventListener('click', handleToggle);

  bridge.onState?.((state) => {
    setOpen(!!state?.open);
    log('state', state);
  });

  window.addEventListener('resize', () => setOpen(document.body.classList.contains('chat-open')), { passive: true });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pending) return;
    const prompt = input.value.trim();
    if (!prompt) return;
    pushMessage('user', prompt);
    input.value = '';
    setPending(true);
    try {
      const res = await bridge.ask(prompt, history);
      const reply = res?.reply || 'No response.';
      pushMessage('assistant', reply);
    } catch (err) {
      console.error('chat ask failed', err);
      pushMessage('assistant', 'Sorry, I could not reply.');
    } finally {
      setPending(false);
    }
  });

  return { toggle: handleToggle };
}
