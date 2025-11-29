const { BrowserWindow } = require('electron');
const path = require('path');
const historyStore = require('../historyStore');

const HISTORY_WINDOW_SIZE = { width: 320, height: 360 };

// Factory to manage the history popup window while avoiding direct mainWindow coupling.
function createHistoryController(getMainWindow) {
  let historyWindow = null;

  const ensureHistoryWindow = () => {
    if (historyWindow && !historyWindow.isDestroyed()) {
      return historyWindow;
    }

    const parent = getMainWindow?.();
    historyWindow = new BrowserWindow({
      width: HISTORY_WINDOW_SIZE.width,
      height: HISTORY_WINDOW_SIZE.height,
      frame: false,
      resizable: false,
      show: false,
      transparent: false,
      backgroundColor: '#ffffff',
      focusable: true,
      parent: parent || undefined,
      skipTaskbar: true,
      hasShadow: true,
      webPreferences: {
        preload: path.join(__dirname, '../../preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    historyWindow.setMenuBarVisibility(false);
    historyWindow.loadFile(path.join(__dirname, '../../renderer/history/index.html'));
    historyWindow.webContents.once('did-finish-load', () => {
      historyWindow?.webContents.send('history:update', historyStore.getHistory());
    });
    historyWindow.webContents.on('context-menu', (event) => event.preventDefault());

    historyWindow.on('blur', () => {
      if (historyWindow && !historyWindow.isDestroyed()) {
        historyWindow.hide();
      }
    });

    historyWindow.on('closed', () => {
      historyWindow = null;
    });

    return historyWindow;
  };

  const toggleHistoryWindow = (bounds = {}) => {
    const target = ensureHistoryWindow();
    const mainWindow = getMainWindow?.();
    if (!target || !mainWindow) {
      return;
    }

    if (target.isVisible()) {
      target.hide();
      return;
    }

    const windowContentBounds = mainWindow.getContentBounds();
    const contentX = windowContentBounds.x;
    const contentY = windowContentBounds.y;
    const contentWidth = windowContentBounds.width;
    const { x = 0, y = 0, width = 40 } = bounds;

    const desiredX = contentX + x - HISTORY_WINDOW_SIZE.width + width;
    const minX = contentX + 8;
    const maxX = contentX + contentWidth - HISTORY_WINDOW_SIZE.width - 8;

    const clampedX = Math.max(minX, Math.min(desiredX, maxX));
    const clampedY = contentY + y;

    target.setBounds({
      width: HISTORY_WINDOW_SIZE.width,
      height: HISTORY_WINDOW_SIZE.height,
      x: Math.round(clampedX),
      y: Math.round(clampedY)
    });

    target.webContents.send('history:update', historyStore.getHistory());
    target.show();
    target.focus();
  };

  const closeHistoryWindow = () => {
    if (historyWindow && !historyWindow.isDestroyed()) {
      historyWindow.hide();
    }
  };

  const broadcastHistory = (entries) => {
    const mainWindow = getMainWindow?.();
    if (mainWindow) {
      mainWindow.webContents.send('history:update', entries);
    }
    if (historyWindow && !historyWindow.isDestroyed()) {
      historyWindow.webContents.send('history:update', entries);
    }
  };

  const destroy = () => {
    if (historyWindow && !historyWindow.isDestroyed()) {
      historyWindow.close();
    }
    historyWindow = null;
  };

  return {
    toggleHistoryWindow,
    closeHistoryWindow,
    broadcastHistory,
    destroy,
    getWindow: () => historyWindow
  };
}

module.exports = {
  createHistoryController
};
