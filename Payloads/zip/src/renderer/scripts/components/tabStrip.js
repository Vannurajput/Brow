/**
 * components/tabStrip.js
 * Renders tab buttons in the custom toolbar.
 */
const TAB_MIN_WIDTH = 120;   // was 48 — keep in sync with CSS --tab-min-scroll
const TAB_MAX_WIDTH = 190;
const TAB_COMPACT_THRESHOLD = 80;
const TAB_GAP = 6;
const DRAG_THRESHOLD = 12;

// [CHANGED - TABMENU POPUP] REMOVE the in-DOM context menu import
// import { createTabContextMenu } from './tabContextMenu.js';

export const initTabStrip = ({ tabContainer, newTabButton, bridge }) => {
  let latestState = null;

  // [CHANGED - TABMENU POPUP] REMOVE the shared in-DOM popup instance
  // const contextMenu = createTabContextMenu(bridge);

  // [kept] Build two internal strips (once): pinned (no scroll) + scrollable (others)
  let pinnedStrip = tabContainer.querySelector('#pinnedStrip');
  let scrollStrip = tabContainer.querySelector('#scrollStrip');
  if (!pinnedStrip || !scrollStrip) {
    pinnedStrip = document.createElement('div');
    pinnedStrip.id = 'pinnedStrip';
    scrollStrip = document.createElement('div');
    scrollStrip.id = 'scrollStrip';

    // Move any existing children into the scroll area initially
    while (tabContainer.firstChild) {
      scrollStrip.appendChild(tabContainer.firstChild);
    }
    tabContainer.appendChild(pinnedStrip);
    tabContainer.appendChild(scrollStrip);
  }

  // Optional UI bits present in your HTML template
  const tabSection = document.querySelector('.tab-section');
  const leftBtn   = document.getElementById('tabsScrollLeft');
  const rightBtn  = document.getElementById('tabsScrollRight');

  const computeTabWidth = (count) => {
    // measure width of the SCROLLING area (not the whole container)
    if (!scrollStrip || count <= 0) return TAB_MAX_WIDTH;

    const containerWidth =
      scrollStrip.clientWidth || scrollStrip.offsetWidth || 0;
    if (!containerWidth) return TAB_MAX_WIDTH;

    const totalGap = Math.max(0, (count - 1) * TAB_GAP);
    const available = Math.max(0, containerWidth - totalGap);
    const raw = Math.floor(available / count);

    // Clamp between MIN and MAX. If this returns the min, scrolling will kick in.
    return Math.max(TAB_MIN_WIDTH, Math.min(TAB_MAX_WIDTH, raw));
  };

  // ---- overflow helpers (for arrows + fade) ----
  const updateOverflow = () => {
    // overflow is based on the SCROLL STRIP only
    if (!scrollStrip || !tabSection) return;

    const hasOverflow = scrollStrip.scrollWidth > scrollStrip.clientWidth + 1;
    tabSection.classList.toggle('has-overflow', hasOverflow);

    if (leftBtn && rightBtn) {
      leftBtn.disabled  = !hasOverflow || scrollStrip.scrollLeft <= 0;
      rightBtn.disabled =
        !hasOverflow ||
        scrollStrip.scrollLeft + scrollStrip.clientWidth >=
          scrollStrip.scrollWidth - 1;
    }
  };

  const scrollByDir = (dir) => {
    // scroll only the unpinned strip
    if (!scrollStrip) return;
    const step = Math.max(120, Math.round(scrollStrip.clientWidth * 0.6));
    scrollStrip.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  // Attach arrow behavior if present
  leftBtn  && leftBtn.addEventListener('click',  () => scrollByDir(-1));
  rightBtn && rightBtn.addEventListener('click', () => scrollByDir(1));
  // listen for scroll on the scrollable strip
  scrollStrip && scrollStrip.addEventListener('scroll', updateOverflow);
  window.addEventListener('resize', updateOverflow, { passive: true });

  const render = (state) => {
    latestState = state;

    // we render into two rows, so clear both
    pinnedStrip.innerHTML = '';
    scrollStrip.innerHTML = '';

    // compute width based ONLY on UNPINNED count
    const unpinnedCount = state.tabs.filter(t => !t.isPinned).length;
    const width = computeTabWidth(unpinnedCount);
    const compact = width <= TAB_COMPACT_THRESHOLD;

    state.tabs.forEach((tab, index) => {
      const tabWrapper = document.createElement('div');
      tabWrapper.className = 'tab-wrapper';

      // Prevent shrinking below the minimum.
      // pinned = small fixed chip; unpinned = computed basis
      if (tab.isPinned) {
        tabWrapper.style.flex = '0 0 36px';
        tabWrapper.style.minWidth = '36px';
      } else {
        const basis = Math.max(width, TAB_MIN_WIDTH);
        tabWrapper.style.flex = `0 0 ${basis}px`;   // no shrink; scrolling instead
        tabWrapper.style.minWidth = `${TAB_MIN_WIDTH}px`;
      }

      const tabElement = document.createElement('div');

      // add 'pinned' class when tab.isPinned is true
      const pinnedClass = tab.isPinned ? ' pinned' : '';
      tabElement.className =
        `tab${tab.id === state.activeTabId ? ' active' : ''}` +
        `${compact ? ' compact' : ''}` +
        `${pinnedClass}`;

      tabElement.setAttribute('draggable', 'true');

      const favicon = document.createElement('span');
      favicon.className = 'tab-favicon';
      favicon.textContent = (tab.title || '•').trim().charAt(0).toUpperCase() || '●';
      tabElement.appendChild(favicon);

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = tab.title || 'New Tab';
      tabElement.appendChild(title);

      const close = document.createElement('button');
      close.className = 'tab-close';
      close.innerHTML = '&times;';
      close.title = 'Close Tab';
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        // Close only this tab
        bridge.closeTab(tab.id);
      });
      tabElement.appendChild(close);

      tabElement.addEventListener('click', () => {
        bridge.activateTab(tab.id);
      });

      // [CHANGED - TABMENU POPUP] right-click → ask MAIN to open the overlay popup window
      tabElement.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = tabElement.getBoundingClientRect();
        // This calls main -> tabMenuWindow.toggle(...) so the popup overlays BrowserView
        bridge.toggleTabMenuPopup(
          { x: rect.left, y: rect.bottom + 6, width: rect.width, height: rect.height }, // position
          { tabId: tab.id, isPinned: !!tab.isPinned }                                    // payload
        );
      });

      tabElement.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/tab-id', String(tab.id));
        event.dataTransfer.effectAllowed = 'move';
      });

      tabElement.addEventListener('dragend', (event) => {
        const { clientX, clientY } = event;
        const outside =
          clientX < -DRAG_THRESHOLD ||
          clientX > window.innerWidth + DRAG_THRESHOLD ||
          clientY < -DRAG_THRESHOLD ||
          clientY > window.innerHeight + DRAG_THRESHOLD;
        if (outside) {
          bridge.detachTab?.(tab.id);
        }
      });

      tabWrapper.appendChild(tabElement);

      // append to the correct strip so pinned tabs do NOT scroll
      if (tab.isPinned) {
        pinnedStrip.appendChild(tabWrapper);
      } else {
        scrollStrip.appendChild(tabWrapper);
      }
    });

    // After DOM updates, refresh overflow state
    requestAnimationFrame(updateOverflow);
  };

  if (newTabButton) {
    newTabButton.addEventListener('click', () => bridge.createTab());
  }

  window.addEventListener(
    'resize',
    () => {
      if (latestState) render(latestState);
    },
    { passive: true }
  );

  return { render };
};
