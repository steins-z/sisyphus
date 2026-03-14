import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SISYPHUS_DIR, DATA_DIR, SESSIONS_DIR, TASKS_DIR,
  ORCHESTRATOR_DIR, WORKERS_DIR, LOGS_DIR, CONFIG_FILE,
} from './constants.js';

const DEFAULT_CONFIG = `# Sisyphus Configuration
llm:
  provider: openai
  model: claude-opus-4.6
  baseUrl: "http://localhost:4141/v1"
  apiKey: ""

daemon:
  socketPath: ~/.sisyphus/sisyphus.sock
  dashboardPort: 3847
`;

const DEFAULT_CODER_SOUL = `You are a coding assistant. When given a task, write clean, well-structured code. Include comments. Output the complete code solution.`;

export function ensureDataDir(): void {
  const coderDir = join(WORKERS_DIR, 'coder');
  for (const dir of [
    SISYPHUS_DIR, DATA_DIR, SESSIONS_DIR, TASKS_DIR,
    ORCHESTRATOR_DIR, WORKERS_DIR, LOGS_DIR, coderDir,
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, DEFAULT_CONFIG, 'utf-8');
  }

  const coderSoulPath = join(coderDir, 'soul.md');
  if (!existsSync(coderSoulPath)) {
    writeFileSync(coderSoulPath, DEFAULT_CODER_SOUL, 'utf-8');
  }
}
