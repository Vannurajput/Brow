/**
 * scripts/app.js
 * Renderer bootstrap wiring UI controls to the preload bridge.
 */
import { state, applyState } from './state.js';
import { initTabStrip } from './components/tabStrip.js';
import { initNavigationBar } from './components/navigationBar.js';
import { initChatPanel } from '../chat/panel.js';
// import './components/printPreview.js';   
if (!window.browserBridge) {
  throw new Error('Renderer missing browserBridge');
}

const rendererLog = (...args) => console.log('[Renderer]', ...args);

// Cache all DOM references so we do not query repeatedly.
const elements = {
  tabContainer: document.getElementById('tabStrip'),
  newTabButton: document.getElementById('newTabButton'),
  backButton: document.getElementById('backButton'),
  forwardButton: document.getElementById('forwardButton'),
  reloadButton: document.getElementById('reloadButton'),
  addressBar: document.getElementById('addressBar'),
  goButton: document.getElementById('addressGo'),
  historyButton: document.getElementById('historyButton'),
  bookmarkListButton: document.getElementById('bookmarkListButton'),
  bookmarkStar: document.getElementById('bookmarkStar'),
  gitButton: document.getElementById('gitButton'),
  settingsButton: document.getElementById('settingsButton'),
  chatToggle: document.getElementById('chatToggle'),
  centerAddressBar: document.getElementById('centerAddressBar'),
  centerAddressGo: document.getElementById('centerAddressGo'),
  centerAddressForm: document.getElementById('centerAddressForm'),
  heroNewTab: document.getElementById('heroNewTab'),
  heroBookmarks: document.getElementById('heroBookmarks'),
  heroHistory: document.getElementById('heroHistory'),


  // ===================== [ADDED ✨ DOWNLOADS] =====================
  downloadButton: document.getElementById('downloadButton')
  // =================== [/ADDED ✨ DOWNLOADS] ======================
};

const header = document.querySelector('.header');
const contentArea = document.querySelector('.content');
const bookmarksState = {
  entries: []
};

// Right-click anywhere to pop open DevTools while suppressing the native menu.
window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

const getChromeHeight = () => {
  const headerH = header?.getBoundingClientRect().height || 0;
  const heroH =
    document.body.classList.contains('show-hero') && contentArea
      ? contentArea.getBoundingClientRect().height || 0
      : 0;
  return Math.ceil(headerH + heroH);
};

// Tells the main process how tall the chrome currently is.
const reportTopOffset = () => {
  if (!window.browserBridge.updateTopOffset) {
    return;
  }
  const height = getChromeHeight();
  if (height > 0) window.browserBridge.updateTopOffset(height);
};

