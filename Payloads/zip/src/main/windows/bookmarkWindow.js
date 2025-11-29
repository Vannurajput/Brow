const { BrowserWindow } = require('electron');
const path = require('path');
const bookmarkStore = require('../bookmarkStore');

const BOOKMARK_WINDOW_SIZE = { width: 320, height: 360 };

function createBookmarkController(getMainWindow) {
  let bookmarkWindow = null;

  const ensureBookmarkWindow = () => {
    if (bookmarkWindow && !bookmarkWindow.isDestroyed()) {
      return bookmarkWindow;
    }

    const parent = getMainWindow?.();
    bookmarkWindow = new BrowserWindow({
      width: BOOKMARK_WINDOW_SIZE.width,
      height: BOOKMARK_WINDOW_SIZE.height,
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

    bookmarkWindow.setMenuBarVisibility(false);
    bookmarkWindow.loadFile(path.join(__dirname, '../../renderer/bookmarks/index.html'));
    bookmarkWindow.webContents.once('did-finish-load', () => {
      bookmarkWindow?.webContents.send('bookmarks:update', bookmarkStore.getAll());
    });
    bookmarkWindow.webContents.on('context-menu', (event) => event.preventDefault());

    bookmarkWindow.on('blur', () => {
      if (bookmarkWindow && !bookmarkWindow.isDestroyed()) {
        bookmarkWindow.hide();
      }
    });

    bookmarkWindow.on('closed', () => {
      bookmarkWindow = null;
    });

    return bookmarkWindow;
  };

  const toggleBookmarkWindow = (bounds = {}) => {
    const target = ensureBookmarkWindow();
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

    const desiredX = contentX + x - BOOKMARK_WINDOW_SIZE.width + width;
    const minX = contentX + 8;
    const maxX = contentX + contentWidth - BOOKMARK_WINDOW_SIZE.width - 8;
    const clampedX = Math.max(minX, Math.min(desiredX, maxX));
    const clampedY = contentY + y;

    target.setBounds({
      width: BOOKMARK_WINDOW_SIZE.width,
      height: BOOKMARK_WINDOW_SIZE.height,
      x: Math.round(clampedX),
      y: Math.round(clampedY)
    });

    target.webContents.send('bookmarks:update', bookmarkStore.getAll());
    target.show();
    target.focus();
  };

  const closeBookmarkWindow = () => {
    if (bookmarkWindow && !bookmarkWindow.isDestroyed()) {
      bookmarkWindow.hide();
    }
  };

  const broadcastBookmarks = (entries) => {
    const mainWindow = getMainWindow?.();
    if (mainWindow) {
      mainWindow.webContents.send('bookmarks:update', entries);
    }
    if (bookmarkWindow && !bookmarkWindow.isDestroyed()) {
      bookmarkWindow.webContents.send('bookmarks:update', entries);
    }
  };

  const destroy = () => {
    if (bookmarkWindow && !bookmarkWindow.isDestroyed()) {
      bookmarkWindow.close();
    }
    bookmarkWindow = null;
  };

  return {
    toggleBookmarkWindow,
    closeBookmarkWindow,
    broadcastBookmarks,
    destroy,
    getWindow: () => bookmarkWindow
  };
}

module.exports = {
  createBookmarkController
};
