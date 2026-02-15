import './styles/themes.css';
import './styles/app.css';
import './styles/markdown.css';
import './styles/animations.css';
import './styles/hljs-theme.css';
import 'github-markdown-css/github-markdown.css';

import { getState, setState, subscribe } from './state.js';
import { init as initFileTree, destroy as destroyFileTree, loadDirectory, loadFile } from './components/file-tree.js';
import { init as initMarkdownRenderer, destroy as destroyMarkdownRenderer } from './components/markdown-renderer.js';

let cleanup = null;

async function main() {
  // Clean up previous initialization if any (handles reload)
  if (cleanup) cleanup();

  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');

  initFileTree(sidebar);
  initMarkdownRenderer(content);

  // Set up theme
  const systemTheme = await window.api.getSystemTheme();
  setState({ effectiveTheme: systemTheme });
  document.documentElement.setAttribute('data-theme', systemTheme);

  const removeThemeListener = window.api.onThemeChanged((theme) => {
    setState({ effectiveTheme: theme });
    document.documentElement.setAttribute('data-theme', theme);
  });

  const unsubscribeSidebar = subscribe((changed) => {
    if (changed.includes('sidebarVisible')) {
      const { sidebarVisible } = getState();
      document.body.classList.toggle('sidebar-hidden', !sidebarVisible);
    }
  });

  const removeMenuOpenDir = window.api.onMenuOpenDirectory(async () => {
    const dir = await window.api.openDirectory();
    if (dir) await loadDirectory(dir);
  });

  const removeMenuToggleSidebar = window.api.onMenuToggleSidebar(() => {
    const { sidebarVisible } = getState();
    setState({ sidebarVisible: !sidebarVisible });
  });

  // Debounce directory reloads from file watcher
  let reloadDirTimer = null;
  const removeFileWatcher = window.api.onFileChanged(({ event, path }) => {
    const { currentFile, currentDir } = getState();

    if (event === 'add' || event === 'unlink' || event === 'addDir' || event === 'unlinkDir') {
      if (currentDir) {
        clearTimeout(reloadDirTimer);
        reloadDirTimer = setTimeout(() => loadDirectory(currentDir), 300);
      }
      return;
    }

    if (event === 'change' && currentFile === path) {
      loadFile(path);
    }
  });

  // Prevent drag-and-drop
  const handleDragover = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener('dragover', handleDragover);
  document.addEventListener('drop', handleDrop);

  cleanup = () => {
    removeThemeListener();
    unsubscribeSidebar();
    removeMenuOpenDir();
    removeMenuToggleSidebar();
    removeFileWatcher();
    clearTimeout(reloadDirTimer);
    document.removeEventListener('dragover', handleDragover);
    document.removeEventListener('drop', handleDrop);
    destroyFileTree();
    destroyMarkdownRenderer();
  };
}

main().catch(console.error);
