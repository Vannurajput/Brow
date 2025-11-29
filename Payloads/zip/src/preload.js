/**
 * preload.js
 * Safe bridge exposing whitelisted IPC helpers to renderer code and blocking unwanted access.
 */
const { contextBridge, ipcRenderer } = require('electron');
try {
  require('./preload/bridges/chatBridge');
} catch (err) {
  console.log('[preload] chatBridge load failed:', err?.message || err);
}

contextBridge.exposeInMainWorld('browserBridge', {
  // Tab CRUD helpers
  createTab: () => ipcRenderer.invoke('tabs:new'),
  activateTab: (tabId) => ipcRenderer.invoke('tabs:activate', tabId),
  closeTab: (tabId) => ipcRenderer.invoke('tabs:close', tabId),
  navigate: (input) => ipcRenderer.invoke('tabs:navigate', input),
  reload: () => ipcRenderer.invoke('tabs:reload'),
  goBack: () => ipcRenderer.invoke('tabs:back'),
  goForward: () => ipcRenderer.invoke('tabs:forward'),
  updateTopOffset: (height) => ipcRenderer.invoke('chrome:update-offset', height),

  // [ADDED - TAB ACTIONS] context-menu operations
  pinTab: (tabId) => ipcRenderer.invoke('tabs:pin', tabId),
  closeOtherTabs: (tabId) => ipcRenderer.invoke('tabs:close-others', tabId),
  closeTabsToRight: (tabId) => ipcRenderer.invoke('tabs:close-right', tabId),

  // [ADDED ✨] direct pin state + quit app
  setTabPinned: (tabId, pinned) => ipcRenderer.invoke('tabs:setPinned', { tabId, pinned }),
  quitApp: () => ipcRenderer.invoke('app:quit'),

  // [ADDED - TABMENU] open/close the overlay popup from the main renderer
  toggleTabMenuPopup: (bounds, payload) => ipcRenderer.invoke('tabmenu:toggle-popup', bounds, payload),
  closeTabMenuPopup: () => ipcRenderer.invoke('tabmenu:close-popup'),

  // History popup helpers
  getHistory: () => ipcRenderer.invoke('history:get'),
  toggleHistoryPopup: (bounds) => ipcRenderer.invoke('history:toggle-popup', bounds),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  closeHistoryPopup: () => ipcRenderer.invoke('history:close-popup'),
  // Bookmark helpers
  getBookmarks: () => ipcRenderer.invoke('bookmarks:get'),
  toggleBookmark: (entry) => ipcRenderer.invoke('bookmarks:toggle', entry),
  clearBookmarks: () => ipcRenderer.invoke('bookmarks:clear'),
  toggleBookmarksPopup: (bounds) => ipcRenderer.invoke('bookmarks:toggle-popup', bounds),
  closeBookmarksPopup: () => ipcRenderer.invoke('bookmarks:close-popup'),
  // Git integration
  toggleGitPopup: (bounds) => ipcRenderer.invoke('git:toggle-popup', bounds),
  closeGitPopup: () => ipcRenderer.invoke('git:close-popup'),
  toggleSettingsPopup: (bounds) => ipcRenderer.invoke('settings:toggle-popup', bounds),
  closeSettingsPopup: () => ipcRenderer.invoke('settings:close-popup'),
  githubGetConfig: () => ipcRenderer.invoke('github:get-config'),
  githubSaveConfig: (config) => ipcRenderer.invoke('github:save-config', config),
  githubSignOut: () => ipcRenderer.invoke('github:sign-out'),
  githubPush: (payload) => ipcRenderer.invoke('github:push', payload),
  githubPull: () => ipcRenderer.invoke('github:pull'),
  // Window chrome proxies
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  toggleDevTools: () => ipcRenderer.invoke('window:toggle-devtools'),
  openDevTools: () => ipcRenderer.invoke('window:open-devtools'),
  openRendererDevTools: () => ipcRenderer.invoke('window:open-renderer-devtools'),
  openPopupDevTools: () => ipcRenderer.invoke('windows:open-popup-devtools'),
  detachTab: (tabId) => ipcRenderer.invoke('tabs:detach', tabId),
  printActive: () => ipcRenderer.invoke('tabs:print'),
  zoomBridge: {
    get: () => ipcRenderer.invoke('tabs:get-zoom'),
    set: (factor) => ipcRenderer.invoke('tabs:set-zoom', factor),
    in: () => ipcRenderer.invoke('tabs:zoom-in'),
    out: () => ipcRenderer.invoke('tabs:zoom-out'),
    reset: () => ipcRenderer.invoke('tabs:zoom-reset')
  },

  // 🔽🔽🔽 [ADDED ✨] open a brand-new main application window
  // This calls ipcMain.handle('window:new') in main.js
  newWindow: () => ipcRenderer.invoke('window:new'),
  // 🔼🔼🔼 [/ADDED ✨]

  // 🔽🔽🔽 [ADDED ✨ Default Browser] expose "Set as default browser"
  // Bridges to ipcMain.handle('app:set-default-browser') in main.js
  setDefaultBrowser: () => ipcRenderer.invoke('app:set-default-browser'),
  // 🔼🔼🔼 [/ADDED ✨ Default Browser]

  /* ===================== [ADDED ✨ DOWNLOADS] =====================
     Bridge methods for the Downloads feature (mini popup + history).
     These map to the ipcMain handlers added in main.js Step 1.
  ---------------------------------------------------------------- */
  getDownloads: () => ipcRenderer.invoke('downloads:get'),
  toggleDownloadsPopup: (bounds) => ipcRenderer.invoke('downloads:toggle-popup', bounds),
  clearDownloads: () => ipcRenderer.invoke('downloads:clear'),

  // [CHANGED ✨ DOWNLOADS] Rename to match popup JS
  openDownloadedItem: (id) => ipcRenderer.invoke('downloads:open-file', id),          // was openDownloadedFile
  showDownloadedItemInFolder: (id) => ipcRenderer.invoke('downloads:show-in-folder', id), // was showDownloadedInFolder

  // [KEPT for backward compatibility] old names still work if used elsewhere
  openDownloadedFile: (id) => ipcRenderer.invoke('downloads:open-file', id),          // alias
  showDownloadedInFolder: (id) => ipcRenderer.invoke('downloads:show-in-folder', id), // alias

  cancelDownload: (id) => ipcRenderer.invoke('downloads:cancel', id),

  // === [NEW ✨ FULL HISTORY TAB] open a new tab that lists all downloads
  downloadsOpenHistory: () => ipcRenderer.invoke('downloads:open-history-tab'),

  onDownloadsUpdate: (callback) => {
    const handler = (_e, payload) => {
      if (typeof callback === 'function') callback(payload);
    };
    ipcRenderer.on('downloads:update', handler);
    return () => ipcRenderer.removeListener('downloads:update', handler);
  },
  /* =================== [/ADDED ✨ DOWNLOADS] ===================== */

  // Subscriptions for renderer state updates
  onTabState: (callback) => {
    ipcRenderer.on('tabs:state', (_, payload) => {
      if (typeof callback === 'function') {
        callback(payload);
      }
    });

    return () => ipcRenderer.removeAllListeners('tabs:state');
  },
  onHistoryUpdate: (callback) => {
    ipcRenderer.on('history:update', (_, payload) => {
      if (typeof callback === 'function') {
        callback(payload);
      }
    });
    return () => ipcRenderer.removeAllListeners('history:update');
  },
  onBookmarksUpdate: (callback) => {
    ipcRenderer.on('bookmarks:update', (_, payload) => {
      if (typeof callback === 'function') {
        callback(payload);
      }
    });
    return () => ipcRenderer.removeAllListeners('bookmarks:update');
  }
});

