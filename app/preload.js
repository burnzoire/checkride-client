const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (data) => ipcRenderer.invoke('settings:save', data),
});

contextBridge.exposeInMainWorld('telemetry', {
  getSnapshot: () => ipcRenderer.invoke('telemetry:snapshot'),
  openSortieFile: () => ipcRenderer.invoke('sortie:open-file'),
});

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency]);
  }
});
