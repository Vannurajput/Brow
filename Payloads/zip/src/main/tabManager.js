/**
 * tabManager.js
 * Handles BrowserView lifecycle, tab bookkeeping, navigation helpers, and DevTools state.
 */
const { BrowserView } = require('electron');
const path = require('path');
const log = require('../logger'); // ⬅️ use shared logger
const { DEFAULT_HOME, TOP_BAR_HEIGHT } = require('./constants');
const historyStore = require('./historyStore');
const { formatInput } = require('./inputFormatter');

const tabLog = (...args) => log.debug('[TabManager]', ...args);

class TabManager {
  constructor(mainWindow, onStateChange, onHistoryUpdate, launchDetachedWindow) {
    this.mainWindow = mainWindow;
    this.onStateChange = onStateChange;
    this.onHistoryUpdate = onHistoryUpdate;
    this.launchDetachedWindow = launchDetachedWindow;
    this.tabs = new Map();
    this.activeTabId = null;
    this.nextTabId = 1;
    this.topOffset = TOP_BAR_HEIGHT;
    this.rightInset = 0; // reserved pixels on the right (e.g., chat panel)
    this.devToolsPinned = false;
  }

  createInitialTab(url = DEFAULT_HOME) {
    // convenience helper for the first tab on launch
    return this.createTab(url);
  }

  // Creates a BrowserView-backed tab and selects it.
  createTab(initialUrl = DEFAULT_HOME) {
    if (!this.mainWindow) {
      return null;
    }

    const tabId = this.nextTabId++;
    const view = new BrowserView({
      webPreferences: {
        preload: path.join(__dirname, '../preload/contentPreload.js'), // preload for externalMessage bridge
        nodeIntegration: false,
        contextIsolation: true,
        backgroundColor: '#f0f2f5'
      }
    });

    const tab = {
      id: tabId,
      view,
      title: 'New Tab',
      url: '',
      isPinned: false // [ADDED] default pin state for every new tab
    };

    this.tabs.set(tabId, tab);
    tabLog('Created tab', tabId);
    this.registerViewListeners(tab);

    if (initialUrl) {
      view.webContents.loadURL(formatInput(initialUrl));
    }

    this.setActiveTab(tabId);
    return tabId;
  }

  destroyTab(tabId) {
    // closes the tab and picks a fallback if needed
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return;
    }

    if (this.activeTabId === tabId) {
      this.detachCurrentView();
    }

    const contents = tab.view.webContents;
    if (contents && !contents.isDestroyed()) {
      contents.removeAllListeners();
      contents.destroy();
    }

    this.tabs.delete(tabId);
    tabLog('Destroyed tab', tabId);

    if (this.tabs.size === 0) {
      this.createTab(DEFAULT_HOME);
      return;
    }