/* ----------------------------- [ADDED] -----------------------------
   Keep BrowserView correctly placed and guarantee clicks/scrolls
   outside the header pass through to the BrowserView.
------------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  reportTopOffset();

  // 1) CSS safety: common overlay/fade elements shouldn't capture events
  const style = document.createElement('style');
  style.id = 'click-through-fix';
  style.textContent = `
    .tab-fade, .tab-fade-left, .tab-fade-right,
    .header-shadow, .top-gradient, .content-overlay {
      pointer-events: none !important;
    }
    /* Keep actual chrome interactive */
    .header, .tab-section, .toolbar,
    #tabsScrollLeft, #tabsScrollRight,
    #newTabButton, #addressBar, #addressGo {
      pointer-events: auto;
    }

    /* ===== [DRAG FIX] Limit draggable region to header only ===== */
    /* Everything by default: NOT draggable (so web area gets clicks) */
    html, body, #root, .app, .content, .tab-content, .main, .page {
      -webkit-app-region: no-drag !important;
    }
    /* Only the header strip acts as the draggable titlebar */
    .header {
      -webkit-app-region: drag !important;
    }
    /* Buttons/inputs inside header must remain clickable */
    .header * {
      -webkit-app-region: no-drag !important;
    }
    /* ============================================================ */
  `;
  document.head.appendChild(style);

  // 2) Event pass-through: if a click/wheel happens outside the header,
  // temporarily disable pointer-events on the BODY so the BrowserView underneath
  // receives the event (prevents any stray transparent layer from blocking it).
  const passThroughIfOutsideHeader = () => {
    document.body.style.pointerEvents = 'none';
    // Use microtask to re-enable immediately after the event dispatch
    Promise.resolve().then(() => (document.body.style.pointerEvents = ''));
  };

  const isOutsideHeader = (target) => {
    if (target && target.closest && target.closest('.start-card')) return false;
    return !(header && header.contains(target));
  };

  // Capture phase so we run before any other handlers.
document.addEventListener(
  'mousedown',
  (e) => {
    if (isOutsideHeader(e.target)) passThroughIfOutsideHeader();
  },
  true
);

document.addEventListener(
  'wheel',
  (e) => {
    if (isOutsideHeader(e.target)) passThroughIfOutsideHeader();
  },
  { capture: true, passive: true }
);
});

/* Keep BrowserView in sync if the header height changes */
if (header && 'ResizeObserver' in window) {
  const ro = new ResizeObserver(() => reportTopOffset());
  ro.observe(header);
  if (contentArea) {
    ro.observe(contentArea);
  }
}

window.addEventListener('resize', reportTopOffset);
/* --------------------------- [/ADDED] ---------------------------- */

// Setup the tab strip renderer.
const { render: renderTabs } = initTabStrip({
  tabContainer: elements.tabContainer,
  newTabButton: elements.newTabButton,
  bridge: window.browserBridge
});

// Setup the navigation bar renderer.
const { render: renderNavigation } = initNavigationBar({
  elements: {
    backButton: elements.backButton,
    forwardButton: elements.forwardButton,
    reloadButton: elements.reloadButton,
    addressBar: elements.addressBar,
    goButton: elements.goButton
  },
  bridge: window.browserBridge
});

// Helper to keep the centered address bar in sync.
const syncCenterAddress = (url) => {
  if (!elements.centerAddressBar) return;
  if (document.activeElement === elements.centerAddressBar) return;
  if (!url || url === 'about:blank') {
    elements.centerAddressBar.value = '';
    return;
  }
  elements.centerAddressBar.value = url;
};

const toggleHeroVisibility = (url) => {
  const shouldShow = !url || url === 'about:blank';
  document.body.classList.toggle('show-hero', shouldShow);
  // Anytime hero changes, recalc offset so BrowserView sits below it.
  reportTopOffset();
};

const navigateFromCenter = () => {
  if (!elements.centerAddressBar) return;
  window.browserBridge.navigate(elements.centerAddressBar.value);
  elements.centerAddressBar.blur();
};

// Anytime the main process reports tab state, redraw UI bindings.
window.browserBridge.onTabState((payload) => {
  applyState(payload);
  renderTabs(state);
  renderNavigation(state);
  syncCenterAddress(state.navigation.url);
  toggleHeroVisibility(state.navigation.url);
  reportTopOffset();
  updateBookmarkIndicator();
  rendererLog('Tab state updated', payload);
});

reportTopOffset();
toggleHeroVisibility(state.navigation.url);

// Anchors and toggles the history dropdown.
const toggleHistoryPopup = (anchorEl = elements.historyButton) => {
  if (!anchorEl || !window.browserBridge.toggleHistoryPopup) return;

  const rect = anchorEl.getBoundingClientRect();
  const bounds = { x: rect.left, y: rect.bottom + 8, width: rect.width, height: rect.height };
  window.browserBridge.toggleHistoryPopup(bounds);
  rendererLog('History popup toggled');
};

// Anchors and toggles the bookmarks dropdown.
const toggleBookmarksPopup = (anchorEl = elements.bookmarkListButton) => {
  if (!anchorEl || !window.browserBridge.toggleBookmarksPopup) return;

  const rect = anchorEl.getBoundingClientRect();
  const bounds = { x: rect.left, y: rect.bottom + 8, width: rect.width, height: rect.height };
  window.browserBridge.toggleBookmarksPopup(bounds);
  rendererLog('Bookmarks popup toggled');
};

if (elements.historyButton) {
  elements.historyButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleHistoryPopup();
  });
}

if (elements.bookmarkListButton) {
  elements.bookmarkListButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleBookmarksPopup();
  });
}

const getActiveTab = () => state.tabs.find((tab) => tab.id === state.activeTabId);

// Visually indicates if the active page is bookmarked.
const updateBookmarkIndicator = () => {
  if (!elements.bookmarkStar) return;

  const url = state.navigation?.url;
  const isBookmarked = !!url && bookmarksState.entries.some((entry) => entry.url === url);
  elements.bookmarkStar.classList.toggle('active', isBookmarked);
  elements.bookmarkStar.textContent = isBookmarked ? '\u2605' : '\u2606';
};

elements.bookmarkStar?.addEventListener('click', () => {
  const url = state.navigation?.url;
  if (!url) return;

  const activeTab = getActiveTab();
  window.browserBridge.toggleBookmark({ url, title: activeTab?.title || url });
  rendererLog('Bookmark star toggled', url);
});

// Hydrate bookmarks on startup.
window.browserBridge.getBookmarks().then((entries) => {
  bookmarksState.entries = entries || [];
  updateBookmarkIndicator();
});

// Keep the bookmark indicator synced when other tabs add/remove entries.
window.browserBridge.onBookmarksUpdate((entries) => {
  bookmarksState.entries = entries || [];
  updateBookmarkIndicator();
});

// Positions and toggles the Git configuration popup.
const toggleGitPopup = () => {
  if (!elements.gitButton || !window.browserBridge.toggleGitPopup) return;

  const rect = elements.gitButton.getBoundingClientRect();
  const bounds = { x: rect.left, y: rect.bottom + 8, width: rect.width, height: rect.height };
  window.browserBridge.toggleGitPopup(bounds);
};

elements.gitButton?.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleGitPopup();
});

const toggleSettingsPopup = () => {
  if (!elements.settingsButton || !window.browserBridge.toggleSettingsPopup) return;

  const rect = elements.settingsButton.getBoundingClientRect();
  const bounds = { x: rect.left, y: rect.bottom + 8, width: rect.width, height: rect.height };
  window.browserBridge.toggleSettingsPopup(bounds);
};

elements.settingsButton?.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleSettingsPopup();
});

// Chat drawer toggle + keyboard shortcut (Ctrl+/)
if (window.chatBridge && elements.chatToggle) {
  const panel = initChatPanel({
    bridge: window.chatBridge,
    toggleButton: elements.chatToggle
  });

  window.addEventListener('keydown', (e) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && e.key === '/') {
      e.preventDefault();
      panel?.toggle?.();
    }
  });
}

// Centered hero controls
elements.centerAddressForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  navigateFromCenter();
});

elements.centerAddressGo?.addEventListener('click', (e) => {
  e.preventDefault();
  navigateFromCenter();
});

elements.centerAddressBar?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    navigateFromCenter();
  }
});

elements.heroNewTab?.addEventListener('click', () => window.browserBridge.createTab());
elements.heroBookmarks?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleBookmarksPopup(elements.bookmarkListButton || e.currentTarget);
});
elements.heroHistory?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleHistoryPopup(elements.historyButton || e.currentTarget);
});


/* ===================================================================== */
/* ======================= [ADDED ✨ DOWNLOADS] ========================= */
/**
 * Light renderer-side UX for Downloads:
 * - badge counter on #downloadButton
 * - small toast when a download starts/completes
 * - (optional) in-window flyout if you’re not using the popup window
 *
 * NOTE: This expects your preload to expose:
 *   - toggleDownloadsPopup(bounds)   // to open the popup window
 *   - getDownloadsHistory()          // array of past downloads
 *   - onDownloadsUpdate(callback)    // progress/completed/started events
 *   - openDownloadedItem(id)         // optional if you wired it
 *   - revealInFolder(path) / openDownloadsFolder() // optional convenience
 */
const downloadsState = {
  activeCount: 0,
  items: []  // {id, name, fileName, receivedBytes, totalBytes, state, savePath, startedAt, completedAt, url}
};

const ensureBadge = () => {
  if (!elements.downloadButton) return null;
  let badge = elements.downloadButton.querySelector('.badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'badge';
    elements.downloadButton.appendChild(badge);
  }
  return badge;
};

const renderBadge = () => {
  const badge = ensureBadge();
  if (!badge) return;
  // Show count of active downloads (or latest finished as 1 flash)
  const count = downloadsState.activeCount;
  if (count > 0) {
    badge.style.display = 'inline-flex';
    badge.textContent = String(count);
  } else {
    // hide when nothing active
    badge.style.display = 'none';
  }
};

// ---- toast (small bubble under address bar) ----
let toastEl = null;
const ensureToast = () => {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'download-toast';
    toastEl.innerHTML = `
      <div class="title">Download</div>
      <div class="meta"></div>
      <div class="progress"><span></span></div>
    `;
    document.body.appendChild(toastEl);
  }
  return toastEl;
};

let toastTimer = null;
const showToast = (title, meta, pct = null, sticky = false) => {
  const el = ensureToast();
  el.querySelector('.title').textContent = title || 'Download';
  el.querySelector('.meta').textContent = meta || '';
  const bar = el.querySelector('.progress > span');
  if (pct == null) {
    bar.style.width = '0%';
    el.querySelector('.progress').style.display = 'none';
  } else {
    el.querySelector('.progress').style.display = 'block';
    bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }
  el.style.display = 'block';
  clearTimeout(toastTimer);
  if (!sticky) {
    toastTimer = setTimeout(() => (el.style.display = 'none'), 2200);
  }
};

const hideToast = () => {
  if (toastEl) toastEl.style.display = 'none';
  clearTimeout(toastTimer);
};

// ---- optional: in-window flyout (if you’re not using popup window) ----
let flyoutEl = null;
const ensureFlyout = () => {
  if (!flyoutEl) {
    flyoutEl = document.createElement('div');
    flyoutEl.id = 'downloadFlyout';
    document.body.appendChild(flyoutEl);
  }
  return flyoutEl;
};

const humanBytes = (n) => {
  if (!Number.isFinite(n)) return '';
  const units = ['B','KB','MB','GB','TB'];
  let u = 0; let v = n;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`;
};

