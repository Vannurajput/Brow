/**
 * historyStore.js
 * Lightweight in-memory navigation history tracker.
 */
const MAX_HISTORY_ITEMS = 50;

class HistoryStore {
  constructor() {
    this.entries = []; // holds latest navigation entries
  }

  // Normalizes entries and limits the list length.
  addEntry(entry) {
    if (!entry || !entry.url) {
      return;
    }

    // Ignore local file navigations (e.g., internal UI pages)
    if (entry.url.startsWith('file://')) {
      return;
    }

    // Skip if the last stored entry has the same URL (avoid rapid duplicates)
    if (this.entries.length && this.entries[0].url === entry.url) {
      return;
    }

    const normalized = {
      // generate a loose unique id so we can track and remove entries if needed
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: entry.title || entry.url,
      url: entry.url,
      timestamp: entry.timestamp || Date.now()
    };

    this.entries.unshift(normalized);

    if (this.entries.length > MAX_HISTORY_ITEMS) {
      this.entries.length = MAX_HISTORY_ITEMS;
    }
  }

  // Returns a snapshot for UI rendering.
  getHistory() {
    return [...this.entries]; // return a shallow copy so callers cannot mutate internal state
  }

  // Drops stored history.
  clear() {
    this.entries = []; // drop everything for a clean slate
  }
}

module.exports = new HistoryStore();
