/**
 * inputFormatter.js
 * Keeps the tab blank until the user types input. URLs load directly; other text goes to Google.
 */
const { DEFAULT_HOME } = require('./constants');
const log = require('../logger');

const GOOGLE_SEARCH = 'https://www.google.com/search?q=';

const formatInput = (input = DEFAULT_HOME) => {
  if (!input) {
    return DEFAULT_HOME;
  }

  const trimmed = input.trim();
  if (!trimmed || trimmed === DEFAULT_HOME || trimmed === 'about:blank') {
    return DEFAULT_HOME;
  }

  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);

  if (!trimmed.includes('.') && !hasProtocol) {
    // treat plain words as search queries
    return `${GOOGLE_SEARCH}${encodeURIComponent(trimmed)}`;
  }

  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;

  try {
    new URL(candidate); // verifies the URL structure
    return candidate;
  } catch {
    // fallback to search if the URL parser rejects it
    return `${GOOGLE_SEARCH}${encodeURIComponent(trimmed)}`;
  }
};

module.exports = {
  formatInput
};
