const { contextBridge, ipcRenderer } = require('electron');

const log = (...args) => console.log('[chatBridge]', ...args);

contextBridge.exposeInMainWorld('chatBridge', {
  toggle: async () => {
    log('toggle');
    return ipcRenderer.invoke('chat:toggle');
  },
  ask: async (prompt, history = []) => {
    log('ask', { prompt, historyLen: Array.isArray(history) ? history.length : 0 });
    return ipcRenderer.invoke('chat:ask', { prompt, history });
  },
  onState: (cb) => {
    const handler = (_e, state) => typeof cb === 'function' && cb(state);
    ipcRenderer.on('chat:state', handler);
    return () => ipcRenderer.removeListener('chat:state', handler);
  }
});
