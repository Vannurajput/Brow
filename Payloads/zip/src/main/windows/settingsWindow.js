const { BrowserWindow } = require('electron');
const path = require('path');

const SETTINGS_WINDOW_SIZE = { width: 260, height: 380 };

function createSettingsController(getMainWindow) {
  let settingsWindow = null;

  const ensureSettingsWindow = () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      return settingsWindow;
    }

    const parent = getMainWindow?.();
    settingsWindow = new BrowserWindow({
      width: SETTINGS_WINDOW_SIZE.width,
      height: SETTINGS_WINDOW_SIZE.height,
      frame: false,
      resizable: false,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
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

    settingsWindow.setMenuBarVisibility(false);
    settingsWindow.loadFile(path.join(__dirname, '../../renderer/settings/index.html'));
    settingsWindow.on('blur', () => {
      const focused = BrowserWindow.getFocusedWindow();
      if (focused === settingsWindow) {
        return; // still within the popup
      }
      if (settingsWindow && settingsWindow.isVisible()) {
        settingsWindow.hide();
      }
    });
    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });

    return settingsWindow;
  };

  const toggleSettingsWindow = (bounds = {}) => {
    const target = ensureSettingsWindow();
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
    const { x = 0, y = 0 } = bounds;

    const desiredX = contentX + x - SETTINGS_WINDOW_SIZE.width + (bounds.width || 0);
    const minX = contentX + 8;
    const maxX = contentX + contentWidth - SETTINGS_WINDOW_SIZE.width - 8;
    const clampedX = Math.max(minX, Math.min(desiredX, maxX));

    target.setBounds({
      width: SETTINGS_WINDOW_SIZE.width,
      height: SETTINGS_WINDOW_SIZE.height,
      x: Math.round(clampedX),
      y: Math.round(contentY + y)
    });

    target.show();
    target.focus();
  };

  const closeSettingsWindow = () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.hide();
    }
  };

  const destroy = () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
    settingsWindow = null;
  };

  return {
    toggleSettingsWindow,
    closeSettingsWindow,
    destroy,
    getWindow: () => settingsWindow
  };
}

module.exports = {
  createSettingsController
};