/* 🔹 NEW: printingBridge for receipt preview & printing
   This is what printPreview.js subscribes to:
   window.printingBridge.onShowReceipt((payload) => { ... })
*/
contextBridge.exposeInMainWorld('printingBridge', {
  onShowReceipt: (callback) => {
    const handler = (_event, payload) => {
      if (typeof callback === 'function') {
        callback(payload);
      }
    };
    ipcRenderer.on('print:show-receipt', handler);

    // return unsubscribe function
    return () => ipcRenderer.removeListener('print:show-receipt', handler);
  }
});

// [ADDED - TABMENU]
// Expose a tiny bridge that is used by the TAB MENU POPUP WINDOW itself.
// The popup HTML/JS can listen for 'tabmenu:open' and close itself via IPC.
contextBridge.exposeInMainWorld('tabMenuBridge', {
  onOpen: (callback) => {
    const handler = (_, payload) => {
      if (typeof callback === 'function') callback(payload);
    };
    ipcRenderer.on('tabmenu:open', handler);
    return () => ipcRenderer.removeListener('tabmenu:open', handler);
  },
  close: () => ipcRenderer.invoke('tabmenu:close-popup')
});

// Expose a minimal bridge to simulate website → app messages.
// We'll route this to ipcMain.handle('external:message') in Step 2.
contextBridge.exposeInMainWorld('externalBridge', {
  sendMessage: (message) => ipcRenderer.invoke('external:message', message)
});


// ============================= [ADDED ✨ DOWNLOADS FULL-TAB FALLBACK] =============================
// When the Downloads page is opened as a full tab, it has no preload and cannot call browserBridge.
// That page sends window.top.postMessage({ __from:'downloads-ui', type:'downloads:show-in-folder', id })
// We listen here (in the chrome renderer that DOES have preload) and forward to the existing IPC.
// This enables the folder button to work in the full history tab without changing main.js.
window.addEventListener('message', (event) => {
  const msg = event && event.data;
  if (!msg || msg.__from !== 'downloads-ui') return;

  if (msg.type === 'downloads:show-in-folder' && msg.id != null) {
    ipcRenderer.invoke('downloads:show-in-folder', msg.id).catch(() => {});
  }
});
// =========================== [/ADDED ✨ DOWNLOADS FULL-TAB FALLBACK] ==============================
