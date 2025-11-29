const { BrowserWindow } = require('electron');
const path = require('path');

const GITHUB_WINDOW_SIZE = { width: 420, height: 480 };

function createGitController(getMainWindow) {
  let githubWindow = null;

  const ensureGitWindow = () => {
    if (githubWindow && !githubWindow.isDestroyed()) {
      return githubWindow;
    }

    const parent = getMainWindow?.();
    githubWindow = new BrowserWindow({
      width: GITHUB_WINDOW_SIZE.width,
      height: GITHUB_WINDOW_SIZE.height,
      frame: false,
      resizable: false,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      parent: parent || undefined,
      skipTaskbar: true,
      hasShadow: true,
      webPreferences: {
        preload: path.join(__dirname, '../../preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    githubWindow.setMenuBarVisibility(false);
    githubWindow.loadFile(path.join(__dirname, '../../renderer/github/index.html'));
    githubWindow.webContents.on('context-menu', (event) => event.preventDefault());
    githubWindow.on('blur', () => githubWindow && !githubWindow.isDestroyed() && githubWindow.hide());
    githubWindow.on('closed', () => {
      githubWindow = null;
    });

    return githubWindow;
  };

  const toggleGitWindow = (bounds = {}) => {
    const target = ensureGitWindow();
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

    const desiredX = contentX + x - GITHUB_WINDOW_SIZE.width / 2;
    const minX = contentX + 8;
    const maxX = contentX + contentWidth - GITHUB_WINDOW_SIZE.width - 8;
    const clampedX = Math.max(minX, Math.min(desiredX, maxX));

    target.setBounds({
      width: GITHUB_WINDOW_SIZE.width,
      height: GITHUB_WINDOW_SIZE.height,
      x: Math.round(clampedX),
      y: Math.round(contentY + y)
    });

    target.show();
    target.focus();
  };

  const closeGitWindow = () => {
    if (githubWindow && !githubWindow.isDestroyed()) {
      githubWindow.hide();
    }
  };

  const destroy = () => {
    if (githubWindow && !githubWindow.isDestroyed()) {
      githubWindow.close();
    }
    githubWindow = null;
  };

  return {
    toggleGitWindow,
    closeGitWindow,
    destroy,
    getWindow: () => githubWindow
  };
}

module.exports = {
  createGitController
};
