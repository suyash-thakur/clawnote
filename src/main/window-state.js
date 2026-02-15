const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const stateFile = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    const data = fs.readFileSync(stateFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;

  const bounds = win.getBounds();
  const state = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: win.isMaximized(),
  };

  try {
    fs.writeFileSync(stateFile, JSON.stringify(state), 'utf-8');
  } catch {
    // Ignore write errors
  }
}

module.exports = { loadWindowState, saveWindowState };