const renderFlyout = () => {
  if (!flyoutEl) return;
  const items = downloadsState.items.slice().sort((a,b) => (b.startedAt || 0) - (a.startedAt || 0));
  flyoutEl.innerHTML = items.map(d => {
    const total = d.totalBytes || 0;
    const got = d.receivedBytes || 0;
    const pct = total > 0 ? Math.round((got / total) * 100) : (d.state === 'completed' ? 100 : 0);
    const sub = [
      d.state === 'completed' ? 'Completed' :
      d.state === 'interrupted' ? 'Interrupted' :
      total ? `${humanBytes(got)} / ${humanBytes(total)}` : 'Starting…',
      d.fileName || d.name || ''
    ].filter(Boolean).join(' • ');

    return `
      <div class="download-item ${d.state || ''}" data-id="${d.id || ''}">
        <div class="icon">↓</div>
        <div>
          <div class="name" title="${(d.fileName || d.name || '').replace(/"/g,'&quot;')}">${d.fileName || d.name || '(file)'}</div>
          <div class="sub">${sub}</div>
        </div>
        <div class="actions">
          ${d.state === 'completed' ? `<button class="chip open" data-act="open">Open</button>` : ``}
          ${d.state === 'completed' ? `<button class="chip show" data-act="show">Show in folder</button>` : ``}
        </div>
        <div class="bar"><span style="width:${pct}%"></span></div>
      </div>
    `;
  }).join('');

  // actions
  flyoutEl.querySelectorAll('.download-item .actions .chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const host = /** @type HTMLElement */(e.currentTarget).closest('.download-item');
      const id = host?.getAttribute('data-id');
      const act = e.currentTarget.getAttribute('data-act');

      const item = downloadsState.items.find(x => String(x.id) === String(id));
      if (!item) return;

      if (act === 'open' && window.browserBridge.openDownloadedItem) {
        window.browserBridge.openDownloadedItem(item.id).catch(()=>{});
      }
      if (act === 'show') {
        if (item.savePath && window.browserBridge.revealInFolder) {
          window.browserBridge.revealInFolder(item.savePath).catch(()=>{});
        } else if (window.browserBridge.openDownloadsFolder) {
          window.browserBridge.openDownloadsFolder().catch(()=>{});
        }
      }
    });
  });
};

