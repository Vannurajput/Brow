// src/logger.js
const electronLog = require('electron-log');

// Configure transports only once, in main process
if (process.type === 'browser') {
  const { app } = require('electron');
  const isDev = !app.isPackaged;

  // Console always shows everything while developing
  electronLog.transports.console.level = 'debug';

  // File logs: more detail in dev, less noise in production
  electronLog.transports.file.level = isDev ? 'debug' : 'info';

  // Print the dynamic log file path once so you know where it is
  const fileInfo = electronLog.transports.file.getFile();
  electronLog.info('[Logger] Log file path:', fileInfo.path);
  console.log('[Logger] Log file path:', fileInfo.path);
}

/**
 * Wrapper function so you can call log('message')
 * We forward this to electronLog.info(...)
 */
function log(...args) {
  electronLog.info(...args);
}

// Copy methods so you can still use log.debug, log.error, etc.
log.debug = electronLog.debug.bind(electronLog);
log.info = electronLog.info.bind(electronLog);
log.warn = electronLog.warn.bind(electronLog);
log.error = electronLog.error.bind(electronLog);
log.transports = electronLog.transports;

module.exports = log;
