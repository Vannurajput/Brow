/**
 * settings/app.js
 * Simple popup that exposes chrome-level utilities.
 */
if (!window.browserBridge) {
  throw new Error('Settings bridge missing');
}

window.addEventListener('contextmenu', (event) => event.preventDefault());

const closeButton = document.getElementById('settingsClose');
const devtoolsButton = document.getElementById('settingsDevtools');
const printRow = document.getElementById('settingsPrint');
const zoomOutBtn = document.getElementById('settingsZoomOut');
const zoomResetBtn = document.getElementById('settingsZoomReset');
const zoomInBtn = document.getElementById('settingsZoomIn');

closeButton?.addEventListener('click', () => {
  window.browserBridge.closeSettingsPopup?.();
});

devtoolsButton?.addEventListener('click', () => {
  window.browserBridge.openRendererDevTools?.();
  window.browserBridge.openDevTools?.();
  window.browserBridge.openPopupDevTools?.();
});

// Print (active tab)
if (printRow && window.browserBridge && typeof window.browserBridge.printActive === 'function') {
  const handlePrint = (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    window.browserBridge.printActive();
  };
  printRow.addEventListener('click', handlePrint);
  printRow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handlePrint(e);
  });
} else {
  console.warn('[Settings] Print row or bridge not available');
}

// Zoom controls
const updateZoomLabel = async () => {
  if (!window.browserBridge?.zoomBridge || !zoomResetBtn) return;
  try {
    const factor = await window.browserBridge.zoomBridge.get();
    const pct = Math.round((factor || 1) * 100);
    zoomResetBtn.textContent = `${pct}%`;
  } catch {
    zoomResetBtn.textContent = '100%';
  }
};

if (window.browserBridge?.zoomBridge) {
  const handleOut = async (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    await window.browserBridge.zoomBridge.out();
    updateZoomLabel();
  };
  const handleIn = async (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    await window.browserBridge.zoomBridge.in();
    updateZoomLabel();
  };
  const handleReset = async (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    await window.browserBridge.zoomBridge.reset();
    updateZoomLabel();
  };

  zoomOutBtn?.addEventListener('click', handleOut);
  zoomOutBtn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handleOut(e);
  });
  zoomInBtn?.addEventListener('click', handleIn);
  zoomInBtn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handleIn(e);
  });
  zoomResetBtn?.addEventListener('click', handleReset);
  zoomResetBtn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handleReset(e);
  });

  updateZoomLabel();
} else {
  console.warn('[Settings] Zoom bridge not available');
}


// ========================= [ADDED] New Tab wiring =========================
const newTabRow = document.getElementById('settingsNewTab');

if (newTabRow && window.browserBridge && window.browserBridge.createTab) {
  const openNewTab = async (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    try {
      await window.browserBridge.createTab();      // creates a new tab
      await window.browserBridge.closeSettingsPopup?.(); // hide popup afterward
      console.log('[Settings] New Tab created from Settings popup');
    } catch (err) {
      console.error('[Settings] Failed to create new tab:', err);
    }
  };

  newTabRow.addEventListener('click', openNewTab);
  newTabRow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') openNewTab(e);
  });
} else {
  console.warn('[Settings] New Tab row or bridge not available');
}
// ======================= [/ADDED] New Tab wiring =========================



// ====================== [ADDED ✨] New Window wiring ======================
const newWindowRow = document.getElementById('settingsNewWindow');

if (newWindowRow && window.browserBridge && window.browserBridge.newWindow) {
  const openNewWindow = async (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    try {
      await window.browserBridge.newWindow();               // ask main to open new BrowserWindow
      await window.browserBridge.closeSettingsPopup?.();    // hide popup afterward
      console.log('[Settings] New Window opened from Settings popup');
    } catch (err) {
      console.error('[Settings] Failed to open new window:', err);
    }
  };

  newWindowRow.addEventListener('click', openNewWindow);
  newWindowRow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') openNewWindow(e);
  });
} else {
  console.warn('[Settings] New Window row or bridge not available');
}
// ==================== [/ADDED ✨] New Window wiring ======================



// ============== [ADDED ✨] Set as Default Browser wiring =================
const defaultBrowserRow = document.getElementById('settingsDefaultBrowser');

