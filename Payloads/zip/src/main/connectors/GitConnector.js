// src/main/connectors/GitConnector.js
const BaseConnector = require('./BaseConnector');
let githubManager = null;
try { githubManager = require('../githubManager'); } catch (_) {}

class GitConnector extends BaseConnector {
  async execute(payload) {
    const { git = {}, ...rest } = payload;

    const owner  = git.owner;
    const repo   = git.repo;
    const branch = git.branch || 'main';

    // Prefer saved token from your app's GitHub settings; fallback to git.token in message (for testing)
    // Load saved config (async) and prefer PAT from settings
    const stored = (githubManager?.loadConfig ? await githubManager.loadConfig() : {}) || {};
    const token  = stored.pat || stored.token || git.token; // PAT is saved as 'pat'



    if (!owner || !repo) {
      throw new Error('GitConnector: git.owner and git.repo are required');
    }
    if (!token) {
      throw new Error('GitConnector: GitHub token not found. Save it in settings or include git.token');
    }

    // Build the JSON we will commit
    const dataToPersist = {
      _kind: 'browser-payload',
      _savedAt: new Date().toISOString(),
      git: { owner, repo, branch },
      ...rest, // includes db, dbType, metadata
    };

    // Target path + commit message
    const filePath = git.filePath || `payloads/${dataToPersist._savedAt.replace(/[:]/g, '-')}.json`;
    const commitMessage = git.commitMessage || `chore(payload): add ${filePath}`;

    // Prefer a helper on githubManager if present, else use direct API
    if (githubManager?.pushJson) {
      await githubManager.pushJson({ owner, repo, branch, filePath, token, commitMessage, json: dataToPersist });
      return { ok: true, connector: 'GIT', path: filePath, message: 'Payload pushed via githubManager.pushJson()' };
    }

    await pushJsonViaGitHubApi({ owner, repo, branch, filePath, token, commitMessage, json: dataToPersist });
    return { ok: true, connector: 'GIT', path: filePath, message: 'Payload pushed via GitHub API' };
  }
}

async function pushJsonViaGitHubApi({ owner, repo, branch, filePath, token, commitMessage, json }) {
  const API = 'https://api.github.com';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'electron-browser-client'
  };

  // If the file exists, we need its SHA to update
  let sha;
  {
    const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`, {
      method: 'GET',
      headers
    });
    if (res.status === 200) {
      const j = await res.json();
      sha = j.sha;
    } else if (res.status !== 404) {
      const text = await res.text();
      throw new Error(`GitHub GET contents failed: ${res.status} ${text}`);
    }
  }

  const content = Buffer.from(JSON.stringify(json, null, 2), 'utf8').toString('base64');
  const body = { message: commitMessage, content, branch, ...(sha ? { sha } : {}) };

  const put = await fetch(`${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  if (!put.ok) {
    const text = await put.text();
    throw new Error(`GitHub PUT contents failed: ${put.status} ${text}`);
  }
}

module.exports = GitConnector;
