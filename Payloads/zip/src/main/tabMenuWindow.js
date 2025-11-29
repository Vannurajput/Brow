// src/main/tabMenuWindow.js
const { BrowserWindow } = require('electron');
const path = require('path');

const TABMENU_WINDOW_SIZE = { width: 220, height: 180 };

let tabMenuWindow = null;
let getMainWindow = null; // set by init()

function init(getMainWindowFn) {
  getMainWindow = getMainWindowFn;
}

function ensureTabMenuWindow() {
  if (tabMenuWindow && !tabMenuWindow.isDestroyed()) return tabMenuWindow;

  const mainWindow = getMainWindow?.();
  tabMenuWindow = new BrowserWindow({
    width: TABMENU_WINDOW_SIZE.width,
    height: TABMENU_WINDOW_SIZE.height,
    frame: false,
    resizable: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    parent: mainWindow || undefined,
    skipTaskbar: true,
    hasShadow: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  tabMenuWindow.setMenuBarVisibility(false);
  tabMenuWindow.loadFile(path.join(__dirname, '../renderer/tabmenu/index.html'));
  tabMenuWindow.webContents.on('context-menu', (e) => e.preventDefault());
  tabMenuWindow.on('blur', () => tabMenuWindow && !tabMenuWindow.isDestroyed() && tabMenuWindow.hide());
  tabMenuWindow.on('closed', () => { tabMenuWindow = null; });

  return tabMenuWindow;
}

function toggle(bounds = {}, payload = {}) {
  const mainWindow = getMainWindow?.();
  const target = ensureTabMenuWindow();
  if (!target || !mainWindow) return;

  if (target.isVisible()) {
    target.hide();
    return;
  }

  const windowContentBounds = mainWindow.getContentBounds();
  const contentX = windowContentBounds.x;
  const contentY = windowContentBounds.y;
  const contentWidth = windowContentBounds.width;

  const { x = 0, y = 0, width = 40 } = bounds;

  const desiredX = contentX + x - TABMENU_WINDOW_SIZE.width + width;
  const minX = contentX + 8;
  const maxX = contentX + contentWidth - TABMENU_WINDOW_SIZE.width - 8;
  const clampedX = Math.max(minX, Math.min(desiredX, maxX));
  const clampedY = contentY + y; // allow under header so it overlays BrowserView

  target.setBounds({
    width: TABMENU_WINDOW_SIZE.width,
    height: TABMENU_WINDOW_SIZE.height,
    x: Math.round(clampedX),
    y: Math.round(clampedY)
  });

  target.webContents.send('tabmenu:open', payload);
  target.show();
  target.focus();
}

function hide() {
  if (tabMenuWindow && !tabMenuWindow.isDestroyed()) tabMenuWindow.hide();
}

function destroyIfAny() {
  if (tabMenuWindow && !tabMenuWindow.isDestroyed()) {
    tabMenuWindow.close();
    tabMenuWindow = null;
  }
}

module.exports = {
  init,
  toggle,
  hide,
  destroyIfAny,
  _ensureForTest: ensureTabMenuWindow, // optional
};
