import { homedir } from 'node:os';
import { join } from 'node:path';

export const SISYPHUS_DIR = join(homedir(), '.sisyphus');
export const DATA_DIR = join(SISYPHUS_DIR, 'data');
export const SESSIONS_DIR = join(DATA_DIR, 'sessions');
export const TASKS_DIR = join(DATA_DIR, 'tasks');
export const ORCHESTRATOR_DIR = join(SISYPHUS_DIR, 'orchestrator');
export const WORKERS_DIR = join(SISYPHUS_DIR, 'workers');
export const LOGS_DIR = join(SISYPHUS_DIR, 'logs');
export const PID_FILE = join(SISYPHUS_DIR, 'daemon.pid');
export const SOCKET_FILE = join(SISYPHUS_DIR, 'sisyphus.sock');
export const CONFIG_FILE = join(SISYPHUS_DIR, 'config.yaml');
