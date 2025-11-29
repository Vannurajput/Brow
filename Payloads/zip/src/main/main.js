/**
 * main.js
 * Boots the Electron app, manages BrowserViews, popups, and IPC bridges.
 * Acts as the coordinator for tabs, window chrome, auxiliary popups, and Git actions.
 */
const { app, BrowserWindow, ipcMain, nativeTheme, Menu, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const { DEFAULT_HOME } = require('./constants');
const TabManager = require('./tabManager');
const historyStore = require('./historyStore');
const bookmarkStore = require('./bookmarkStore');
const githubManager = require('./githubManager');
const { handleExternalMessage } = require('./messageHandler');
const { createHistoryController } = require('./windows/historyWindow');
const { createBookmarkController } = require('./windows/bookmarkWindow');
const { createGitController } = require('./windows/gitWindow');
const { createSettingsController } = require('./windows/settingsWindow');
const { createDownloadsController } = require('./windows/downloadsManager');
// [ADDED - LOGGER] use shared logger (electron-log wrapper)
const log = require('../logger');

// [ADDED - TABMENU POPUP] import the small popup controller kept in a separate file
const tabMenuPopup = require('./tabMenuWindow');

const INITIAL_URL_FLAG = '--initial-url=';
const encodeInitialUrlArg = (url) => `${INITIAL_URL_FLAG}${encodeURIComponent(url)}`;
const parseInitialUrlArg = () => {
  const raw = process.argv.find((arg) => arg.startsWith(INITIAL_URL_FLAG));
  if (!raw) {
    return DEFAULT_HOME;
  }
  try {
    return decodeURIComponent(raw.slice(INITIAL_URL_FLAG.length));
  } catch {
    return DEFAULT_HOME;
  }
};

const launchNewInstance = (initialUrl) => {
  const exePath = process.execPath;
  const appPath = app.getAppPath();
  const child = spawn(exePath, [appPath, encodeInitialUrlArg(initialUrl)], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
};

let mainWindow;
let tabManager;

const getMainWindow = () => mainWindow;
const getTabManager = () => tabManager;
const historyController = createHistoryController(getMainWindow);
const bookmarkController = createBookmarkController(getMainWindow);
const gitController = createGitController(getMainWindow);
const settingsController = createSettingsController(getMainWindow);
const downloadsController = createDownloadsController({
  getMainWindow,
  getTabManager,
  ipcMain,
  log
});
downloadsController.registerIpcHandlers();
const { registerChatIpc } = require('./chatIpc');
registerChatIpc({
  ipcMain,
  getMainWindow,
  getTabManager
});

// Builds the main BrowserWindow and wires the TabManager plus lifecycle handlers.
const createWindow = (initialUrl = DEFAULT_HOME) => {
  nativeTheme.themeSource = 'light';
  log('Creating main window');

  // -------------------- [FIX �o" DRAG ON WINDOWS/LINUX] --------------------
  // Use a frameless window on Windows/Linux so CSS drag regions work.
  // Keep the normal (framed) window on macOS where hidden title bars work fine.
  const isMac = process.platform === 'darwin'; // [FIX �o" DRAG] added platform check
  // -----------------------------------------------------------------------

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 600,
    minHeight: 400,

    // [FIX �o" DRAG] Frameless on non-mac so -webkit-app-region: drag works
    frame: isMac ? true : false, // <-- added

    // Keep your existing styling; on mac we use hidden inset for nicer traffic lights
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden', // [FIX �o" DRAG] adjusted for mac
    titleBarOverlay: {
      color: '#f2f4f7',
      symbolColor: '#1c1f26',
      height: 0
    },
    backgroundColor: '#f2f4f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // [ADDED - TABMENU POPUP] give the popup module a getter for the main window
  tabMenuPopup.init(() => mainWindow);

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.webContents.on('context-menu', (event) => event.preventDefault());
  // Route Ctrl+Shift+I to the renderer DevTools so the chrome can be inspected.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isCmdOrCtrl = process.platform === 'darwin' ? input.meta : input.control;
    const isShift = input.shift;
    if (input.type === 'keyDown' && isCmdOrCtrl && input.code === 'KeyP') {
      event.preventDefault();
      tabManager?.printActive();
      return;
    }
    if (input.type === 'keyDown' && isCmdOrCtrl && isShift && (input.code === 'KeyI' || input.code === 'KeyJ')) {
      event.preventDefault();
      mainWindow.webContents.openDevTools({ mode: 'detach' });
      labelDevToolsWindow(mainWindow.webContents, 'Chrome DevTools');
      log('Renderer DevTools opened via keyboard');
    }
  });

  tabManager = new TabManager(
    mainWindow,
    (payload) => {
      if (mainWindow) {
        mainWindow.webContents.send('tabs:state', payload);
      }
    },
    historyController.broadcastHistory,
    (url) => launchNewInstance(url)
  );

  mainWindow.on('resize', () => tabManager.resizeActiveView());
  mainWindow.on('closed', () => {
    mainWindow = null;
    tabManager = null;
    historyController.destroy();
    bookmarkController.destroy();
    gitController.destroy();
    settingsController.destroy();
    tabMenuPopup.destroyIfAny();
    downloadsController.destroy();
  });

  tabManager.createInitialTab(initialUrl);
  bookmarkController.broadcastBookmarks(bookmarkStore.getAll());
};

