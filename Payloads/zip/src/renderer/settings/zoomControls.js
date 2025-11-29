// zoomControls.js
// Isolated wiring for Settings zoom buttons using the preload zoomBridge.

const zoomOutBtn = document.getElementById('settingsZoomOut');
const zoomResetBtn = document.getElementById('settingsZoomReset');
const zoomInBtn = document.getElementById('settingsZoomIn');

const bridge = window.browserBridge?.zoomBridge;

const updateZoomLabel = async () => {
  if (!bridge || !zoomResetBtn) return;
  try {
    const factor = await bridge.get();
    const pct = Math.round((factor || 1) * 100);
    zoomResetBtn.textContent = `${pct}%`;
  } catch {
    zoomResetBtn.textContent = '100%';
  }
};

const wireButton = (el, fn) => {
  if (!el) return;
  el.addEventListener('click', fn);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fn(e);
  });
};

const init = () => {
  if (!bridge) {
    console.warn('[Settings] zoomBridge not available');
    return;
  }

  wireButton(zoomOutBtn, async (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    await bridge.out();
    updateZoomLabel();
  });

  wireButton(zoomInBtn, async (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    await bridge.in();
    updateZoomLabel();
  });

  wireButton(zoomResetBtn, async (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    await bridge.reset();
    updateZoomLabel();
  });

  updateZoomLabel();
};

init();
