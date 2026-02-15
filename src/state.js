const state = {
  currentDir: null,
  currentFile: null,
  fileTree: null,
  rawMarkdown: null,
  theme: 'system',
  effectiveTheme: 'light',
  sidebarVisible: true,
  editing: false,
  claudeTerminalVisible: false,
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return { ...state };
}

export function setState(partial) {
  const changed = Object.keys(partial);
  Object.assign(state, partial);
  listeners.forEach((fn) => {
    try {
      fn(changed);
    } catch (err) {
      console.error('State subscriber error:', err);
    }
  });
}