const openPopupDevTools = () => {
  const popupWindows = [
    historyController.getWindow(),
    bookmarkController.getWindow(),
    gitController.getWindow(),
    settingsController.getWindow(),
    downloadsController.getWindow()
  ];
  popupWindows.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });
};

// Tab controls exposed to the renderer through the preload bridge.
ipcMain.handle('tabs:new', () => tabManager?.createTab(DEFAULT_HOME));
ipcMain.handle('tabs:activate', (_, tabId) => tabManager?.setActiveTab(tabId));
ipcMain.handle('tabs:close', (_, tabId) => tabManager?.destroyTab(tabId));
ipcMain.handle('tabs:navigate', (_, input) => tabManager?.navigateActiveTab(input));
ipcMain.handle('tabs:reload', () => tabManager?.reload());
ipcMain.handle('tabs:back', () => tabManager?.goBack());
ipcMain.handle('tabs:forward', () => tabManager?.goForward());
ipcMain.handle('tabs:detach', (_, tabId) => tabManager?.detachTab(tabId));
ipcMain.handle('tabs:print', () => tabManager?.printActive());
ipcMain.handle('tabs:get-zoom', () => tabManager?.getActiveZoom());
ipcMain.handle('tabs:set-zoom', (_evt, factor) => tabManager?.setActiveZoom(factor));
ipcMain.handle('tabs:zoom-in', () => tabManager?.nudgeActiveZoom(1));
ipcMain.handle('tabs:zoom-out', () => tabManager?.nudgeActiveZoom(-1));
ipcMain.handle('tabs:zoom-reset', () => tabManager?.setActiveZoom(1));
ipcMain.handle('chrome:update-offset', (_, height) => tabManager?.updateTopOffset(height));
// [ADDED] Pin / Close Others / Close Right handlers for tab context menu
ipcMain.handle('tabs:pin', (_, tabId) => tabManager?.togglePin(tabId));               // [ADDED]
ipcMain.handle('tabs:close-others', (_, tabId) => tabManager?.closeOtherTabs(tabId)); // [ADDED]
ipcMain.handle('tabs:close-right', (_, tabId) => tabManager?.closeTabsToRight(tabId)); // [ADDED]

// [ADDED �o"] Set pin state directly (used by �?ofirst-tab click pins�?? workflow)
ipcMain.handle('tabs:setPinned', (_evt, { tabId, pinned }) => {
  tabManager?.setPinned?.(tabId, pinned);
});

// [ADDED �o"] Quit whole app from renderer (used by tab close button)
ipcMain.handle('app:quit', () => {
  log('main: app.quit() requested');
  app.quit();
});

// [ADDED - TABMENU POPUP] IPC endpoints for the overlaying tab context menu
ipcMain.handle('tabmenu:toggle-popup', (_, bounds, payload) => tabMenuPopup.toggle(bounds, payload));
ipcMain.handle('tabmenu:close-popup', () => tabMenuPopup.hide());

/* ======================= [ADDED �o" NEW] ==========================
   Open a brand-new main application window when the Settings
   menu's "New Window" is clicked. We reuse your existing
   launchNewInstance() helper so the new window starts at DEFAULT_HOME.
------------------------------------------------------------------ */
ipcMain.handle('window:new', () => {
  launchNewInstance(DEFAULT_HOME);
});
/* ===================== [/ADDED �o" NEW] ========================== */

/* ================== [ADDED �o" DEFAULT BROWSER] ==================
   Handle "Set as default browser" request from Settings. We set
   ourselves as the handler for http/https and then open the OS
   settings page so the user can confirm it.
------------------------------------------------------------------ */
ipcMain.handle('app:set-default-browser', async () => {
  const result = { http: false, https: false };
  try {
    result.http = app.setAsDefaultProtocolClient('http');
    result.https = app.setAsDefaultProtocolClient('https');
  } catch (e) {
    result.error = String(e?.message || e);
  }

  // Best-effort: open OS default-apps UI so user can finish setting default
  try {
    if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:defaultapps');
    } else if (process.platform === 'darwin') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.general?DefaultWebBrowser');
    }
    // For Linux, the approach varies by distro/DE, so we skip launching a page.
  } catch (_) {
    // ignore
  }

  return result;
});
/* ================ [/ADDED �o" DEFAULT BROWSER] =================== */

