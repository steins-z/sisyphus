import http from 'node:http';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { PID_FILE, SOCKET_FILE } from '../shared/constants.js';
import { ensureDataDir } from '../shared/utils.js';
import type { SystemResponse } from '../shared/types.js';

const startTime = Date.now();

function cleanup(): void {
  try { unlinkSync(PID_FILE); } catch { /* noop */ }
  try { unlinkSync(SOCKET_FILE); } catch { /* noop */ }
}

function startServer(): void {
  ensureDataDir();

  if (existsSync(SOCKET_FILE)) {
    try { unlinkSync(SOCKET_FILE); } catch { /* noop */ }
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/system') {
      const body: SystemResponse = {
        status: 'running',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        pid: process.pid,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(SOCKET_FILE, () => {
    writeFileSync(PID_FILE, String(process.pid));
  });

  const shutdown = (): void => {
    cleanup();
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
