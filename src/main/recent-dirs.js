import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const MAX_RECENT = 10;
const recentFile = path.join(app.getPath('userData'), 'recent-dirs.json');

export function getRecentDirs() {
  try {
    const data = fs.readFileSync(recentFile, 'utf-8');
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d) => typeof d === 'string').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function addRecentDir(dirPath) {
  const dirs = getRecentDirs().filter((d) => d !== dirPath);
  dirs.unshift(dirPath);
  if (dirs.length > MAX_RECENT) dirs.length = MAX_RECENT;
  try {
    fs.writeFileSync(recentFile, JSON.stringify(dirs), 'utf-8');
  } catch {
    // Ignore
  }
  return dirs;
}

export function clearRecentDirs() {
  try {
    fs.writeFileSync(recentFile, '[]', 'utf-8');
  } catch {
    // Ignore
  }
}
