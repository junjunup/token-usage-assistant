// Island POC (T7.1) preload: only the two messages the island page needs.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('islandPoc', {
  onLayout: (callback) => ipcRenderer.on('island:layout', (_e, value) => callback(value)),
  hover: (inside) => ipcRenderer.send('island:hover', !!inside),
});
