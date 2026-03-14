import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import {
  SISYPHUS_DIR, DATA_DIR, SESSIONS_DIR, TASKS_DIR,
  ORCHESTRATOR_DIR, WORKERS_DIR, LOGS_DIR, CONFIG_FILE,
} from './constants.js';

const DEFAULT_CONFIG = `# Sisyphus Configuration
llm:
  provider: openai
  model: gpt-4o
  apiKey: ""

daemon:
  socketPath: ~/.sisyphus/sisyphus.sock
`;

export function ensureDataDir(): void {
  for (const dir of [
    SISYPHUS_DIR, DATA_DIR, SESSIONS_DIR, TASKS_DIR,
    ORCHESTRATOR_DIR, WORKERS_DIR, LOGS_DIR,
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, DEFAULT_CONFIG, 'utf-8');
  }
}
