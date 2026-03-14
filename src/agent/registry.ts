import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { WORKERS_DIR } from '../shared/constants.js';
import { ensureDataDir } from '../shared/utils.js';

export interface WorkerInfo {
  name: string;
  description: string;
}

export function listWorkers(): WorkerInfo[] {
  ensureDataDir();
  if (!existsSync(WORKERS_DIR)) return [];
  return readdirSync(WORKERS_DIR)
    .filter(name => {
      try {
        return statSync(join(WORKERS_DIR, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .map(name => {
      const soulPath = join(WORKERS_DIR, name, 'soul.md');
      let description = '';
      if (existsSync(soulPath)) {
        description = readFileSync(soulPath, 'utf-8').trim();
      }
      return { name, description };
    });
}

export function getWorkerDir(name: string): string {
  return join(WORKERS_DIR, name);
}
