import { ipcMain, dialog, nativeTheme, app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { watchDirectory } from './file-watcher.js';

let openedDirectoryReal = null;
let _isDev = false;

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
  if (_isDev && url.startsWith('http://localhost:')) return true;
  if (url.startsWith('file://')) return true;
  throw new Error('Unauthorized IPC sender');
}

async function readDirectoryRecursive(dirPath, depth = 10, currentDepth = 0) {
  if (currentDepth >= depth) return [];

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const sorted = entries
    .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

  const result = [];
  for (const entry of sorted) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      const children = await readDirectoryRecursive(fullPath, depth, currentDepth + 1);
      result.push({ name: entry.name, path: fullPath, type: 'directory', children });
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.markdown')) {
      result.push({ name: entry.name, path: fullPath, type: 'file' });
    }
  }
  return result;
}

const IPC_CHANNELS = [
  'dialog:openDirectory',
  'fs:readDirectory',
  'fs:readFile',
  'fs:watchDirectory',
  'system:getTheme',
  'app:getVersion',
  'app:getOpenedDirectory',
];

export function registerIpcHandlers(mainWindow, isDev) {
  _isDev = isDev;

  ipcMain.handle('dialog:openDirectory', async (event) => {
    validateSender(event);
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    openedDirectoryReal = await fs.realpath(result.filePaths[0]);
    watchDirectory(openedDirectoryReal, mainWindow);
    return openedDirectoryReal;
  });

  ipcMain.handle('fs:readDirectory', async (event, dirPath, depth) => {
    validateSender(event);
    const validated = await validatePath(dirPath);
    const safeDepth = Math.min(Math.max(parseInt(depth, 10) || 10, 1), 20);
    return readDirectoryRecursive(validated, safeDepth);
  });

  ipcMain.handle('fs:readFile', async (event, filePath) => {
    validateSender(event);
    const validated = await validatePath(filePath);
    if (!validated.endsWith('.md') && !validated.endsWith('.markdown')) {
      throw new Error('Can only read markdown files');
    }
    const stat = await fs.stat(validated);
    if (stat.size > 10 * 1024 * 1024) throw new Error('File too large (>10MB)');
    return fs.readFile(validated, 'utf-8');
  });

  ipcMain.handle('fs:watchDirectory', async (event, dirPath) => {
    validateSender(event);
    const validated = await validatePath(dirPath);
    watchDirectory(validated, mainWindow);
    return true;
  });

  ipcMain.handle('system:getTheme', async (event) => {
    validateSender(event);
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  ipcMain.handle('app:getVersion', async (event) => {
    validateSender(event);
    return app.getVersion();
  });

  ipcMain.handle('app:getOpenedDirectory', async (event) => {
    validateSender(event);
    return openedDirectoryReal;
  });
}

export function unregisterIpcHandlers() {
  for (const channel of IPC_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
}
