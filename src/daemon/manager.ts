import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import http from 'node:http';
import { PID_FILE, SOCKET_FILE } from '../shared/constants.js';
import { ensureDataDir } from '../shared/utils.js';
import type { DaemonStatus } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function cleanupStaleFiles(): void {
  try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch { /* noop */ }
  try { if (existsSync(SOCKET_FILE)) unlinkSync(SOCKET_FILE); } catch { /* noop */ }
}

function getDaemonStatus(): DaemonStatus {
  if (!existsSync(PID_FILE)) {
    return { running: false };
  }
  const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    return { running: false };
  }
}

function fetchSystemStatus(): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const req = http.get(
      { socketPath: SOCKET_FILE, path: '/api/system' },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data) as Record<string, unknown>); }
          catch { resolve(null); }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
  });
}

export async function status(): Promise<void> {
  const s = getDaemonStatus();
  if (!s.running) {
    console.log('Daemon is stopped');
    return;
  }
  const info = await fetchSystemStatus();
  if (info) {
    console.log(`Daemon is running (PID: ${info.pid}, uptime: ${info.uptime}s)`);
  } else {
    console.log(`Daemon is running (PID: ${s.pid}) — could not reach API`);
  }
}

export function start(): void {
  ensureDataDir();
  const s = getDaemonStatus();
  if (s.running) {
    console.log(`Daemon is already running (PID: ${s.pid})`);
    return;
  }
  // Clean up stale files from previous unclean shutdown
  cleanupStaleFiles();

  const serverPath = join(__dirname, '..', 'daemon', 'server.js');
  const child = spawn(process.execPath, [serverPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  console.log(`Daemon starting (PID: ${child.pid})`);
}

export function stop(): void {
  const s = getDaemonStatus();
  if (!s.running || !s.pid) {
    console.log('Daemon is not running');
    return;
  }
  try {
    process.kill(s.pid, 'SIGKILL');
  } catch { /* already dead */ }
  cleanupStaleFiles();
  console.log('Daemon stopped');
}
