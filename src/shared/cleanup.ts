import { readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SESSIONS_DIR, TASKS_DIR } from './constants.js';
import { ensureDataDir } from './utils.js';

const MAX_SESSIONS = 100;
const MAX_TASKS = 500;

function cleanupDir(dir: string, max: number): number {
  ensureDataDir();
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    let removed = 0;
    if (files.length > max) {
      const toRemove = files.slice(max);
      for (const f of toRemove) {
        unlinkSync(join(dir, f.name));
        removed++;
      }
    }
    return removed;
  } catch { return 0; }
}

export function cleanupSessions(): number {
  return cleanupDir(SESSIONS_DIR, MAX_SESSIONS);
}

export function cleanupTasks(): number {
  return cleanupDir(TASKS_DIR, MAX_TASKS);
}

export function runCleanup(): { sessions: number; tasks: number } {
  return { sessions: cleanupSessions(), tasks: cleanupTasks() };
}