if (defaultBrowserRow && window.browserBridge && window.browserBridge.setDefaultBrowser) {
  const setAsDefault = async (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    try {
      await window.browserBridge.setDefaultBrowser();       // triggers OS default protocol/handler registration flow
      await window.browserBridge.closeSettingsPopup?.();    // hide popup afterward
      console.log('[Settings] Requested: set as default browser');
    } catch (err) {
      console.error('[Settings] Failed to set default browser:', err);
    }
  };

  defaultBrowserRow.addEventListener('click', setAsDefault);
  defaultBrowserRow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') setAsDefault(e);
  });
} else {
  console.warn('[Settings] Default Browser row or bridge not available');
}
// ============ [/ADDED ✨] Set as Default Browser wiring ==================



// ================ [ADDED ✨] Download → open full history tab =============
// Opens the full Downloads UI (renderer/downloads/index.html) in a NEW TAB.
// No main.js changes required: we just create a tab and navigate it to the
// local file URL, then close the settings popup.
const downloadRow = document.getElementById('settingsDownload');

if (
  downloadRow &&
  window.browserBridge &&
  typeof window.browserBridge.createTab === 'function' &&
  typeof window.browserBridge.navigate === 'function'
) {
  const openDownloadsFullPage = async (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();

    try {
      // Build a file:// URL to the downloads page relative to this settings page
      // settings:   renderer/settings/index.html
      // downloads:  renderer/downloads/index.html  ->  ../downloads/index.html
      const downloadsUrl = new URL('../downloads/index.html', window.location.href).toString();

      await window.browserBridge.createTab();           // make a new tab active
      await window.browserBridge.navigate(downloadsUrl); // navigate that tab to Downloads
      await window.browserBridge.closeSettingsPopup?.(); // close the Settings popup
      console.log('[Settings] Opened full Downloads page');
    } catch (err) {
      console.error('[Settings] Failed to open Downloads page:', err);
    }
  };

  downloadRow.addEventListener('click', openDownloadsFullPage);
  downloadRow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') openDownloadsFullPage(e);
  });
} else {
  console.warn('[Settings] Download row or required bridge methods not available');
}
// ============== [/ADDED ✨] Download → open full history tab ==============



// --- Test External Connector (mock trigger) ---
const testConnectorRow = document.getElementById('settingsTestConnector');

if (testConnectorRow && window.externalBridge && window.externalBridge.sendMessage) {
  const sendMock = async () => {
    const mockMessage = {
      type: 'GIT',
      git: {
        owner: 'Vannurajput',
        repo: 'project',
        branch: 'main',
        filePath: 'payloads/sample.json',
        commitMessage: 'chore: add mock payload'
      },
      db: {
        connectionString: 'Server=.;Database=TestDb;Trusted_Connection=True;',
        query: 'SELECT * FROM TestTable'
      },
      dbType: 'SQLServer',
      metadata: {
        source: 'settings-popup',
        createdAt: new Date().toISOString()
      }
    };

    try {
      const result = await window.externalBridge.sendMessage(mockMessage);
      console.log('[Settings] Result from MessageHandler:', result);
      alert('Mock sent. Check console/terminal logs.');
    } catch (err) {
      console.error('[Settings] Error sending mock:', err);
      alert('Error — see console.');
    }
  };

  testConnectorRow.addEventListener('click', sendMock);
  testConnectorRow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      sendMock();
    }
  });
} else {
  console.warn('[Settings] Test connector row or externalBridge not available');
}

/* ========================= [ADDED ✨ EXIT] =========================
   Wire the "Exit" menu item to close the entire application.
   Requires an element with id="settingsExit" in settings/index.html,
   and uses preload.js -> browserBridge.quitApp() -> app.quit() in main.js
------------------------------------------------------------------- */
const exitRow = document.getElementById('settingsExit');
if (exitRow && window.browserBridge && typeof window.browserBridge.quitApp === 'function') {
  const handleExit = (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    window.browserBridge.quitApp(); // closes ALL app windows and quits
  };
  exitRow.addEventListener('click', handleExit);
  exitRow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handleExit(e);
  });
} else {
  console.warn('[Settings] Exit row or quit bridge not available');
}
/* ======================= [/ADDED ✨ EXIT] ======================= */
