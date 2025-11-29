/**
 * history/app.js
 * Controls the standalone history popup window UI.
 */
if (!window.browserBridge) {
  const list = document.getElementById('historyList');
  if (list) list.textContent = 'History unavailable (bridge missing)';
  throw new Error('History bridge missing');
}

window.addEventListener('contextmenu', (event) => event.preventDefault());

const historyList = document.getElementById('historyList');
const closeButton = document.getElementById('historyClose');
const clearButton = document.getElementById('clearHistory');
const header = document.querySelector('.history-header');

const state = { entries: [] };

/* Header shadow toggled only when list is scrolled */
function updateHeaderShadow() {
  if (!header || !historyList) return;
  header.classList.toggle('scrolled', historyList.scrollTop > 0);
}

const render = () => {
  if (!historyList) return;
  historyList.innerHTML = '';

  if (!state.entries.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'No history yet';
    historyList.appendChild(empty);
    updateHeaderShadow();
    return;
  }

  const frag = document.createDocumentFragment();

  state.entries.forEach((entry, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'history-entry';
    item.dataset.idx = String(i);
    item.tabIndex = 0;

    const title = document.createElement('div');
    title.className = 'history-entry-title';
    title.textContent = entry.title || entry.url;

    const url = document.createElement('div');
    url.className = 'history-entry-url';
    url.textContent = entry.url;

    item.append(title, url);

    item.addEventListener('click', () => {
      window.browserBridge.navigate(entry.url);
      window.browserBridge.closeHistoryPopup();
    });

    frag.appendChild(item);
  });

  historyList.appendChild(frag);
  updateHeaderShadow();
};

/* Events */
historyList?.addEventListener('scroll', updateHeaderShadow);
closeButton?.addEventListener('click', () => window.browserBridge.closeHistoryPopup());

clearButton?.addEventListener('click', async () => {
  try {
    await window.browserBridge.clearHistory();
    state.entries = [];
    render();
  } catch (err) {
    console.error('[History] clearHistory failed', err);
  }
});

/* Initial load + live updates */
window.browserBridge
  .getHistory()
  .then((entries) => {
    state.entries = entries || [];
    render();
  })
  .catch((err) => {
    console.error('[History] getHistory failed', err);
    state.entries = [];
    render();
  });

window.browserBridge.onHistoryUpdate((entries) => {
  state.entries = entries || [];
  render();
});
