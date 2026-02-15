import { Menu, app } from 'electron';
import { getRecentDirs } from './recent-dirs.js';

export function buildMenu(mainWindow, isDev) {
  const isMac = process.platform === 'darwin';

  const recentDirs = getRecentDirs();
  const recentSubmenu = recentDirs.length > 0
    ? [
        ...recentDirs.map((dir) => {
          const name = dir.split('/').pop() || dir;
          return {
            label: name,
            toolTip: dir,
            click: () => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('menu:openRecentDirectory', dir);
              }
            },
          };
        }),
        { type: 'separator' },
        {
          label: 'Clear Recent',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:clearRecent');
            }
          },
        },
      ]
    : [{ label: 'No Recent Directories', enabled: false }];

  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' }, { type: 'separator' },
            { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
            { type: 'separator' }, { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Directory...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:openDirectory');
          },
        },
        {
          label: 'Open Recent',
          submenu: recentSubmenu,
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Toggle Edit Mode',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:toggleEdit');
          },
        },
        { type: 'separator' },
        {
          label: 'Open in Claude Code',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:openClaude');
          },
        },
        { type: 'separator' },
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:toggleSidebar');
          },
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
