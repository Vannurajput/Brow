const { BrowserWindow, dialog, session, shell, app } = require('electron');
const path = require('path');

const DOWNLOADS_WINDOW_SIZE = { width: 320, height: 240 };

function createDownloadsController({ getMainWindow, getTabManager, ipcMain, log }) {
  let downloadsWindow = null;
  let downloadCounter = 0;
  const downloadItems = new Map(); // id -> DownloadItem
  let downloadsStore = []; // plain objects for UI
  let lastDownloadDirectory = app.getPath('downloads');

  const getDownloadsSnapshot = () =>
    [...downloadsStore].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

  const upsertDownloadEntry = (id, patch) => {
    const idx = downloadsStore.findIndex((x) => x.id === id);
    if (idx === -1) {
      downloadsStore.push({ id, ...patch });
    } else {
      downloadsStore[idx] = { ...downloadsStore[idx], ...patch };
    }
  };

  const broadcastDownloads = () => {
    const mainWindow = getMainWindow?.();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('downloads:update', getDownloadsSnapshot());
    }
    if (downloadsWindow && !downloadsWindow.isDestroyed()) {
      downloadsWindow.webContents.send('downloads:update', getDownloadsSnapshot());
    }
  };

  const ensureDownloadsWindow = () => {
    if (downloadsWindow && !downloadsWindow.isDestroyed()) return downloadsWindow;

    const parent = getMainWindow?.();
    downloadsWindow = new BrowserWindow({
      width: DOWNLOADS_WINDOW_SIZE.width,
      height: DOWNLOADS_WINDOW_SIZE.height,
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

    downloadsWindow.setMenuBarVisibility(false);
    downloadsWindow.loadFile(path.join(__dirname, '../../renderer/downloads/index.html'));
    downloadsWindow.webContents.on('context-menu', (e) => e.preventDefault());
    downloadsWindow.on('blur', () => downloadsWindow && !downloadsWindow.isDestroyed() && downloadsWindow.hide());
    downloadsWindow.on('closed', () => { downloadsWindow = null; });

    downloadsWindow.webContents.once('did-finish-load', () => {
      downloadsWindow?.webContents.send('downloads:update', getDownloadsSnapshot());
    });

    return downloadsWindow;
  };

  const toggleDownloadsWindow = (bounds = {}) => {
    const win = ensureDownloadsWindow();
    const mainWindow = getMainWindow?.();
    if (!win || !mainWindow) return;

    if (win.isVisible()) {
      win.hide();
      return;
    }

    const windowContentBounds = mainWindow.getContentBounds();
    const contentX = windowContentBounds.x;
    const contentY = windowContentBounds.y;
    const contentWidth = windowContentBounds.width;
    const { x = 0, y = 0, width = 40 } = bounds;

    const desiredX = contentX + x - DOWNLOADS_WINDOW_SIZE.width + width;
    const minX = contentX + 8;
    const maxX = contentX + contentWidth - DOWNLOADS_WINDOW_SIZE.width - 8;
    const clampedX = Math.max(minX, Math.min(desiredX, maxX));
    const clampedY = contentY + y;

    win.setBounds({
      width: DOWNLOADS_WINDOW_SIZE.width,
      height: DOWNLOADS_WINDOW_SIZE.height,
      x: Math.round(clampedX),
      y: Math.round(clampedY)
    });

    win.show();
    win.focus();
    log?.('Downloads popup shown');
  };

  const setupDownloadListener = () => {
    const ses = session.defaultSession;
    if (!ses) return;

    ses.removeAllListeners('will-download');

    ses.on('will-download', (_event, item) => {
      const id = ++downloadCounter;
      downloadItems.set(id, item);

      const startedAt = Date.now();
      let fileName = item.getFilename() || 'download';
      upsertDownloadEntry(id, {
        url: item.getURL(),
        fileName,
        mimeType: item.getMimeType?.() || '',
        totalBytes: item.getTotalBytes(),
        receivedBytes: 0,
        savePath: '',
        state: 'progressing',
        startedAt,
        finishedAt: null
      });
      broadcastDownloads();

      try {
        const baseDir = lastDownloadDirectory || app.getPath('downloads');
        const defaultPath = path.join(baseDir, fileName);

        const filePath = dialog.showSaveDialogSync({
          title: 'Save As',
          defaultPath,
          buttonLabel: 'Save',
          properties: ['createDirectory', 'showOverwriteConfirmation']
        });

        if (!filePath) {
          try { item.cancel(); } catch (_) {}
          upsertDownloadEntry(id, {
            state: 'interrupted',
            finishedAt: Date.now()
          });
          broadcastDownloads();
          return;
        }

        lastDownloadDirectory = path.dirname(filePath);
        item.setSavePath(filePath);
        fileName = path.basename(filePath);

        upsertDownloadEntry(id, {
          fileName,
          savePath: filePath
        });
        broadcastDownloads();
      } catch (err) {
        try { item.cancel(); } catch (_) {}
        upsertDownloadEntry(id, {
          state: 'interrupted',
          finishedAt: Date.now()
        });
        broadcastDownloads();
        return;
      }

      item.on('updated', (_e, state) => {
        upsertDownloadEntry(id, {
          fileName: item.getFilename() || fileName,
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes(),
          state: state === 'interrupted' ? 'interrupted' : 'progressing',
          savePath: item.getSavePath?.() || ''
        });
        broadcastDownloads();
      });

      item.once('done', (_e, state) => {
        upsertDownloadEntry(id, {
          fileName: item.getFilename() || fileName,
          receivedBytes: item.getReceivedBytes?.() || undefined,
          totalBytes: item.getTotalBytes?.() || undefined,
          state,
          finishedAt: Date.now(),
          savePath: item.getSavePath?.() || ''
        });
        broadcastDownloads();
      });
    });
  };

  const fileUrl = (relPathFromMain) =>
    `file://${path.join(__dirname, relPathFromMain).replace(/\\/g, '/')}`;

  const registerIpcHandlers = () => {
    if (!ipcMain) return;

    ipcMain.handle('downloads:get', () => getDownloadsSnapshot());
    ipcMain.handle('downloads:clear', () => {
      downloadsStore = downloadsStore.filter((d) => d.state === 'progressing');
      broadcastDownloads();
    });
    ipcMain.handle('downloads:toggle-popup', (_e, bounds) => toggleDownloadsWindow(bounds));
    ipcMain.handle('downloads:open-file', (_e, id) => {
      const entry = downloadsStore.find((d) => d.id === id);
      if (entry?.savePath) return shell.openPath(entry.savePath);
    });
    ipcMain.handle('downloads:show-in-folder', (_e, id) => {
      const entry = downloadsStore.find((d) => d.id === id);
      if (entry?.savePath) shell.showItemInFolder(entry.savePath);
    });
    ipcMain.handle('downloads:cancel', (_e, id) => {
      const item = downloadItems.get(id);
      try { item?.cancel?.(); } catch {}
    });

    ipcMain.handle('downloads:open-history-tab', () => {
      const url = fileUrl('../renderer/downloads/index.html');
      const tm = getTabManager?.();
      tm?.createTab(url);
      if (downloadsWindow && !downloadsWindow.isDestroyed()) downloadsWindow.hide();
    });
  };

  const destroy = () => {
    if (downloadsWindow && !downloadsWindow.isDestroyed()) {
      downloadsWindow.close();
    }
    downloadsWindow = null;
  };

  return {
    ensureDownloadsWindow,
    toggleDownloadsWindow,
    setupDownloadListener,
    registerIpcHandlers,
    getDownloadsSnapshot,
    broadcastDownloads,
    destroy,
    getWindow: () => downloadsWindow
  };
}

module.exports = {
  createDownloadsController
};
