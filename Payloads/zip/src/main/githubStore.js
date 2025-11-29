/**
 * githubStore.js
 * Persists GitHub configuration safely inside the userData folder.
 */
const fs = require('fs/promises');
const path = require('path');
const { app } = require('electron');

const configPath = path.join(app.getPath('userData'), 'github-config.json'); // file used to persist PAT data

const defaultConfig = {
  pat: '',
  owner: '',
  repository: '',
  branch: 'main',
  defaultPath: '',
  defaultCommitMessage: 'chore: push from Chromo',
  localFilePath: ''
};

// Reads the saved configuration, falling back to defaults.
async function loadConfig() {
  try {
    const data = await fs.readFile(configPath, 'utf8');
    return { ...defaultConfig, ...JSON.parse(data) };
  } catch (error) {
    return { ...defaultConfig };
  }
}

// Overwrites the config file with merged values.
async function saveConfig(config = {}) {
  const merged = { ...defaultConfig, ...config };
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

// Resets everything to the default blank state.
async function clearConfig() {
  await saveConfig({ ...defaultConfig });
}

module.exports = {
  loadConfig,
  saveConfig,
  clearConfig
};
