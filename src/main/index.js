import { app, BrowserWindow, nativeTheme, session } from 'electron';
import path from 'node:path';
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc-handlers.js';
import { buildMenu } from './menu.js';
import { loadWindowState, saveWindowState } from './window-state.js';
import { stopWatching } from './file-watcher.js';

let mainWindow;
let themeHandler = null;

function createWindow() {
  const windowState = loadWindowState();
  const isDev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;

  mainWindow = new BrowserWindow({
    width: windowState.width || 1200,
    height: windowState.height || 800,
    x: windowState.x,
    y: windowState.y,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1C1B19' : '#FCFAF7',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
    },
  });

  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'",
          ],
        },
      });
    });
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServer = MAIN_WINDOW_VITE_DEV_SERVER_URL || '';
    if (url.startsWith('file://') || (isDev && url.startsWith(devServer))) return;
    event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('close', () => {
    saveWindowState(mainWindow);
    stopWatching();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  unregisterIpcHandlers();
  registerIpcHandlers(mainWindow, isDev);
  buildMenu(mainWindow, isDev);

  if (themeHandler) nativeTheme.removeListener('updated', themeHandler);
  themeHandler = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('system:themeChanged', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    }
  };
  nativeTheme.on('updated', themeHandler);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
