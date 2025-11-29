/**
 * githubManager.js
 * Handles GitHub connectivity, push, and pull operations.
 */
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const log = require('../logger');
const githubStore = require('./githubStore');

const API_BASE = 'https://api.github.com';
const POSIX = path.posix;

const withAuthHeaders = (pat) => ({
  Authorization: `Bearer ${pat}`,
  'User-Agent': 'Chromo/Electron',
  Accept: 'application/vnd.github+json'
});

// Confirms the PAT has access to the requested repository.
async function verifyRepository(config) {
  const url = `${API_BASE}/repos/${config.owner}/${config.repository}`;
  const response = await fetch(url, { headers: withAuthHeaders(config.pat) });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to verify repository: ${response.status} ${body}`);
  }
}

// Returns the SHA of the configured file if it already exists.
async function getExistingFileSha(config) {
  const url = `${API_BASE}/repos/${config.owner}/${config.repository}/contents/${config.defaultPath}?ref=${config.branch}`;
  const response = await fetch(url, { headers: withAuthHeaders(config.pat) });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to fetch existing file info: ${response.status} ${body}`);
  }
  const data = await response.json();
  return data.sha;
}

// Pushes inline text content to the configured repository path.
async function pushContent({ commitMessage, textContent, zipBytes, zipFileName }) {
  const config = await githubStore.loadConfig();
  if (!config.pat || !config.owner || !config.repository || !config.defaultPath) {
    throw new Error('Missing GitHub configuration. Please fill Owner/Repo/Path.');
  }

  const hasZip = !!zipBytes && (zipBytes.length || zipBytes.byteLength);

  if (hasZip) {
    const buffer = normalizeToBuffer(zipBytes);
    if (!buffer || !buffer.length) {
      throw new Error('Zip archive is empty.');
    }
    log.info('[GitHub] Zip push requested', {
      repo: `${config.owner}/${config.repository}`,
      branch: config.branch,
      fileName: zipFileName,
      zipKB: Number(buffer.length / 1024).toFixed(2)
    });
    return pushZipArchive({
      config,
      commitMessage,
      zipBuffer: buffer,
      zipFileName
    });
  }

  if (!textContent || !textContent.length) {
    throw new Error('Enter some text or select a zip archive to push.');
  }
  const contentBuffer = Buffer.from(textContent, 'utf8');
  log.info('[GitHub] Text push requested', {
    repo: `${config.owner}/${config.repository}`,
    branch: config.branch,
    bytes: contentBuffer.length
  });
  const sha = await getExistingFileSha(config);

  const url = `${API_BASE}/repos/${config.owner}/${config.repository}/contents/${config.defaultPath}`;
  const body = {
    message: commitMessage || config.defaultCommitMessage,
    content: contentBuffer.toString('base64'),
    branch: config.branch,
    sha: sha || undefined
  };
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...withAuthHeaders(config.pat),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to push file: ${response.status} ${text}`);
  }
  const result = await response.json();
  return {
    ...result,
    bytes: contentBuffer.length,
    files: 1
  };
}

// Downloads the configured file contents so the renderer can show it.
async function pullContent() {
  const config = await githubStore.loadConfig();
  if (!config.pat || !config.owner || !config.repository || !config.defaultPath) {
    throw new Error('Missing GitHub configuration or default path.');
  }
  const url = `${API_BASE}/repos/${config.owner}/${config.repository}/contents/${config.defaultPath}?ref=${config.branch}`;
  const response = await fetch(url, { headers: withAuthHeaders(config.pat) });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to pull file: ${response.status} ${text}`);
  }
  const data = await response.json();
  return {
    content: Buffer.from(data.content, 'base64').toString('utf8')
  };
}

// Validates and persists the Git connection settings.
async function saveConfig(config) {
  await verifyRepository(config);
  const normalized = {
    ...config,
    branch: config.branch || 'main',
    defaultCommitMessage: config.defaultCommitMessage || 'chore: push from Chromo'
  };
  return githubStore.saveConfig(normalized);
}

// Clears stored GitHub credentials/PAT.
async function signOut() {
  await githubStore.clearConfig();
}

module.exports = {
  saveConfig,
  loadConfig: githubStore.loadConfig,
  signOut,
  pushContent,
  pullContent,
  pushJson   
};


// Helper: create/update a JSON file at a repo path.
async function pushJson({ owner, repo, branch = 'main', filePath, token, commitMessage, json }) {
  if (!owner || !repo || !filePath) {
    throw new Error('pushJson: owner, repo, and filePath are required');
  }
  if (!token) {
    throw new Error('pushJson: token is required');
  }

  // 1) If the file exists, get its SHA (updates require sha)
  let sha = null;
  {
    const url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`;
    const res = await fetch(url, { headers: withAuthHeaders(token) });
    if (res.status === 200) {
      const j = await res.json();
      sha = j.sha;
    } else if (res.status !== 404) {
      const text = await res.text();
      throw new Error(`GitHub GET contents failed: ${res.status} ${text}`);
    }
  }

  // 2) Prepare content
  const content = Buffer.from(JSON.stringify(json, null, 2), 'utf8').toString('base64');
  const body = {
    message: commitMessage || `chore(payload): add ${filePath}`,
    content,
    branch,
    ...(sha ? { sha } : {})
  };

  // 3) PUT create/update
  {
    const url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        ...withAuthHeaders(token),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub PUT contents failed: ${res.status} ${text}`);
    }
    return res.json();
  }
}

function normalizeToBuffer(input) {
  if (!input) return null;
  if (Buffer.isBuffer(input)) return input;

  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }

  if (input instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(input));
  }

  // ipcRenderer may serialize Buffers as { type: 'Buffer', data: [] }
  if (Array.isArray(input)) {
    return Buffer.from(input);
  }
  if (input && input.type === 'Buffer' && Array.isArray(input.data)) {
    return Buffer.from(input.data);
  }

  return null;
}

