// [NEW ✨] Downloads popup logic.
// Renders list and listens for live updates from main via preload bridges.

/* [CHANGED ✨ NO-PRELOAD FALLBACK]
   When the page is opened as a full tab (BrowserView), preload isn't attached,
   so window.browserBridge is undefined. Instead of throwing, detect the bridge
   and gracefully degrade; for "Show in folder" we will postMessage the request
   to the chrome (which *does* have preload). */
const hasBridge = !!window.browserBridge; // <-- soft check

// [ADDED ✨ FULL-TAB CLASS] CSS hook for full-page layout
if (!hasBridge) {
  document.body.classList.add('full-tab');
}

// ===== [ADDED ✨ LOCAL PERSIST] simple localStorage persistence =====
const STORAGE_KEY = 'codex.downloadsHistory.v1';
const loadFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};
const saveToStorage = (arr) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr || []));
  } catch {}
};
// ===================================================================

// ===== DOM =====
const $list = document.getElementById('downloadList');
// const $footerInfo = document.getElementById('footerInfo');
const $openFolder = document.getElementById('openFolder');
const $clearCompleted = document.getElementById('clearCompleted');
const $closePopup = document.getElementById('closePopup');
const $openHistory = document.getElementById('openHistory');

// ===== State =====
const downloads = new Map(); // id -> item

// ===== Utils =====
const humanBytes = (n) => {
  if (!Number.isFinite(n)) return '';
  const units = ['B','KB','MB','GB','TB'];
  let u = 0; let v = n;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`;
};

const pct = (got, total) => {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((got / total) * 100)));
};

// ===== Render =====
const render = () => {
  const items = Array.from(downloads.values())
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

  $list.innerHTML = items.map(d => {
    const total = d.totalBytes || 0;
    const got = d.receivedBytes || 0;
    const p = d.state === 'completed' ? 100 : pct(got, total);

    const sizeLine =
      d.state === 'completed' ? humanBytes(total || got) :
      d.state === 'interrupted' ? 'Interrupted' :
      total ? `${humanBytes(got)} / ${humanBytes(total)}` : 'Starting…';

    const filename = d.fileName || d.name || '(file)';
    const safeTitle = filename.replace(/"/g,'&quot;');

    return `
      <div class="dl-item ${d.state || ''}" data-id="${d.id}">
        <div class="dl-icon">📄</div>
        <div class="dl-body">
          <div class="dl-name" title="${safeTitle}">
            ${filename}
          </div>
          <div class="dl-sub">
            <span>${sizeLine}</span>
            ${d.mimeType ? `<span class="dl-dot"></span><span>${d.mimeType}</span>` : ''}
          </div>
          <div class="dl-progress"${p >= 100 || d.state === 'interrupted' ? ' style="display:none;"' : ''}>
            <span class="dl-bar" style="width:${p}%"></span>
          </div>
        </div>
        <div class="dl-row-actions">
          <button class="row-btn" title="Show in folder" data-act="show">📂</button>
        </div>
      </div>
    `;
  }).join('');
};

// ===== Helper for "show in folder" with fallback =====
async function revealInFolder(item) {
  // happy path — mini popup has preload/bridge
  if (hasBridge) {
    try {
      await window.browserBridge.showDownloadedItemInFolder?.(item.id);
    } catch {}
    return;
  }

  // [ADDED ✨ POSTMESSAGE FALLBACK]
  // Full-tab has no preload. Ask the chrome (top window with preload)
  // to reveal the file via a postMessage. Preload will forward this to
  // ipcMain('downloads:show-in-folder', id).
  try {
    const payload = {
      __from: 'downloads-ui',
      type: 'downloads:show-in-folder',
      id: item.id,
      // including savePath helps chrome validate / disambiguate if needed
      savePath: item.savePath || null
    };
    window.top?.postMessage(payload, '*');
  } catch (e) {
    // nothing else we can do without main/preload access
    console.warn('[Downloads] Could not postMessage to top:', e);
  }
}

// ===== Delegated click =====
$list.addEventListener('click', (e) => {
  const btn = e.target.closest('.row-btn');
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const host = btn.closest('.dl-item');
  const id = host?.getAttribute('data-id');
  const item = id ? downloads.get(id) : null;
  if (!item) return;

  const act = btn.getAttribute('data-act');
  if (act === 'show') {
    revealInFolder(item); // [CHANGED ✨ use helper with fallback]
  }
});

// ===== Bootstrap with history =====
(async () => {
  try {
    // 1) hydrate from localStorage (works without preload)
    const stored = loadFromStorage();
    if (Array.isArray(stored) && stored.length) {
      stored.forEach(item => downloads.set(String(item.id), item));
      render();
    }

    // 2) if we have the bridge (popup), pull live snapshot too
    if (hasBridge) {
      const history = await window.browserBridge.getDownloads?.();
      if (Array.isArray(history)) {
        downloads.clear();
        history.forEach(item => downloads.set(String(item.id), item));
        render();
        saveToStorage(Array.from(downloads.values()));
      }
    }
  } catch {}
})();

// ===== Live updates (popup only) =====
if (hasBridge) {
  window.browserBridge.onDownloadsUpdate?.((snapshot) => {
    if (!Array.isArray(snapshot)) return;
    downloads.clear();
    snapshot.forEach(item => downloads.set(String(item.id), item));
    render();
    saveToStorage(Array.from(downloads.values()));
  });
}

// ===== Header actions =====
$openFolder?.addEventListener('click', async () => {
  const latest = Array.from(downloads.values())
    .filter(d => d.state === 'completed' && d.id != null)
    .sort((a,b) => (b.finishedAt || 0) - (a.finishedAt || 0))[0];
  if (latest) {
    revealInFolder(latest); // [CHANGED ✨ use helper with fallback]
  }
});

$clearCompleted?.addEventListener('click', async () => {
  if (hasBridge) {
    await window.browserBridge.clearDownloads?.();
  }
  const stillRunning = Array.from(downloads.values()).filter(d => d.state === 'progressing');
  downloads.clear();
  stillRunning.forEach(d => downloads.set(String(d.id), d));
  render();
  saveToStorage(stillRunning);
});

$closePopup?.addEventListener('click', () => {
  window.close();
});

$openHistory?.addEventListener('click', (e) => {
  e.preventDefault();
  if (hasBridge) {
    window.browserBridge?.downloadsOpenHistory?.();
  } else {
    // full-tab: already here, nothing to do
    console.log('[Downloads] Full history already open (full-tab).');
  }
});

// Suppress native context menu
window.addEventListener('contextmenu', (e) => e.preventDefault());

// [ADDED ✨ NO-PRELOAD FALLBACK] hide popup-only header buttons in full tab
if (!hasBridge) {
  $openFolder?.classList.add('hidden');
  $clearCompleted?.classList.add('hidden');
  $closePopup?.classList.add('hidden');
}