// History popup coordination.
ipcMain.handle('history:get', () => historyStore.getHistory());
ipcMain.handle('history:clear', () => {
  historyStore.clear();
  log('History cleared');
  tabManager?.emitHistoryUpdate();
});
ipcMain.handle('history:toggle-popup', (_, bounds) => historyController.toggleHistoryWindow(bounds));
ipcMain.handle('history:close-popup', () => historyController.closeHistoryWindow());

// Bookmark star/popup coordination.
ipcMain.handle('bookmarks:get', () => bookmarkStore.getAll());
ipcMain.handle('bookmarks:toggle', (_, entry) => {
  const result = bookmarkStore.toggle(entry);
  log('Bookmark toggled', entry?.url);
  bookmarkController.broadcastBookmarks(bookmarkStore.getAll());
  return result;
});
ipcMain.handle('bookmarks:clear', () => {
  bookmarkStore.clear();
  log('Bookmarks cleared');
  bookmarkController.broadcastBookmarks(bookmarkStore.getAll());
});
ipcMain.handle('bookmarks:toggle-popup', (_, bounds) => bookmarkController.toggleBookmarkWindow(bounds));
ipcMain.handle('bookmarks:close-popup', () => bookmarkController.closeBookmarkWindow());

// Git integration commands for the popup UI.
ipcMain.handle('git:toggle-popup', (_, bounds) => gitController.toggleGitWindow(bounds));
ipcMain.handle('git:close-popup', () => gitController.closeGitWindow());
ipcMain.handle('settings:toggle-popup', (_, bounds) => settingsController.toggleSettingsWindow(bounds));
ipcMain.handle('settings:close-popup', () => settingsController.closeSettingsWindow());
ipcMain.handle('github:get-config', () => githubManager.loadConfig());
ipcMain.handle('github:save-config', async (_, config) => {
  const saved = await githubManager.saveConfig(config);
  return saved;
});
ipcMain.handle('github:sign-out', () => githubManager.signOut());
ipcMain.handle('github:push', async (_, payload = {}) => {
  const hasZip =
    !!payload?.zipBytes &&
    (typeof payload.zipBytes.length === 'number' || typeof payload.zipBytes.byteLength === 'number');
  log.info('[GitHub] push request received', {
    mode: hasZip ? 'zip' : 'text',
    fileName: payload?.zipFileName || undefined
  });
  try {
    const result = await githubManager.pushContent(payload);
    log.info('[GitHub] push completed', {
      mode: hasZip ? 'zip' : 'text',
      files: result?.files || (hasZip ? undefined : 1),
      bytes: result?.bytes,
      commit: result?.commit?.sha || result?.content?.sha
    });
    return result;
  } catch (error) {
    log.error('[GitHub] push failed:', error);
    throw error;
  }
});
ipcMain.handle('github:pull', async () => githubManager.pullContent());
// Title-bar proxy handlers keep the custom chrome working.
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) {
    return false;
  }
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:toggle-devtools', () => tabManager?.toggleDevTools());
ipcMain.handle('window:open-devtools', () => tabManager?.openDevTools());
ipcMain.handle('window:open-renderer-devtools', () => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    labelDevToolsWindow(mainWindow.webContents, 'Chrome DevTools');
    log('Renderer DevTools opened');
  }
});
ipcMain.handle('windows:open-popup-devtools', () => openPopupDevTools());

// Electron lifecycle bootstrapping for the app.
app.whenReady().then(() => {
  log('App ready');
  const initialUrl = parseInitialUrlArg();
  createWindow(initialUrl);

  downloadsController.setupDownloadListener();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// [CHANGED �o"] Always quit when all windows are closed (including macOS)
app.on('window-all-closed', () => {
  log('All windows closed, quitting');
  app.quit();
});

const labelDevToolsWindow = (targetWebContents, title) => {
  const devTools = targetWebContents?.devToolsWebContents;
  if (devTools && !devTools.isDestroyed()) {
    devTools.executeJavaScript(`document.title = ${JSON.stringify(title)};`).catch(() => {});
  }
};

/**
 * NEW: handle JSON string coming from the test webpage via `window.externalMessage.send(jsonText)`
 */
ipcMain.handle('external-message', async (_event, jsonText) => {
  // goes to console + main.log via logger.js
  log.info('[external-message] raw text from webpage:', jsonText);
  try {
    const data = JSON.parse(jsonText);
    // big JSON, so log at debug level
    log.debug('[external-message] parsed JSON object:', data);

    // forward into your existing message handler if available
    let result;
    if (typeof handleExternalMessage === 'function') {
      result = await handleExternalMessage(data);
    }

    return { ok: true, result };
  } catch (err) {
    log.error('[external-message] invalid JSON:', err);
    return { ok: false, error: 'Invalid JSON' };
  }
});

// Handle external / website-style messages via MessageHandler + ConnectorFactory
ipcMain.handle('external:message', async (event, message) => {
  try {
    return await handleExternalMessage(message);
  } catch (err) {
    // ✅ now logged via logger -> console + main.log
    log.error('[external:message] error:', err);
    throw err; // surface to renderer
  }
});
