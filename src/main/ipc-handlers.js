const { ipcMain, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { watchDirectory, stopWatching } = require('./file-watcher');

let openedDirectoryReal = null;

async function validatePath(filePath) {
  if (!openedDirectoryReal) throw new Error('No directory opened');
  const resolved = path.resolve(filePath);
  let realPath;
  try {
    realPath = await fs.realpath(resolved);
  } catch {
    throw new Error('Access denied: path does not exist');
  }
  const rootWithSep = openedDirectoryReal.endsWith(path.sep)
    ? openedDirectoryReal
    : openedDirectoryReal + path.sep;
  if (!realPath.startsWith(rootWithSep) && realPath !== openedDirectoryReal) {
    throw new Error('Access denied: path outside opened directory');
  }
  return realPath;
}

function validateSender(event) {
  const url = event.senderFrame?.url || '';
  // Allow dev server and file:// URLs
  if (url.startsWith('http://localhost:') || url.startsWith('file://')) {
    return true;
  }
  throw new Error('Unauthorized IPC sender');
}

async function readDirectoryRecursive(dirPath, depth = 10, currentDepth = 0) {
  if (currentDepth >= depth) return [];

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result = [];

  // Sort: directories first, then files, alphabetically within each group
  const sorted = entries
    .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

  for (const entry of sorted) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const children = await readDirectoryRecursive(fullPath, depth, currentDepth + 1);
      result.push({ name: entry.name, path: fullPath, type: 'directory', children });
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.markdown')) {
      result.push({ name: entry.name, path: fullPath, type: 'file' });
    }
  }

  return result;
}

function registerIpcHandlers(mainWindow) {
  ipcMain.handle('dialog:openDirectory', async (event) => {
    validateSender(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const dirPath = result.filePaths[0];
    openedDirectoryReal = await fs.realpath(dirPath);

    // Start watching
    watchDirectory(openedDirectoryReal, mainWindow);

    return openedDirectoryReal;
  });

  ipcMain.handle('fs:readDirectory', async (event, dirPath, depth) => {
    validateSender(event);
    const validated = await validatePath(dirPath);
    return readDirectoryRecursive(validated, depth || 10);
  });

  ipcMain.handle('fs:readFile', async (event, filePath) => {
    validateSender(event);
    const validated = await validatePath(filePath);
    const stat = await fs.stat(validated);
    // Limit file size to 10MB
    if (stat.size > 10 * 1024 * 1024) {
      throw new Error('File too large (>10MB)');
    }
    return fs.readFile(validated, 'utf-8');
  });

  ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
    validateSender(event);
    const validated = await validatePath(filePath);
    await fs.writeFile(validated, content, 'utf-8');
    return true;
  });

  ipcMain.handle('fs:watchDirectory', async (event, dirPath) => {
    validateSender(event);
    const validated = await validatePath(dirPath);
    watchDirectory(validated, mainWindow);
    return true;
  });

  ipcMain.handle('system:getTheme', async (event) => {
    validateSender(event);
    const { nativeTheme } = require('electron');
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  ipcMain.handle('app:getVersion', async (event) => {
    validateSender(event);
    const { app } = require('electron');
    return app.getVersion();
  });

  ipcMain.handle('app:getOpenedDirectory', async (event) => {
    validateSender(event);
    return openedDirectoryReal;
  });
}

module.exports = { registerIpcHandlers };
