import http from 'node:http';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { PID_FILE, SOCKET_FILE, ORCHESTRATOR_DIR } from '../shared/constants.js';
import { ensureDataDir } from '../shared/utils.js';
import { loadConfig } from '../shared/config.js';
import { loadAgentIdentity } from '../agent/identity.js';
import { streamChat } from '../agent/llm.js';
import {
  getOrCreateActiveSession, loadSession, saveSession, listSessions,
} from '../agent/session.js';
import type { ChatMessage } from '../agent/session.js';
import type { SystemResponse } from '../shared/types.js';

const startTime = Date.now();

function cleanup(): void {
  try { unlinkSync(PID_FILE); } catch { /* noop */ }
  try { unlinkSync(SOCKET_FILE); } catch { /* noop */ }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const raw = await readBody(req);
    const { message, sessionId } = JSON.parse(raw) as { message: string; sessionId?: string };

    if (!message || typeof message !== 'string') {
      jsonResponse(res, 400, { error: 'message is required' });
      return;
    }

    const config = loadConfig();
    const session = sessionId ? (loadSession(sessionId) ?? getOrCreateActiveSession()) : getOrCreateActiveSession();
    const systemPrompt = loadAgentIdentity(ORCHESTRATOR_DIR);

    // Build messages for LLM
    const now = new Date().toISOString();
    const userMsg: ChatMessage = { role: 'user', content: message, timestamp: now };
    session.messages.push(userMsg);

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt, timestamp: now },
      ...session.messages.filter(m => m.role !== 'system'),
    ];

    // SSE response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let fullResponse = '';
    try {
      for await (const chunk of streamChat(llmMessages, config)) {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown LLM error';
      res.write(`data: ${JSON.stringify({ type: 'error', content: errorMsg })}\n\n`);
    }

    if (fullResponse) {
      session.messages.push({
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString(),
      });
    }
    saveSession(session);

    res.write(`data: ${JSON.stringify({ type: 'done', sessionId: session.id })}\n\n`);
    res.end();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Internal error';
    jsonResponse(res, 500, { error: errorMsg });
  }
}

function startServer(): void {
  ensureDataDir();

  if (existsSync(SOCKET_FILE)) {
    try { unlinkSync(SOCKET_FILE); } catch { /* noop */ }
  }

  const server = http.createServer((req, res) => {
    const url = req.url ?? '';

    if (req.method === 'GET' && url === '/api/system') {
      const body: SystemResponse = {
        status: 'running',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        pid: process.pid,
      };
      jsonResponse(res, 200, body);
      return;
    }

    if (req.method === 'POST' && url === '/api/chat') {
      handleChat(req, res).catch(() => {
        if (!res.headersSent) jsonResponse(res, 500, { error: 'Internal error' });
      });
      return;
    }

    if (req.method === 'GET' && url === '/api/sessions') {
      jsonResponse(res, 200, listSessions());
      return;
    }

    // Match /api/sessions/:id
    const sessionMatch = url.match(/^\/api\/sessions\/([a-f0-9-]+)$/);
    if (req.method === 'GET' && sessionMatch) {
      const session = loadSession(sessionMatch[1]);
      if (session) {
        jsonResponse(res, 200, session);
      } else {
        jsonResponse(res, 404, { error: 'Session not found' });
      }
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