    if (this.activeTabId === tabId) {
      const fallbackTab = Array.from(this.tabs.values()).pop();
      this.setActiveTab(fallbackTab.id);
    } else {
      this.broadcastState();
    }
  }

  setActiveTab(tabId) {
    if (!this.tabs.has(tabId)) {
      return;
    }

    this.detachCurrentView();
    this.activeTabId = tabId;
    this.attachTabView(this.tabs.get(tabId));
    if (this.devToolsPinned) {
      this.openDevTools();
    }
    this.broadcastState();
    tabLog('Activated tab', tabId);
  }

  // Ensures the BrowserView matches the window size minus chrome height.
  resizeActiveView() {
    const activeTab = this.tabs.get(this.activeTabId);
    if (!this.mainWindow || !activeTab) {
      return;
    }

    const [width, height] = this.mainWindow.getContentSize();
    activeTab.view.setBounds({
      x: 0,
      y: this.topOffset,
      width: Math.max(0, width - this.rightInset),
      height: Math.max(0, height - this.topOffset)
    });
  }

  updateTopOffset(height) {
    // called whenever the renderer reports a new chrome height
    if (typeof height === 'number' && height > 0 && height !== this.topOffset) {
      this.topOffset = height;
      this.resizeActiveView();
      tabLog('Top offset updated', height);
    }
  }

  // Reserve space on the right (e.g., chat drawer). Pass 0 to clear.
  updateRightInset(pixels) {
    const next = Math.max(0, Number(pixels) || 0);
    if (next === this.rightInset) return;
    this.rightInset = next;
    this.resizeActiveView();
    tabLog('Right inset updated', next);
  }

  // Loads the user-entered string as either URL or search.
  navigateActiveTab(input) {
    const tab = this.tabs.get(this.activeTabId);
    if (!tab) {
      return;
    }
    const target = formatInput(input || tab.url);
    tab.view.webContents.loadURL(target);
    tabLog('Navigating tab', this.activeTabId, target);
  }

  // Moves back in the history stack if available.
  goBack() {
    const tab = this.tabs.get(this.activeTabId);
    if (tab && tab.view.webContents.canGoBack()) {
      tab.view.webContents.goBack();
      tabLog('Go back', this.activeTabId);
    }
  }

  // Moves forward in the history stack if available.
  goForward() {
    const tab = this.tabs.get(this.activeTabId);
    if (tab && tab.view.webContents.canGoForward()) {
      tab.view.webContents.goForward();
      tabLog('Go forward', this.activeTabId);
    }
  }

  // Refreshes the active tab.
  reload() {
    const tab = this.tabs.get(this.activeTabId);
    if (tab) {
      tab.view.webContents.reload();
      tabLog('Reload tab', this.activeTabId);
    }
  }

  detachTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return;
    }

    const targetUrl = tab.url || DEFAULT_HOME;
    const wasActive = this.activeTabId === tabId;

    if (wasActive) {
      this.detachCurrentView();
    }

    const view = tab.view;
    const contents = view?.webContents;
    if (contents && !contents.isDestroyed()) {
      contents.removeAllListeners();
    }

    this.tabs.delete(tabId);

    if (this.tabs.size === 0) {
      this.createTab(DEFAULT_HOME);
    } else if (wasActive) {
      const fallbackTab = Array.from(this.tabs.values()).pop();
      this.setActiveTab(fallbackTab.id);
    } else {
      this.broadcastState();
    }

    if (view && typeof view.destroy === 'function') {
      view.destroy();
    }

    if (typeof this.launchDetachedWindow === 'function') {
      this.launchDetachedWindow(targetUrl);
    }
  }

  // Ensures DevTools stay visible when pinned.
  labelDevToolsInstance(targetWebContents, title = 'DevTools') {
    const devTools = targetWebContents?.devToolsWebContents;
    if (devTools && !devTools.isDestroyed()) {
      devTools.executeJavaScript(`document.title = ${JSON.stringify(title)};`).catch(() => {});
    }
  }

  openDevTools() {
    const tab = this.tabs.get(this.activeTabId);
    if (!tab) {
      return;
    }
    const { webContents } = tab.view;
    if (!webContents || webContents.isDestroyed()) {
      return;
    }
    if (!webContents.isDevToolsOpened()) {
      webContents.openDevTools({ mode: 'detach' });
      this.devToolsPinned = true;
      this.labelDevToolsInstance(webContents, 'Tab DevTools');
      tabLog('DevTools opened', this.activeTabId);
    }
  }

  // Manual toggle invoked through IPC when the user closes DevTools.
  toggleDevTools() {
    const tab = this.tabs.get(this.activeTabId);
    if (!tab) {
      return;
    }
    const { webContents } = tab.view;
    if (!webContents) {
      return;
    }
    if (webContents.isDevToolsOpened()) {
      webContents.closeDevTools();
      this.devToolsPinned = false;
      tabLog('DevTools closed', this.activeTabId);
    } else {
      webContents.openDevTools({ mode: 'detach' });
      this.devToolsPinned = true;
      this.labelDevToolsInstance(webContents, 'Tab DevTools');
      tabLog('DevTools opened', this.activeTabId);
    }
  }

  // Hooks BrowserView events so UI state and history stay in sync.
  registerViewListeners(tab) {
    const updateFromView = () => this.broadcastState();

    tab.view.webContents.on('did-start-loading', updateFromView);
    tab.view.webContents.on('did-stop-loading', () => {
      updateFromView();
      this.recordHistory(tab);
    });
    tab.view.webContents.on('page-title-updated', (_, title) => {
      tab.title = title;
      this.broadcastState();
    });
    tab.view.webContents.on('did-navigate', (_, url) => {
      tab.url = url;
      this.broadcastState();
    });
    tab.view.webContents.on('did-navigate-in-page', (_, url) => {
      tab.url = url;
      this.broadcastState();
    });
    tab.view.webContents.on('did-fail-load', (_, __, ___, validatedURL) => {
      if (validatedURL) {
        tab.url = validatedURL;
        this.broadcastState();
      }
    });
    tab.view.webContents.on('context-menu', (event) => {
      event.preventDefault();
    });

    tab.view.webContents.on('devtools-opened', () => {
      this.devToolsPinned = true;
      this.labelDevToolsInstance(tab.view.webContents, 'Tab DevTools');
    });
    tab.view.webContents.on('devtools-closed', () => {
      this.devToolsPinned = false;
    });
  }

  // Persists completed navigations (excluding blank pages).
  recordHistory(tab) {
    if (!tab || !tab.url || tab.url === 'about:blank') {
      return;
    }
    const title = tab.view.webContents.getTitle() || tab.title || tab.url;
    historyStore.addEntry({
      title,
      url: tab.url,
      timestamp: Date.now()
    });
    this.emitHistoryUpdate();
    tabLog('Recorded history', tab.url);
  }

  // Pushes latest history entries to any listening renderer.
  emitHistoryUpdate() {
    const entries = historyStore.getHistory();
    if (typeof this.onHistoryUpdate === 'function') {
      this.onHistoryUpdate(entries);
      return;
    }

    if (this.mainWindow) {
      this.mainWindow.webContents.send('history:update', entries);
    }
  }

  // Adds the BrowserView to the main window and sizes it.
  attachTabView(tab) {
    if (!this.mainWindow) {
      return;
    }

    this.mainWindow.setBrowserView(tab.view);
    tab.view.setAutoResize({ width: true, height: true });
    tab.view.setBackgroundColor('#f0f2f5');
    this.resizeActiveView();

    // IMPORTANT: Ensure the BrowserView is the focused target so clicks/scroll work
    tab.view.webContents.focus();
  }

  // Removes the current BrowserView so another can attach cleanly.
  detachCurrentView() {
    if (!this.mainWindow) {
      return;
    }
    const currentView = this.mainWindow.getBrowserView();
    if (currentView) {
      this.mainWindow.removeBrowserView(currentView);
    }
  }

  // Emits tab and navigation state back to the renderer UI.
  broadcastState() {
    if (!this.onStateChange) {
      return;
    }

    const tabsPayload = Array.from(this.tabs.values()).map((tab) => ({
      id: tab.id,
      title: tab.title || 'New Tab',
      url: tab.url,
      isLoading: tab.view.webContents.isLoading(),
      isPinned: !!tab.isPinned // [ADDED] send pin state to renderer
    }));

    const activeTab = this.tabs.get(this.activeTabId);
    const navigation = activeTab
      ? {
          url: activeTab.url,
          canGoBack: activeTab.view.webContents.canGoBack(),
          canGoForward: activeTab.view.webContents.canGoForward()
        }
      : { url: '', canGoBack: false, canGoForward: false };

    this.onStateChange({
      tabs: tabsPayload,
      activeTabId: this.activeTabId,
      navigation
    });
  }

  // ========================== [ADDED] new APIs used by main/preload/UI ==========================

  /**
   * Set pin state of a tab by id.
   */
  setPinned(tabId, pinned = true) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.isPinned = !!pinned;
    tabLog('Set pin', tabId, '->', tab.isPinned);
    this.broadcastState();
  }

  /**
   * Toggle pin state of a tab by id.
   */
  togglePin(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.isPinned = !tab.isPinned;
    tabLog('Toggled pin', tabId, '->', tab.isPinned);
    this.broadcastState();
  }

  /**
   * Close every non-pinned tab except the provided tabId.
   */
  closeOtherTabs(tabId) {
    if (!this.tabs.has(tabId)) return;

    const idsToClose = [];
    for (const [id, t] of this.tabs.entries()) {
      if (id !== tabId && !t.isPinned) {
        idsToClose.push(id);
      }
    }
    // close right-to-left to avoid churn
    idsToClose.forEach((id) => this.destroyTab(id));

    // keep focus on requested tab
    if (this.tabs.has(tabId)) {
      this.setActiveTab(tabId);
    } else if (this.tabs.size) {
      this.setActiveTab(Array.from(this.tabs.values())[0].id);
    }
  }

  /**
   * Close tabs to the right of tabId (skipping pinned tabs).
   */
  closeTabsToRight(tabId) {
    const order = Array.from(this.tabs.keys()); // insertion order (matches UI order)
    const idx = order.indexOf(tabId);
    if (idx === -1) return;

    const idsToRight = order.slice(idx + 1);
    idsToRight.forEach((id) => {
      const t = this.tabs.get(id);
      if (t && !t.isPinned) {
        this.destroyTab(id);
      }
    });

    if (this.tabs.has(tabId)) {
      this.setActiveTab(tabId);
    } else if (this.tabs.size) {
      this.setActiveTab(Array.from(this.tabs.values())[0].id);
    }
  }

  // ========================== [/ADDED] ==========================================================

  /**
   * Print the active tab's webContents.
   */
  printActive() {
    const tab = this.tabs.get(this.activeTabId);
    const wc = tab?.view?.webContents;
    if (!wc || wc.isDestroyed()) return;
    wc.print({ printBackground: true }, () => {});
  }

  /**
   * Get the active tab's zoom factor.
   */
  getActiveZoom() {
    const tab = this.tabs.get(this.activeTabId);
    const wc = tab?.view?.webContents;
    if (!wc || wc.isDestroyed()) return 1;
    return wc.getZoomFactor();
  }

  /**
   * Set the active tab's zoom factor (clamped).
   */
  setActiveZoom(factor) {
    const tab = this.tabs.get(this.activeTabId);
    const wc = tab?.view?.webContents;
    if (!wc || wc.isDestroyed()) return;
    const clamped = Math.max(0.25, Math.min(5, factor));
    wc.setZoomFactor(clamped);
  }

  /**
   * Nudge zoom by +/- step (0.1).
   */
  nudgeActiveZoom(direction = 1) {
    const current = this.getActiveZoom();
    const next = current + 0.1 * (direction >= 0 ? 1 : -1);
    this.setActiveZoom(next);
  }
}

module.exports = TabManager;
