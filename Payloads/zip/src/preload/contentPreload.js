// src/preload/contentPreload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('externalMessage', {
  send: (jsonText) => {
    // This sends the jsonText to the main process
    return ipcRenderer.invoke('external-message', jsonText);
  }
});