const cleanBasePath = (input = '') => {
  if (!input) return '';
  const normalized = POSIX.normalize(String(input).trim().replace(/\\/g, '/'));
  if (!normalized || normalized === '.' || normalized === '/') {
    return '';
  }
  return normalized.replace(/^\/+/, '').replace(/\/+$/, '');
};

const deriveZipPrefix = (input = '') => {
  if (!input) return '';
  const normalized = cleanBasePath(input);
  if (!normalized) return '';

  const originalEndsWithSlash = /[\\/]$/.test(input.trim());
  if (originalEndsWithSlash) {
    return normalized;
  }

  if (!normalized.includes('/')) {
    return normalized.includes('.') ? '' : normalized;
  }

  const lastSlash = normalized.lastIndexOf('/');
  const tail = normalized.slice(lastSlash + 1);
  if (tail.includes('.')) {
    return normalized.slice(0, lastSlash);
  }
  return normalized;
};

const sanitizeEntryPath = (entryName = '') => {
  if (!entryName) return null;
  const normalized = POSIX.normalize(entryName.replace(/\\/g, '/'));
  if (!normalized || normalized === '.' || normalized.endsWith('/')) {
    return null;
  }
  if (normalized.startsWith('..')) {
    return null;
  }
  const trimmed = normalized.replace(/^\/+/, '');
  if (trimmed.toLowerCase().startsWith('__macosx/')) {
    return null;
  }
  return trimmed;
};

const shouldStripCommonRoot = (paths) => {
  if (!paths.length) return false;
  const segments = paths.map((p) => p.split('/'));
  if (!segments.every((parts) => parts.length > 1)) {
    return false;
  }
  const root = segments[0][0];
  if (!root) return false;
  return segments.every((parts) => parts[0] === root);
};

const stripFirstSegment = (relativePath) => {
  const idx = relativePath.indexOf('/');
  if (idx === -1) {
    return relativePath;
  }
  return relativePath.slice(idx + 1);
};

async function pushZipArchive({ config, commitMessage, zipBuffer, zipFileName }) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (!entries.length) {
    throw new Error('Zip archive contains no files to push.');
  }

  const sanitizedEntries = entries
    .map((entry) => ({
      relative: sanitizeEntryPath(entry.entryName),
      entry
    }))
    .filter((item) => !!item.relative);

  if (!sanitizedEntries.length) {
    throw new Error('Zip archive did not contain any publishable files.');
  }

  const stripOuterFolder = shouldStripCommonRoot(sanitizedEntries.map((item) => item.relative));
  const repoPrefix = deriveZipPrefix(config.defaultPath);
  log.info('[GitHub] Zip archive parsed', {
    repo: `${config.owner}/${config.repository}`,
    branch: config.branch,
    repoPrefix,
    files: sanitizedEntries.length,
    zipKB: Number(zipBuffer.length / 1024).toFixed(2),
    stripOuterFolder
  });

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-zip-'));
  const repoDir = path.join(tempRoot, 'repo');

  try {
    await cloneRepository(config, repoDir, tempRoot);
    await configureGitIdentity(repoDir);

    const targetDir = repoPrefix ? path.join(repoDir, repoPrefix) : repoDir;
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(targetDir, { recursive: true });

    let written = 0;
    for (const item of sanitizedEntries) {
      const adjustedRelative = stripOuterFolder ? stripFirstSegment(item.relative) : item.relative;
      const destPath = path.join(targetDir, adjustedRelative);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      const buffer = item.entry.getData();
      await fs.writeFile(destPath, buffer);
      written++;
    }
    log.info('[GitHub] Copied zip files into repo', {
      targetDir,
      files: written
    });

    await runGit(['add', '.'], repoDir);
    const message =
      commitMessage?.trim() ||
      config.defaultCommitMessage ||
      `chore: push ${zipFileName || 'archive'}`;
    await runGit(['commit', '-m', message], repoDir);
    await runGit(['push', 'origin', config.branch], repoDir);
    const commitSha = (await runGit(['rev-parse', 'HEAD'], repoDir)).trim();
    log.info('[GitHub] Zip push committed via git CLI', {
      repo: `${config.owner}/${config.repository}`,
      files: written,
      commit: commitSha
    });
    return {
      files: written,
      commit: { sha: commitSha },
      bytes: zipBuffer.length
    };
  } finally {
    await safeRemove(tempRoot);
  }
}

async function cloneRepository(config, repoDir, workRoot) {
  const authUrl = buildAuthUrl(config);
  await runGit(
    ['clone', '--branch', config.branch, '--depth', '1', authUrl, repoDir],
    workRoot,
    { redact: true }
  );
}

async function configureGitIdentity(repoDir) {
  await runGit(['config', 'user.name', 'Codex Browser'], repoDir);
  await runGit(['config', 'user.email', 'codex-browser@example.com'], repoDir);
}

async function safeRemove(target) {
  if (!target) return;
  try {
    await fs.rm(target, { recursive: true, force: true });
  } catch (err) {
    log.warn('[GitHub] Failed to remove temp directory', { target, error: err.message });
  }
}

async function runGit(args, cwd, options = {}) {
  const displayArgs = options.redact ? '[redacted]' : args.join(' ');
  log.info('[GitHub] git command', { cwd, args: displayArgs });
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git ${args[0]} failed: ${stderr || `exit code ${code}`}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

const buildAuthUrl = (config) => {
  const token = encodeURIComponent(config.pat);
  return `https://${token}@github.com/${config.owner}/${config.repository}.git`;
};

async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${text}`);
  }
  return response.json();
}
