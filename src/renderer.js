import './styles/themes.css';
import './styles/app.css';
import './styles/markdown.css';
import './styles/animations.css';
import './styles/hljs-theme.css';
import 'github-markdown-css/github-markdown.css';

import { getState, setState, subscribe } from './state.js';
import { init as initFileTree, loadDirectory, loadFile } from './components/file-tree.js';
import { init as initMarkdownRenderer } from './components/markdown-renderer.js';

// Initialize the app
async function main() {
  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');

  // Initialize components
  initFileTree(sidebar);
  initMarkdownRenderer(content);

  // Set up theme
  const systemTheme = await window.api.getSystemTheme();
  setState({ effectiveTheme: systemTheme });
  document.documentElement.setAttribute('data-theme', systemTheme);

  // Listen for theme changes
  const removeThemeListener = window.api.onThemeChanged((theme) => {
    setState({ effectiveTheme: theme });
    document.documentElement.setAttribute('data-theme', theme);
  });

  // Listen for sidebar toggle
  subscribe((changed) => {
    if (changed.includes('sidebarVisible')) {
      const { sidebarVisible } = getState();
      document.body.classList.toggle('sidebar-hidden', !sidebarVisible);
    }
  });

  // Menu: open directory
  const removeMenuOpenDir = window.api.onMenuOpenDirectory(async () => {
    const dir = await window.api.openDirectory();
    if (dir) await loadDirectory(dir);
  });

  // Menu: toggle sidebar
  const removeMenuToggleSidebar = window.api.onMenuToggleSidebar(() => {
    const { sidebarVisible } = getState();
    setState({ sidebarVisible: !sidebarVisible });
  });

  // File change watcher
  const removeFileWatcher = window.api.onFileChanged(({ event, path }) => {
    const { currentFile, currentDir } = getState();

    // If the tree structure changed, reload directory
    if (event === 'add' || event === 'unlink' || event === 'addDir' || event === 'unlinkDir') {
      if (currentDir) loadDirectory(currentDir);
      return;
    }

    // If current file changed, reload it
    if (event === 'change' && currentFile === path) {
      loadFile(path);
    }
  });

  // Handle drag and drop of directories
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

// Start
main().catch(console.error);
