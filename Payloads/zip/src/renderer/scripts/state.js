/**
 * scripts/state.js
 * Central reactive snapshot mirrored from the main process.
 */
export const state = {
  tabs: [],
  activeTabId: null,
  navigation: {
    url: '',
    canGoBack: false,
    canGoForward: false
  }
};

export const applyState = (payload) => {
  state.tabs = payload.tabs;
  state.activeTabId = payload.activeTabId;
  state.navigation = payload.navigation;
};
