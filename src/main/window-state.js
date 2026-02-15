import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const stateFile = path.join(app.getPath('userData'), 'window-state.json');

export function loadWindowState() {
  try {
    const data = fs.readFileSync(stateFile, 'utf-8');
    const parsed = JSON.parse(data);
    return {
      x: Number.isFinite(parsed.x) ? parsed.x : undefined,
      y: Number.isFinite(parsed.y) ? parsed.y : undefined,
      width: Number.isFinite(parsed.width) && parsed.width >= 600 ? parsed.width : undefined,
      height: Number.isFinite(parsed.height) && parsed.height >= 400 ? parsed.height : undefined,
    };
  } catch {
    return {};
  }
}

export function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  try {
    fs.writeFileSync(stateFile, JSON.stringify(bounds), 'utf-8');
  } catch {
    // Ignore
  }
}
