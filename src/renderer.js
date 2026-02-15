import './styles/themes.css';
import './styles/app.css';
import './styles/markdown.css';
import './styles/editor.css';
import './styles/animations.css';
import './styles/hljs-theme.css';

import { getState, setState, subscribe } from './state.js';
import { init as initFileTree, destroy as destroyFileTree, loadDirectory, loadFile } from './components/file-tree.js';
import { init as initMarkdownRenderer, destroy as destroyMarkdownRenderer } from './components/markdown-renderer.js';
import { init as initEditor, destroy as destroyEditor, save as saveEditor } from './components/editor.js';

let cleanup = null;

async function main() {
  if (cleanup) cleanup();

  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');

  initFileTree(sidebar);
  initMarkdownRenderer(content);
  initEditor(content);

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

  // Track editing state on body for CSS
  const unsubscribeEditing = subscribe((changed) => {
    if (changed.includes('editing')) {
      const { editing } = getState();
      document.body.classList.toggle('is-editing', editing);
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

  // Cmd+E toggle edit mode
  function handleGlobalKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      const { currentFile, editing } = getState();
      if (!currentFile) return;
      setState({ editing: !editing });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      const { editing } = getState();
      if (editing) {
        e.preventDefault();
        saveEditor();
      }
    }
  }
  document.addEventListener('keydown', handleGlobalKeydown);

  // Menu: toggle edit
  const removeMenuToggleEdit = window.api.onMenuToggleEdit?.(() => {
    const { currentFile, editing } = getState();
    if (!currentFile) return;
    setState({ editing: !editing });
  }) || (() => {});

  // Debounce directory reloads from file watcher
  let reloadDirTimer = null;
  const removeFileWatcher = window.api.onFileChanged(({ event, path }) => {
    const { currentFile, currentDir, editing } = getState();

    if (event === 'add' || event === 'unlink' || event === 'addDir' || event === 'unlinkDir') {
      if (currentDir) {
        clearTimeout(reloadDirTimer);
        reloadDirTimer = setTimeout(() => loadDirectory(currentDir), 300);
      }
      return;
    }

    // Don't reload current file if we're editing it
    if (event === 'change' && currentFile === path && !editing) {
      loadFile(path);
    }
  });

  // Prevent drag-and-drop
  const handleDragover = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); };
  document.addEventListener('dragover', handleDragover);
  document.addEventListener('drop', handleDrop);

  cleanup = () => {
    removeThemeListener();
    unsubscribeSidebar();
    unsubscribeEditing();
    removeMenuOpenDir();
    removeMenuToggleSidebar();
    removeMenuToggleEdit();
    removeFileWatcher();
    clearTimeout(reloadDirTimer);
    document.removeEventListener('keydown', handleGlobalKeydown);
    document.removeEventListener('dragover', handleDragover);
    document.removeEventListener('drop', handleDrop);
    destroyFileTree();
    destroyMarkdownRenderer();
    destroyEditor();
  };
}

main().catch(console.error);
