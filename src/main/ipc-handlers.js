import { ipcMain, dialog, nativeTheme, app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import pty from 'node-pty';
import { watchDirectory } from './file-watcher.js';
import { getRecentDirs, addRecentDir, clearRecentDirs } from './recent-dirs.js';
import { buildMenu } from './menu.js';

let openedDirectoryReal = null;
let _isDev = false;
let _mainWindow = null;
let activePty = null;

import fsSync from 'node:fs';

// Packaged apps launched from Finder get a minimal PATH (/usr/bin:/bin).
// Resolve the absolute path to `claude` and the user's real shell PATH.
let _claudePath = null;
let _shellPath = null;

function resolveShellEnv() {
  if (_shellPath) return;
  const shell = process.env.SHELL || '/bin/zsh';
  try {
    // Login shell (-l) sources .zprofile/.bash_profile where PATH is set.
    // Use a marker to extract just the PATH, avoiding shell startup noise.
    const marker = `__CLAWNOTE_${Date.now()}__`;
    const out = execSync(
      `${shell} -lc 'echo ${marker}; which claude; echo $PATH; echo ${marker}'`,
      { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const lines = out.split(marker).filter(Boolean);
    if (lines.length > 0) {
      const inner = lines[0].trim().split('\n').filter(Boolean);
      if (inner.length >= 2) {
        _claudePath = inner[0]; // which claude
        _shellPath = inner[1];  // $PATH
      } else if (inner.length === 1) {
        _shellPath = inner[0];
      }
    }
  } catch {
    // Ignore — fall through to manual resolution
  }

  // If `which` didn't find claude, check common locations
  if (!_claudePath || !fsSync.existsSync(_claudePath)) {
    const home = os.homedir();
    const candidates = [
      path.join(home, '.local', 'bin', 'claude'),
      path.join(home, '.npm-global', 'bin', 'claude'),
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
    ];
    _claudePath = candidates.find((p) => {
      try { fsSync.accessSync(p, fsSync.constants.X_OK); return true; } catch { return false; }
    }) || 'claude';
  }

  if (!_shellPath) {
    const home = os.homedir();
    _shellPath = [
      path.join(home, '.local', 'bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      process.env.PATH || '/usr/bin:/bin',
    ].join(':');
  }
}

function getClaudePath() {
  resolveShellEnv();
  return _claudePath;
}

function getShellPath() {
  resolveShellEnv();
  return _shellPath;
}

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

const IPC_HANDLE_CHANNELS = [
  'dialog:openDirectory',
  'dialog:openRecentDirectory',
  'fs:readDirectory',
  'fs:readFile',
  'fs:writeFile',
  'fs:watchDirectory',
  'recent:getAll',
  'recent:clear',
  'system:getTheme',
  'app:getVersion',
  'app:getOpenedDirectory',
  'claude:openSession',
  'claude:pty-kill',
];

const IPC_ON_CHANNELS = [
  'claude:pty-input',
  'claude:pty-resize',
];

function rebuildMenu() {
  if (_mainWindow) buildMenu(_mainWindow, _isDev);
}

export function registerIpcHandlers(mainWindow, isDev) {
  _isDev = isDev;
  _mainWindow = mainWindow;

  ipcMain.handle('dialog:openDirectory', async (event) => {
    validateSender(event);
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    openedDirectoryReal = await fs.realpath(result.filePaths[0]);
    addRecentDir(openedDirectoryReal);
    rebuildMenu();
    watchDirectory(openedDirectoryReal, mainWindow);
    return openedDirectoryReal;
  });

  ipcMain.handle('dialog:openRecentDirectory', async (event, dirPath) => {
    validateSender(event);
    if (typeof dirPath !== 'string') throw new Error('Invalid path');
    let realPath;
    try {
      realPath = await fs.realpath(dirPath);
    } catch {
      throw new Error('Directory no longer exists');
    }
    const stat = await fs.stat(realPath);
    if (!stat.isDirectory()) throw new Error('Path is not a directory');
    openedDirectoryReal = realPath;
    addRecentDir(openedDirectoryReal);
    rebuildMenu();
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

  ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
    validateSender(event);
    const validated = await validatePath(filePath);
    if (!validated.endsWith('.md') && !validated.endsWith('.markdown')) {
      throw new Error('Can only write markdown files');
    }
    if (typeof content !== 'string') throw new Error('Content must be a string');
    if (content.length > 10 * 1024 * 1024) throw new Error('Content too large (>10MB)');
    await fs.writeFile(validated, content, 'utf-8');
    return true;
  });

  ipcMain.handle('fs:watchDirectory', async (event, dirPath) => {
    validateSender(event);
    const validated = await validatePath(dirPath);
    watchDirectory(validated, mainWindow);
    return true;
  });

  ipcMain.handle('recent:getAll', async (event) => {
    validateSender(event);
    return getRecentDirs();
  });

  ipcMain.handle('recent:clear', async (event) => {
    validateSender(event);
    clearRecentDirs();
    rebuildMenu();
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

  ipcMain.handle('claude:openSession', async (event, filePath, dirPath) => {
    validateSender(event);
    if (typeof dirPath !== 'string') throw new Error('dirPath must be a string');

    // Kill existing session
    if (activePty) {
      try { activePty.kill(); } catch {}
      activePty = null;
    }

    const realDir = await validatePath(dirPath);

    let fileName = null;
    if (filePath && typeof filePath === 'string') {
      const realFile = await validatePath(filePath);
      fileName = path.basename(realFile);
    }

    const systemPrompt = fileName
      ? `The user is reading ${fileName} in ClawNote. Changes you make to files are auto-reloaded in the app.`
      : 'The user is browsing files in ClawNote. Changes you make to files are auto-reloaded in the app.';

    // Build args
    const args = ['--append-system-prompt', systemPrompt];
    if (fileName) args.push(`Let's work on ${fileName}`);

    // Clean env — remove CLAUDECODE to avoid nested session error,
    // and use the user's full shell PATH so `claude` is found.
    const env = { ...process.env };
    delete env.CLAUDECODE;
    env.PATH = getShellPath();

    activePty = pty.spawn(getClaudePath(), args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: realDir,
      env,
    });

    activePty.onData((data) => {
      if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send('claude:pty-data', data);
      }
    });

    activePty.onExit(({ exitCode }) => {
      activePty = null;
      if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send('claude:pty-exit', exitCode);
      }
    });

    return true;
  });

  ipcMain.on('claude:pty-input', (event, data) => {
    validateSender(event);
    if (activePty) activePty.write(data);
  });

  ipcMain.on('claude:pty-resize', (event, cols, rows) => {
    validateSender(event);
    if (activePty) activePty.resize(cols, rows);
  });

  ipcMain.handle('claude:pty-kill', (event) => {
    validateSender(event);
    if (activePty) {
      try { activePty.kill(); } catch {}
      activePty = null;
    }
    return true;
  });
}

export function unregisterIpcHandlers() {
  for (const channel of IPC_HANDLE_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
  for (const channel of IPC_ON_CHANNELS) {
    ipcMain.removeAllListeners(channel);
  }
  if (activePty) {
    try { activePty.kill(); } catch {}
    activePty = null;
  }
}
