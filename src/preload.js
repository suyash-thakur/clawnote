const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  readDirectory: (dirPath, depth) => ipcRenderer.invoke('fs:readDirectory', dirPath, depth),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  watchDirectory: (dirPath) => ipcRenderer.invoke('fs:watchDirectory', dirPath),
  getOpenedDirectory: () => ipcRenderer.invoke('app:getOpenedDirectory'),

  onFileChanged: (callback) => {
    const handler = (_event, data) => callback({ event: data.event, path: data.path });
    ipcRenderer.on('fs:fileChanged', handler);
    return () => ipcRenderer.removeListener('fs:fileChanged', handler);
  },

  onMenuOpenDirectory: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:openDirectory', handler);
    return () => ipcRenderer.removeListener('menu:openDirectory', handler);
  },

  onMenuToggleSidebar: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:toggleSidebar', handler);
    return () => ipcRenderer.removeListener('menu:toggleSidebar', handler);
  },

  getSystemTheme: () => ipcRenderer.invoke('system:getTheme'),
  onThemeChanged: (callback) => {
    const handler = (_event, theme) => callback(theme);
    ipcRenderer.on('system:themeChanged', handler);
    return () => ipcRenderer.removeListener('system:themeChanged', handler);
  },

  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
});
