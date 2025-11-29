/**
 * bookmarkStore.js
 * Keeps track of saved bookmarks with basic toggle helpers.
 */
const MAX_BOOKMARKS = 100;

class BookmarkStore {
  constructor() {
    this.items = []; // newest-first bookmark list
  }

  // Adds a bookmark if it is not already present.
  add(entry) {
    if (!entry || !entry.url) {
      return;
    }
    if (this.items.some((item) => item.url === entry.url)) {
      return;
    }
    const normalized = {
      // store lightweight metadata so the popup can render titles
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: entry.title || entry.url,
      url: entry.url,
      timestamp: entry.timestamp || Date.now()
    };
    this.items.unshift(normalized);
    if (this.items.length > MAX_BOOKMARKS) {
      this.items.length = MAX_BOOKMARKS;
    }
  }

  // Removes a bookmark by URL.
  remove(url) {
    this.items = this.items.filter((item) => item.url !== url);
  }

  // Toggles bookmark state for the provided entry.
  toggle(entry) {
    if (!entry || !entry.url) {
      return false;
    }
    const exists = this.items.some((item) => item.url === entry.url);
    if (exists) {
      this.remove(entry.url);
      return false;
    }
    this.add(entry);
    return true;
  }

  // Drops all bookmarks.
  clear() {
    this.items = [];
  }

  // Returns a copy for renderer consumption.
  getAll() {
    return [...this.items];
  }
}

module.exports = new BookmarkStore();
