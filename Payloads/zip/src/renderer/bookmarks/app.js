/**
 * bookmarks/app.js
 * Controls the standalone bookmarks popup window UI.
 */
if (!window.browserBridge) {
  const list = document.getElementById('bookmarkList');
  if (list) list.textContent = 'Bookmarks unavailable (bridge missing)';
  throw new Error('Bookmarks bridge missing');
}

window.addEventListener('contextmenu', (e) => e.preventDefault());

const bookmarkList  = document.getElementById('bookmarkList');
const closeButton   = document.getElementById('bookmarkClose');
const clearButton   = document.getElementById('clearBookmarks');
const header        = document.querySelector('.bookmark-header');

const state = { entries: [] };

/* header shadow on scroll */
function updateHeaderShadow(){
  if (!header || !bookmarkList) return;
  header.classList.toggle('scrolled', bookmarkList.scrollTop > 0);
}

const render = () => {
  if (!bookmarkList) return;
  bookmarkList.innerHTML = '';

  if (!state.entries.length) {
    const empty = document.createElement('div');
    empty.className = 'bookmark-empty';
    empty.textContent = 'No bookmarks yet';
    bookmarkList.appendChild(empty);
    updateHeaderShadow();
    return;
  }

  const frag = document.createDocumentFragment();

  state.entries.forEach((entry, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'bookmark-entry';
    item.dataset.idx = String(i);
    item.tabIndex = 0;

    const title = document.createElement('div');
    title.className = 'bookmark-entry-title';
    title.textContent = entry.title || entry.url;

    const url = document.createElement('div');
    url.className = 'bookmark-entry-url';
    url.textContent = entry.url;

    item.append(title, url);

    item.addEventListener('click', () => {
      window.browserBridge.navigate(entry.url);
      window.browserBridge.closeBookmarksPopup?.(); // close bookmarks popup if exposed
      // Fallback: if no specific API, try a generic closer:
      if (!window.browserBridge.closeBookmarksPopup && window.browserBridge.closeBookmarkPopup) {
        window.browserBridge.closeBookmarkPopup();
      }
    });

    frag.appendChild(item);
  });

  bookmarkList.appendChild(frag);
  updateHeaderShadow();
};

/* events */
bookmarkList?.addEventListener('scroll', updateHeaderShadow);
closeButton?.addEventListener('click', () => {
  window.browserBridge.closeBookmarksPopup?.();
  if (!window.browserBridge.closeBookmarksPopup && window.browserBridge.closeBookmarkPopup) {
    window.browserBridge.closeBookmarkPopup();
  }
});
clearButton?.addEventListener('click', async () => {
  try {
    await window.browserBridge.clearBookmarks();
    state.entries = [];
    render();
  } catch (err) {
    console.error('[Bookmarks] clearBookmarks failed', err);
  }
});

/* initial load + live updates */
window.browserBridge.getBookmarks()
  .then((entries) => { state.entries = entries || []; render(); })
  .catch((err) => {
    console.error('[Bookmarks] getBookmarks failed', err);
    state.entries = [];
    render();
  });

/* If your preload exposes a live update hook, wire it. */
if (window.browserBridge.onBookmarksUpdate) {
  window.browserBridge.onBookmarksUpdate((entries) => {
    state.entries = entries || [];
    render();
  });
}
