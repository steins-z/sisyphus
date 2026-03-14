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
import { createTask, saveTask, loadTask, listTasks } from '../agent/task.js';
import { spawnWorker } from '../agent/worker.js';
import type { WorkerDoneCallback } from '../agent/worker.js';
import { listWorkers } from '../agent/registry.js';

const TASK_PATTERN = /\[TASK:(\w+)\]\s*(.+)/s;

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

function buildOrchestratorPrompt(basePrompt: string): string {
  const workers = listWorkers();
  const workerList = workers.map(w => `- ${w.name}: ${w.description}`).join('\n');
  return `${basePrompt}

## Available Workers
You have the following workers available to delegate tasks to:
${workerList}

## Task Delegation
When a user asks you to write code, build something, or do any task that should be delegated to a worker, respond with the pattern:
[TASK:worker_name] detailed description of the task

For coding tasks, use [TASK:coder]. For example:
User: "Write a python calculator"
You: [TASK:coder] Write a Python calculator program that supports addition, subtraction, multiplication, and division with a clean CLI interface.

For normal conversation, questions, or clarifications, just respond normally without the [TASK:] pattern.`;
}

function findTaskByIdOrPrefix(idOrPrefix: string): ReturnType<typeof loadTask> {
  // Try exact match first
  const exact = loadTask(idOrPrefix);
  if (exact) return exact;

  // Try prefix match
  const tasks = listTasks();
  const matches = tasks.filter(t => t.id.startsWith(idOrPrefix));
  if (matches.length === 1) return matches[0];
  return null;
}

/** Mark any tasks stuck in 'running' as failed (stale from previous daemon crash) */
function cleanupStaleTasks(): void {
  const tasks = listTasks();
  for (const task of tasks) {
    if (task.status === 'running') {
      task.status = 'failed';
      task.error = 'Daemon restarted — task was orphaned';
      saveTask(task);
      console.log(`[cleanup] Marked stale task ${task.id.slice(0, 8)} as failed`);
    }
  }
}

async function handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  // Set up SSE headers early so we can always write errors
  const sseStarted = { value: false };

  try {
    const raw = await readBody(req);
    const { message, sessionId, mode } = JSON.parse(raw) as { message: string; sessionId?: string; mode?: string };

    if (!message || typeof message !== 'string') {
      jsonResponse(res, 400, { error: 'message is required' });
      return;
    }

    const config = loadConfig();
    const session = sessionId ? (loadSession(sessionId) ?? getOrCreateActiveSession()) : getOrCreateActiveSession();
    const basePrompt = loadAgentIdentity(ORCHESTRATOR_DIR);
    const systemPrompt = buildOrchestratorPrompt(basePrompt);

    const now = new Date().toISOString();
    const userMsg: ChatMessage = { role: 'user', content: message, timestamp: now };
    session.messages.push(userMsg);

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt, timestamp: now },
      ...session.messages,
    ];

    // SSE response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    sseStarted.value = true;

    let fullResponse = '';
    try {
      for await (const chunk of streamChat(llmMessages, config)) {
        fullResponse += chunk;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown LLM error';
      res.write(`data: ${JSON.stringify({ type: 'error', content: errorMsg })}\n\n`);
      res.end();
      return;
    }

    // Check for task pattern in response
    const taskMatch = fullResponse.match(TASK_PATTERN);
    if (taskMatch) {
      const workerName = taskMatch[1];
      const taskDescription = taskMatch[2].trim();
      const task = createTask(taskDescription);
      task.assignedTo = workerName;
      saveTask(task);

      const friendlyMsg = `📋 Task assigned to **${workerName}** (ID: ${task.id.slice(0, 8)})\n> ${taskDescription}\n\nWorking on it...`;
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: friendlyMsg })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'task_created', taskId: task.id, description: taskDescription, worker: workerName })}\n\n`);

      session.messages.push({
        role: 'assistant',
        content: friendlyMsg,
        timestamp: new Date().toISOString(),
      });
      saveSession(session);

      // In fire-forget mode, don't wait for worker completion
      if (mode === 'fire-forget') {
        res.write(`data: ${JSON.stringify({ type: 'done', sessionId: session.id })}\n\n`);
        res.end();
        // Spawn worker without SSE callback
        const onDone: WorkerDoneCallback = (_completedTask) => {
          // Worker done — result is persisted in task file, no SSE to send
        };
        spawnWorker(workerName, task, onDone);
        return;
      }

      // Normal mode: wait for worker completion
      const onDone: WorkerDoneCallback = (completedTask) => {
        try {
          if (completedTask.status === 'done') {
            res.write(`data: ${JSON.stringify({ type: 'task_done', taskId: completedTask.id, result: completedTask.result })}\n\n`);
          } else {
            res.write(`data: ${JSON.stringify({ type: 'task_failed', taskId: completedTask.id, error: completedTask.error })}\n\n`);
          }
          res.write(`data: ${JSON.stringify({ type: 'done', sessionId: session.id })}\n\n`);
          res.end();
        } catch { /* client disconnected */ }
      };

      spawnWorker(workerName, task, onDone);
      return;
    }

    // Normal conversation
    if (fullResponse) {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: fullResponse })}\n\n`);
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
    if (sseStarted.value) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', content: errorMsg })}\n\n`);
        res.end();
      } catch { /* already closed */ }
    } else {
      jsonResponse(res, 500, { error: errorMsg });
    }
  }
}

function startServer(): void {
  ensureDataDir();

  if (existsSync(SOCKET_FILE)) {
    try { unlinkSync(SOCKET_FILE); } catch { /* noop */ }
  }

  // Clean up stale tasks from previous daemon crash
  cleanupStaleTasks();

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

    if (req.method === 'GET' && url === '/api/tasks') {
      jsonResponse(res, 200, listTasks());
      return;
    }

    if (req.method === 'GET' && url === '/api/workers') {
      jsonResponse(res, 200, listWorkers());
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

    // Match /api/tasks/:id (supports partial ID prefix)
    const taskUrlMatch = url.match(/^\/api\/tasks\/([a-f0-9-]+)$/);
    if (req.method === 'GET' && taskUrlMatch) {
      const task = findTaskByIdOrPrefix(taskUrlMatch[1]);
      if (task) {
        jsonResponse(res, 200, task);
      } else {
        jsonResponse(res, 404, { error: 'Task not found' });
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
