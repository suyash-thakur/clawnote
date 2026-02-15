const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  openRecentDirectory: (dirPath) => ipcRenderer.invoke('dialog:openRecentDirectory', dirPath),
  getRecentDirs: () => ipcRenderer.invoke('recent:getAll'),
  clearRecentDirs: () => ipcRenderer.invoke('recent:clear'),
  readDirectory: (dirPath, depth) => ipcRenderer.invoke('fs:readDirectory', dirPath, depth),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
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

  onMenuToggleEdit: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:toggleEdit', handler);
    return () => ipcRenderer.removeListener('menu:toggleEdit', handler);
  },

  onMenuOpenRecentDirectory: (callback) => {
    const handler = (_event, dirPath) => callback(dirPath);
    ipcRenderer.on('menu:openRecentDirectory', handler);
    return () => ipcRenderer.removeListener('menu:openRecentDirectory', handler);
  },

  onMenuClearRecent: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:clearRecent', handler);
    return () => ipcRenderer.removeListener('menu:clearRecent', handler);
  },

  getSystemTheme: () => ipcRenderer.invoke('system:getTheme'),
  onThemeChanged: (callback) => {
    const handler = (_event, theme) => callback(theme);
    ipcRenderer.on('system:themeChanged', handler);
    return () => ipcRenderer.removeListener('system:themeChanged', handler);
  },

  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),

  openClaudeSession: (filePath, dirPath) =>
    ipcRenderer.invoke('claude:openSession', filePath, dirPath),

  sendClaudeInput: (data) => ipcRenderer.send('claude:pty-input', data),

  resizeClaude: (cols, rows) => ipcRenderer.send('claude:pty-resize', cols, rows),

  killClaude: () => ipcRenderer.invoke('claude:pty-kill'),

  onClaudeData: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('claude:pty-data', handler);
    return () => ipcRenderer.removeListener('claude:pty-data', handler);
  },

  onClaudeExit: (callback) => {
    const handler = (_event, exitCode) => callback(exitCode);
    ipcRenderer.on('claude:pty-exit', handler);
    return () => ipcRenderer.removeListener('claude:pty-exit', handler);
  },

  onMenuOpenClaude: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:openClaude', handler);
    return () => ipcRenderer.removeListener('menu:openClaude', handler);
  },
});
