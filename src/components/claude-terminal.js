import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { getState, setState, subscribe } from '../state.js';

let container = null;
let terminal = null;
let fitAddon = null;
let resizeObserver = null;
let unsubscribe = null;
let removeDataListener = null;
let removeExitListener = null;
let sessionActive = false;

function getThemeColors() {
  const style = getComputedStyle(document.documentElement);
  const get = (v) => style.getPropertyValue(v).trim();
  return {
    background: get('--term-bg') || '#2a2520',
    foreground: get('--term-fg') || '#e8e0d4',
    cursor: get('--term-cursor') || '#c05d30',
    cursorAccent: get('--term-cursor-accent') || '#2a2520',
    selectionBackground: get('--term-selection') || 'rgba(192, 93, 48, 0.3)',
    black: get('--term-black') || '#1e1a16',
    brightBlack: get('--term-bright-black') || '#6b6156',
    white: get('--term-white') || '#e8e0d4',
    brightWhite: '#ffffff',
    red: get('--term-red') || '#c05d30',
    brightRed: get('--term-bright-red') || '#e08060',
    green: get('--term-green') || '#8c9440',
    brightGreen: get('--term-bright-green') || '#a8b560',
    yellow: get('--term-yellow') || '#d4a054',
    brightYellow: get('--term-bright-yellow') || '#f0c080',
    blue: get('--term-blue') || '#6a8fa0',
    brightBlue: get('--term-bright-blue') || '#8ab0c0',
    magenta: get('--term-magenta') || '#b07aa0',
    brightMagenta: get('--term-bright-magenta') || '#c89ab8',
    cyan: get('--term-cyan') || '#6a9a8a',
    brightCyan: get('--term-bright-cyan') || '#8abaa8',
  };
}

function buildHeader() {
  const header = document.createElement('div');
  header.className = 'claude-terminal-header';

  const title = document.createElement('span');
  title.className = 'claude-terminal-title';
  title.textContent = 'Claude Code';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'claude-terminal-close';
  closeBtn.title = 'Close terminal';
  closeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>`;
  closeBtn.addEventListener('click', () => {
    window.api.killClaude();
    setState({ claudeTerminalVisible: false });
  });

  header.appendChild(title);
  header.appendChild(closeBtn);
  return header;
}

function createTerminal(bodyEl) {
  terminal = new Terminal({
    theme: getThemeColors(),
    fontFamily: "'IBM Plex Mono', 'SF Mono', 'Menlo', monospace",
    fontSize: 13,
    lineHeight: 1.35,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 5000,
    allowProposedApi: true,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(bodyEl);

  // Small delay to let DOM settle before fitting
  requestAnimationFrame(() => {
    fitAddon.fit();
    window.api.resizeClaude(terminal.cols, terminal.rows);
  });

  terminal.onData((data) => {
    if (sessionActive) window.api.sendClaudeInput(data);
  });
}

function showEndedMessage(bodyEl) {
  // Keep the terminal visible but add a restart option
  const msg = document.createElement('div');
  msg.className = 'claude-terminal-ended';
  msg.innerHTML = '<span>Session ended.</span>';
  const restartBtn = document.createElement('button');
  restartBtn.textContent = 'Restart';
  restartBtn.addEventListener('click', () => {
    const { currentFile, currentDir } = getState();
    if (!currentDir) return;
    startSession(currentFile, currentDir);
  });
  msg.appendChild(restartBtn);
  bodyEl.appendChild(msg);
}

async function startSession(filePath, dirPath) {
  if (!terminal || !container) return;

  // Clear any ended messages
  const ended = container.querySelector('.claude-terminal-ended');
  if (ended) ended.remove();

  terminal.clear();
  terminal.reset();
  sessionActive = true;

  try {
    await window.api.openClaudeSession(filePath, dirPath);
    fitAddon.fit();
    window.api.resizeClaude(terminal.cols, terminal.rows);
    terminal.focus();
  } catch (err) {
    terminal.writeln(`\r\nFailed to start Claude: ${err.message}\r\n`);
    sessionActive = false;
  }
}

export function init(el) {
  container = el;

  const header = buildHeader();
  container.appendChild(header);

  const body = document.createElement('div');
  body.className = 'claude-terminal-body';
  container.appendChild(body);

  createTerminal(body);

  // Receive PTY data
  removeDataListener = window.api.onClaudeData((data) => {
    if (terminal) terminal.write(data);
  });

  // Handle PTY exit
  removeExitListener = window.api.onClaudeExit(() => {
    sessionActive = false;
    if (terminal) {
      terminal.writeln('\r\n');
      showEndedMessage(body);
    }
  });

  // Resize terminal when container resizes
  resizeObserver = new ResizeObserver(() => {
    if (fitAddon && terminal && getState().claudeTerminalVisible) {
      try {
        fitAddon.fit();
        if (sessionActive) {
          window.api.resizeClaude(terminal.cols, terminal.rows);
        }
      } catch {}
    }
  });
  resizeObserver.observe(body);

  // React to visibility + theme changes
  unsubscribe = subscribe((changed) => {
    if (changed.includes('claudeTerminalVisible')) {
      const { claudeTerminalVisible } = getState();
      document.body.classList.toggle('claude-terminal-visible', claudeTerminalVisible);
      if (claudeTerminalVisible && fitAddon) {
        requestAnimationFrame(() => {
          fitAddon.fit();
          if (sessionActive) {
            window.api.resizeClaude(terminal.cols, terminal.rows);
          }
          terminal.focus();
        });
      }
    }
    if (changed.includes('effectiveTheme') && terminal) {
      terminal.options.theme = getThemeColors();
    }
  });
}

export { startSession };

export function destroy() {
  if (unsubscribe) unsubscribe();
  if (removeDataListener) removeDataListener();
  if (removeExitListener) removeExitListener();
  if (resizeObserver) resizeObserver.disconnect();
  if (terminal) terminal.dispose();
  terminal = null;
  fitAddon = null;
  container = null;
  sessionActive = false;
}