// toggle popup (preferred) or fallback to flyout
const toggleDownloadsUI = () => {
  if (elements.downloadButton && window.browserBridge.toggleDownloadsPopup) {
    const rect = elements.downloadButton.getBoundingClientRect();
    const bounds = { x: rect.left, y: rect.bottom + 8, width: rect.width, height: rect.height };
    window.browserBridge.toggleDownloadsPopup(bounds);
  } else {
    // fallback: in-window flyout
    const el = ensureFlyout();
    el.style.display = (el.style.display === 'block') ? 'none' : 'block';
    if (el.style.display === 'block') renderFlyout();
  }
};

elements.downloadButton?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleDownloadsUI();
});

// Seed history when app boots
if (window.browserBridge.getDownloadsHistory) {
  window.browserBridge.getDownloadsHistory().then((items) => {
    if (Array.isArray(items)) {
      downloadsState.items = items;
      downloadsState.activeCount = items.filter(d => d.state === 'progress' || d.state === 'started').length;
      renderBadge();
    }
  }).catch(()=>{});
}

// Live updates from main
if (window.browserBridge.onDownloadsUpdate) {
  window.browserBridge.onDownloadsUpdate((payload) => {
    /**
     * Expected payload shapes (from main.js):
     *  { type:'started',   id, name, fileName, totalBytes, savePath, url, startedAt }
     *  { type:'progress',  id, receivedBytes, totalBytes }
     *  { type:'completed', id, savePath, fileName, completedAt }
     *  { type:'interrupted', id, reason }
     *  { type:'removed', id }  (optional)
     */
    const idx = downloadsState.items.findIndex(x => String(x.id) === String(payload.id));
    const upsert = (obj) => {
      if (idx >= 0) downloadsState.items[idx] = { ...downloadsState.items[idx], ...obj };
      else downloadsState.items.push(obj);
    };

    if (payload.type === 'started') {
      upsert({
        ...payload,
        state: 'progress',
        receivedBytes: 0,
        totalBytes: payload.totalBytes || 0
      });
      downloadsState.activeCount = Math.max(0, downloadsState.activeCount + 1);
      renderBadge();
      showToast('Download started', payload.fileName || payload.name || '', 0, true);
    }

    if (payload.type === 'progress') {
      upsert({
        ...downloadsState.items[idx],
        ...payload,
        state: 'progress'
      });
      const total = payload.totalBytes || downloadsState.items[idx]?.totalBytes || 0;
      const got = payload.receivedBytes || 0;
      const pct = total > 0 ? Math.round((got / total) * 100) : 0;
      showToast('Downloading…', `${humanBytes(got)} / ${humanBytes(total)}`, pct, true);
      renderFlyout();
    }

    if (payload.type === 'completed') {
      upsert({
        ...downloadsState.items[idx],
        ...payload,
        state: 'completed'
      });
      downloadsState.activeCount = Math.max(0, downloadsState.activeCount - 1);
      renderBadge();
      showToast('Download complete', payload.fileName || '', null, false);
      renderFlyout();
    }

    if (payload.type === 'interrupted') {
      upsert({
        ...downloadsState.items[idx],
        ...payload,
        state: 'interrupted'
      });
      downloadsState.activeCount = Math.max(0, downloadsState.activeCount - 1);
      renderBadge();
      showToast('Download failed', payload.reason || '', null, false);
      renderFlyout();
    }

    if (payload.type === 'removed') {
      if (idx >= 0) downloadsState.items.splice(idx, 1);
      renderFlyout();
    }
  });
}

/* ===================== [/ADDED ✨ DOWNLOADS] =========================== */
/* ===================================================================== */
