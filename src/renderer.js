import './styles/themes.css';
import './styles/app.css';
import './styles/markdown.css';
import './styles/editor.css';
import './styles/animations.css';
import './styles/hljs-theme.css';
import './styles/claude-terminal.css';

import { getState, setState, subscribe } from './state.js';
import { init as initFileTree, destroy as destroyFileTree, loadDirectory, loadFile } from './components/file-tree.js';
import { init as initMarkdownRenderer, destroy as destroyMarkdownRenderer } from './components/markdown-renderer.js';
import { init as initEditor, destroy as destroyEditor, save as saveEditor } from './components/editor.js';
import { init as initClaudeTerminal, destroy as destroyClaudeTerminal, startSession as startClaudeSession } from './components/claude-terminal.js';

let cleanup = null;

async function main() {
  if (cleanup) cleanup();

  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');

  const claudeTerminalEl = document.getElementById('claude-terminal');

  initFileTree(sidebar);
  initMarkdownRenderer(content);
  initEditor(content);
  initClaudeTerminal(claudeTerminalEl);

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

  // Cmd+S save (Cmd+E is handled by the native menu accelerator)
  function handleGlobalKeydown(e) {
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

  // Menu: open recent directory
  const removeMenuOpenRecent = window.api.onMenuOpenRecentDirectory?.(async (dirPath) => {
    try {
      const resolved = await window.api.openRecentDirectory(dirPath);
      if (resolved) await loadDirectory(resolved);
    } catch (err) {
      console.error('Failed to open recent directory:', err);
    }
  }) || (() => {});

  // Menu: clear recent
  const removeMenuClearRecent = window.api.onMenuClearRecent?.(async () => {
    await window.api.clearRecentDirs();
  }) || (() => {});

  // Menu: open Claude Code terminal
  const removeMenuOpenClaude = window.api.onMenuOpenClaude?.(async () => {
    const { currentFile, currentDir, editing } = getState();
    if (!currentDir) return;
    if (editing) setState({ editing: false });
    setState({ claudeTerminalVisible: true });
    try {
      await startClaudeSession(currentFile, currentDir);
    } catch (err) {
      console.error('Failed to open Claude Code:', err);
    }
  }) || (() => {});

  // Claude open request from file-tree button
  function handleClaudeOpenRequest() {
    const { currentFile, currentDir, editing } = getState();
    if (!currentDir) return;
    if (editing) setState({ editing: false });
    setState({ claudeTerminalVisible: true });
    startClaudeSession(currentFile, currentDir).catch((err) => {
      console.error('Failed to open Claude Code:', err);
    });
  }
  window.addEventListener('claude:open-request', handleClaudeOpenRequest);

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
    removeMenuOpenRecent();
    removeMenuOpenClaude();
    removeMenuClearRecent();
    window.removeEventListener('claude:open-request', handleClaudeOpenRequest);
    removeFileWatcher();
    clearTimeout(reloadDirTimer);
    document.removeEventListener('keydown', handleGlobalKeydown);
    document.removeEventListener('dragover', handleDragover);
    document.removeEventListener('drop', handleDrop);
    destroyFileTree();
    destroyMarkdownRenderer();
    destroyEditor();
    destroyClaudeTerminal();
  };
}

main().catch(console.error);
