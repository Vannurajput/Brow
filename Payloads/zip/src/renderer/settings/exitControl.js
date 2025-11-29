// exitControl.js
// Handles the Exit action from Settings to quit the whole app.

const exitRow = document.getElementById('settingsExit');

if (exitRow && window.browserBridge && typeof window.browserBridge.quitApp === 'function') {
  const handleExit = (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    console.log('[Settings] Exit clicked');
    window.browserBridge.quitApp();
  };

  exitRow.addEventListener('click', handleExit);
  exitRow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handleExit(e);
  });
} else {
  console.warn('[Settings] Exit row or quit bridge not available');
}
