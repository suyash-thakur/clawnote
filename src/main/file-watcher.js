let currentWatcher = null;
const pendingReloads = new Map();

async function watchDirectory(dirPath, mainWindow) {
  if (currentWatcher) {
    await currentWatcher.close();
    currentWatcher = null;
  }
  pendingReloads.clear();

  // Dynamic import for ESM-only chokidar v4
  const { watch } = await import('chokidar');

  currentWatcher = watch(dirPath, {
    ignored: [/(^|[/\\])\\./, '**/node_modules/**'],
    persistent: true,
    ignoreInitial: true,
    followSymlinks: false,
    depth: 10,
    usePolling: false,
  });

  currentWatcher.on('all', (event, filePath) => {
    // Only watch markdown files and directory changes
    const isMarkdown = filePath.endsWith('.md') || filePath.endsWith('.markdown');
    const isTreeEvent = event === 'addDir' || event === 'unlinkDir' || event === 'add' || event === 'unlink';

    if (!isMarkdown && !isTreeEvent) return;

    const key = `${event}:${filePath}`;
    const existing = pendingReloads.get(key);
    if (existing) clearTimeout(existing);

    pendingReloads.set(
      key,
      setTimeout(() => {
        pendingReloads.delete(key);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('fs:fileChanged', { event, path: filePath });
        }
      }, 150)
    );
  });
}

async function stopWatching() {
  if (currentWatcher) {
    await currentWatcher.close();
    currentWatcher = null;
  }
  pendingReloads.clear();
}

module.exports = { watchDirectory, stopWatching };
