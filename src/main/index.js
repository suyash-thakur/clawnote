const { app, BrowserWindow, nativeTheme, session } = require('electron');
const path = require('node:path');
const { registerIpcHandlers, unregisterIpcHandlers } = require('./ipc-handlers');
const { buildMenu } = require('./menu');
const { loadWindowState, saveWindowState } = require('./window-state');
const { stopWatching } = require('./file-watcher');

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

  // Set CSP via session headers (only in production)
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

  // Block navigation away from the app (but allow initial load)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServer = MAIN_WINDOW_VITE_DEV_SERVER_URL || '';
    if (url.startsWith('file://') || (isDev && url.startsWith(devServer))) {
      return; // Allow internal navigation
    }
    event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Save window state and clean up on close
  mainWindow.on('close', () => {
    saveWindowState(mainWindow);
    stopWatching();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the index.html of the app
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Unregister previous handlers before re-registering (handles macOS reactivation)
  unregisterIpcHandlers();
  registerIpcHandlers(mainWindow);

  // Build application menu
  buildMenu(mainWindow, isDev);

  // Theme change detection (remove previous listener to prevent leaks)
  if (themeHandler) {
    nativeTheme.removeListener('updated', themeHandler);
  }
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
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
