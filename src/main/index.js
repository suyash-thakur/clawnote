const { app, BrowserWindow, ipcMain, nativeTheme, session } = require('electron');
const path = require('node:path');
const { registerIpcHandlers } = require('./ipc-handlers');
const { buildMenu } = require('./menu');
const { loadWindowState, saveWindowState } = require('./window-state');

let mainWindow;

function createWindow() {
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    show: false,
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

  // Set CSP via session headers (relaxed in dev for Vite HMR)
  const isDev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: md-asset:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'",
          ],
        },
      });
    });
  }

  // Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Save window state on close
  mainWindow.on('close', () => {
    saveWindowState(mainWindow);
  });

  // Load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Register IPC handlers
  registerIpcHandlers(mainWindow);

  // Build application menu
  buildMenu(mainWindow);

  // Theme change detection
  nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('system:themeChanged', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    }
  });
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
