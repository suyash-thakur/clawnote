import { getState, setState, subscribe } from '../state.js';

let container = null;
let unsubscribe = null;
let renderTimer = null;

export function init(el) {
  container = el;
  render();
  unsubscribe = subscribe((changed) => {
    if (changed.includes('fileTree') || changed.includes('currentFile') || changed.includes('currentDir')) {
      scheduleRender();
    }
  });
}

export function destroy() {
  if (unsubscribe) unsubscribe();
  if (renderTimer) cancelAnimationFrame(renderTimer);
  container = null;
}

function scheduleRender() {
  if (renderTimer) return;
  renderTimer = requestAnimationFrame(() => {
    renderTimer = null;
    render();
  });
}

function render() {
  if (!container) return;

  const { fileTree, currentDir, currentFile } = getState();

  if (!fileTree || !currentDir) {
    container.innerHTML = `
      <div class="file-tree-empty">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <p>Open a directory to get started</p>
        <button class="open-dir-btn" id="openDirBtn">Open Directory</button>
        <div class="shortcut-hint">&#8984;O</div>
      </div>
    `;
    const btn = container.querySelector('#openDirBtn');
    if (btn) {
      btn.addEventListener('click', async () => {
        const dir = await window.api.openDirectory();
        if (dir) await loadDirectory(dir);
      });
    }
    return;
  }

  const dirName = currentDir.split('/').pop() || currentDir;
  container.innerHTML = `
    <div class="file-tree-header">
      <span class="dir-name" title="${escapeHtml(currentDir)}">${escapeHtml(dirName)}</span>
    </div>
    <div class="file-tree-list">
      ${renderTree(fileTree, currentFile)}
    </div>
  `;

  // Attach click handlers
  container.querySelectorAll('[data-path]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const filePath = el.dataset.path;
      const type = el.dataset.type;
      if (type === 'file') {
        loadFile(filePath);
      } else if (type === 'directory') {
        el.classList.toggle('collapsed');
      }
    });
  });
}

function renderTree(nodes, activeFile) {
  if (!nodes || nodes.length === 0) return '<div class="tree-empty">No markdown files</div>';

  return nodes
    .map((node) => {
      if (node.type === 'directory') {
        return `
        <div class="tree-item tree-dir" data-path="${escapeHtml(node.path)}" data-type="directory">
          <span class="tree-icon dir-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
          <span class="tree-name">${escapeHtml(node.name)}</span>
        </div>
        <div class="tree-children">
          ${renderTree(node.children, activeFile)}
        </div>
      `;
      }
      const isActive = node.path === activeFile;
      return `
        <div class="tree-item tree-file ${isActive ? 'active' : ''}" data-path="${escapeHtml(node.path)}" data-type="file">
          <span class="tree-icon file-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </span>
          <span class="tree-name">${escapeHtml(node.name.replace(/\.(md|markdown)$/, ''))}</span>
        </div>
      `;
    })
    .join('');
}

let currentDirToken = null;

export async function loadDirectory(dirPath) {
  const token = {};
  currentDirToken = token;

  setState({ currentDir: dirPath, fileTree: null, currentFile: null, editing: false, rawMarkdown: null });
  try {
    const tree = await window.api.readDirectory(dirPath, 10);
    if (currentDirToken !== token) return;
    setState({ fileTree: tree });
  } catch (err) {
    if (currentDirToken !== token) return;
    console.error('Failed to read directory:', err);
  }
}

let currentLoadToken = null;

export function loadFile(filePath) {
  const token = {};
  currentLoadToken = token;

  setState({ currentFile: filePath, editing: false });

  window.api
    .readFile(filePath)
    .then((content) => {
      if (currentLoadToken !== token) return;
      setState({ rawMarkdown: content });
      window.dispatchEvent(new CustomEvent('file:loaded', { detail: { path: filePath, content } }));
    })
    .catch((err) => {
      if (currentLoadToken !== token) return;
      console.error('Failed to read file:', err);
      window.dispatchEvent(new CustomEvent('file:error', { detail: { path: filePath, error: err.message } }));
    });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
