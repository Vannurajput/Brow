/**
 * github/app.js
 * Git configuration popup that syncs inline text to GitHub via PAT.
 */
if (!window.browserBridge) {
  throw new Error('Git popup bridge missing');
}

window.addEventListener('contextmenu', (event) => event.preventDefault());

const elements = {
  tabs: {
    config: document.getElementById('tabConfig'),
    push: document.getElementById('tabPush'),
    pull: document.getElementById('tabPull')
  },
  panels: {
    config: document.getElementById('configPanel'),
    push: document.getElementById('pushPanel'),
    pull: document.getElementById('pullPanel')
  },
  pat: document.getElementById('patInput'),
  owner: document.getElementById('ownerInput'),
  repo: document.getElementById('repoInput'),
  branch: document.getElementById('branchInput'),
  path: document.getElementById('pathInput'),
  commitMessage: document.getElementById('commitMessageInput'),
  configStatus: document.getElementById('configStatus'),
  saveConfig: document.getElementById('saveConfigButton'),
  signOut: document.getElementById('signOutButton'),
  close: document.getElementById('closeButton'),
  pushCommit: document.getElementById('pushCommitMessage'),
  pushInline: document.getElementById('pushInlineContent'),
  pushBtn: document.getElementById('pushButton'),
  pushZipBtn: document.getElementById('pushZipButton'),
  pushStatus: document.getElementById('pushStatus'),
  pullBtn: document.getElementById('pullButton'),
  pullStatus: document.getElementById('pullStatus'),
  zipInput: document.getElementById('pushZipInput')
};

const textEncoder = new TextEncoder();
const textSize = (value) => textEncoder.encode(value || '').length;

const switchPanel = (target) => {
  Object.values(elements.tabs).forEach((tab) => tab.classList.remove('active'));
  Object.values(elements.panels).forEach((panel) => panel.classList.remove('active'));
  elements.tabs[target].classList.add('active');
  elements.panels[target].classList.add('active');
};

elements.tabs.config.addEventListener('click', () => switchPanel('config'));
elements.tabs.push.addEventListener('click', () => switchPanel('push'));
elements.tabs.pull.addEventListener('click', () => switchPanel('pull'));

const fillForm = (config) => {
  elements.pat.value = config.pat || '';
  elements.owner.value = config.owner || '';
  elements.repo.value = config.repository || '';
  elements.branch.value = config.branch || '';
  elements.path.value = config.defaultPath || '';
  elements.commitMessage.value = config.defaultCommitMessage || '';
  elements.pushCommit.value = config.defaultCommitMessage || '';
  elements.configStatus.textContent = config.owner
    ? `Connected to ${config.owner}/${config.repository}@${config.branch || 'main'}`
    : 'Not connected';
};

const readForm = () => ({
  pat: elements.pat.value.trim(),
  owner: elements.owner.value.trim(),
  repository: elements.repo.value.trim(),
  branch: elements.branch.value.trim() || 'main',
  defaultPath: elements.path.value.trim(),
  defaultCommitMessage: elements.commitMessage.value.trim() || 'chore: push from Chromo'
});

elements.saveConfig?.addEventListener('click', async () => {
  elements.configStatus.textContent = 'Verifying repository...';
  try {
    const config = readForm();
    const saved = await window.browserBridge.githubSaveConfig(config);
    fillForm(saved);
    elements.configStatus.textContent = 'Connected successfully.';
  } catch (error) {
    elements.configStatus.textContent = error.message;
  }
});

elements.signOut?.addEventListener('click', async () => {
  await window.browserBridge.githubSignOut();
  fillForm({
    pat: '',
    owner: '',
    repository: '',
    branch: 'main',
    defaultPath: '',
    defaultCommitMessage: 'chore: push from Chromo'
  });
  elements.configStatus.textContent = 'Signed out.';
});

elements.pushBtn?.addEventListener('click', async () => {
  elements.pushStatus.textContent = 'Pushing...';
  try {
    const text = elements.pushInline.value.trim();
    if (!text) {
      elements.pushStatus.textContent = 'Enter some text to push.';
      return;
    }
    const response = await window.browserBridge.githubPush({
      commitMessage: elements.pushCommit.value.trim(),
      textContent: text
    });
    const bytes = response?.bytes ?? textSize(text);
    const kb = (bytes / 1024).toFixed(1);
    const sha = response?.commit?.sha?.slice(0, 7) || '';
    elements.pushStatus.textContent = `Pushed ${kb} KB${sha ? ` (commit ${sha})` : ''}`;
  } catch (error) {
    elements.pushStatus.textContent = error.message;
  }
});

elements.pushZipBtn?.addEventListener('click', async () => {
  const file = elements.zipInput?.files?.[0];
  if (!file) {
    elements.pushStatus.textContent = 'Choose a .zip file first.';
    return;
  }
  if (!file.name.toLowerCase().endsWith('.zip')) {
    elements.pushStatus.textContent = 'Select a file with .zip extension.';
    return;
  }

  elements.pushStatus.textContent = `Uploading ${file.name}...`;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zipBytes = new Uint8Array(arrayBuffer);
    const response = await window.browserBridge.githubPush({
      commitMessage: elements.pushCommit.value.trim(),
      zipFileName: file.name,
      zipBytes
    });
    const fileCount = response?.files ?? 0;
    const sha = response?.commit?.sha ? response.commit.sha.slice(0, 7) : '';
    const bytes = response?.bytes ?? zipBytes.length;
    const kb = (bytes / 1024).toFixed(1);
    elements.pushStatus.textContent =
      fileCount > 0
        ? `Pushed ${fileCount} files (${kb} KB) from ${file.name} ${sha ? `(commit ${sha})` : ''}`.trim()
        : `Uploaded ${file.name} (${kb} KB).`;
    if (elements.zipInput) {
      elements.zipInput.value = '';
    }
  } catch (error) {
    elements.pushStatus.textContent = error.message;
  }
});

elements.pullBtn?.addEventListener('click', async () => {
  elements.pullStatus.textContent = 'Pulling...';
  try {
    const info = await window.browserBridge.githubPull();
    const snippet = info.content?.slice(0, 120) || '';
    elements.pullStatus.textContent = `Pulled ${info.content?.length || 0} chars: ${snippet}`;
  } catch (error) {
    elements.pullStatus.textContent = error.message;
  }
});

elements.close?.addEventListener('click', () => window.browserBridge.closeGitPopup());

const bootstrap = async () => {
  const config = await window.browserBridge.githubGetConfig();
  fillForm(config);
};

bootstrap();
