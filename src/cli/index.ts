#!/usr/bin/env node
import { Command } from 'commander';
import http from 'node:http';
import { start, stop, status } from '../daemon/manager.js';
import { chatCommand } from './chat.js';
import { SOCKET_FILE } from '../shared/constants.js';

function apiGet<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.get({ socketPath: SOCKET_FILE, path }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data) as T); }
        catch { reject(new Error('Invalid response')); }
      });
    });
    req.on('error', () => reject(new Error('Daemon is not running. Start it with: sisyphus daemon start')));
  });
}

function apiPost<T>(path: string, body: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      socketPath: SOCKET_FILE,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data) as T); }
        catch { reject(new Error('Invalid response')); }
      });
    });
    req.on('error', () => reject(new Error('Daemon is not running. Start it with: sisyphus daemon start')));
    req.write(payload);
    req.end();
  });
}

interface SSEEvent {
  type: string;
  content?: string;
  taskId?: string;
  description?: string;
  worker?: string;
  sessionId?: string;
  result?: string;
  error?: string;
}

function fireAndForget(prompt: string): void {
  const payload = JSON.stringify({ message: prompt, mode: 'fire-forget' });
  const req = http.request({
    socketPath: SOCKET_FILE,
    path: '/api/chat',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  }, (res) => {
    let buffer = '';
    res.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6)) as SSEEvent;
          if (event.type === 'task_created') {
            console.log(`✅ Task submitted (ID: ${event.taskId?.slice(0, 8)})`);
            console.log(`   Worker: ${event.worker}`);
            console.log(`   Check status with: sisyphus tasks`);
            console.log(`   View result with:  sisyphus result ${event.taskId?.slice(0, 8)}`);
            res.destroy();
            return;
          }
          if (event.type === 'chunk' && event.content) {
            // Normal conversation response (no task created)
            process.stdout.write(event.content);
          }
          if (event.type === 'done') {
            console.log('');
            process.exit(0);
          }
          if (event.type === 'error') {
            console.error(`❌ Error: ${event.content}`);
            process.exit(1);
          }
        } catch { /* ignore parse errors */ }
      }
    });
    res.on('end', () => process.exit(0));
  });
  req.on('error', () => {
    console.error('Daemon is not running. Start it with: sisyphus daemon start');
    process.exit(1);
  });
  req.write(payload);
  req.end();
}

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  done: '✅',
  failed: '❌',
};

interface TaskSummary {
  id: string;
  description: string;
  status: string;
  assignedTo?: string;
  createdAt: string;
  result?: string;
  error?: string;
}

interface SystemInfo {
  status: string;
  uptime: number;
  pid: number;
}

interface WorkerInfo {
  name: string;
  description: string;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function renderTasks(tasks: TaskSummary[]): void {
  if (tasks.length === 0) {
    console.log('No tasks.');
    return;
  }
  for (const t of tasks) {
    const icon = STATUS_ICONS[t.status] ?? '?';
    const truncDesc = t.description.length > 60 ? t.description.slice(0, 57) + '...' : t.description;
    const worker = t.assignedTo ? ` [${t.assignedTo}]` : '';
    console.log(`${icon} ${t.status.toUpperCase().padEnd(7)} ${t.id.slice(0, 8)}${worker} ${truncDesc}`);
    if (t.status === 'failed' && t.error) {
      console.log(`         Error: ${t.error}`);
    }
  }
}

const program = new Command();

program
  .name('sisyphus')
  .description('Sisyphus — AI-powered task execution daemon')
  .version('0.1.0');

// Default command: sisyphus "<prompt>"
program
  .argument('[prompt...]', 'Send a prompt to Sisyphus (fire & forget)')
  .action((prompt: string[]) => {
    if (prompt.length > 0) {
      const text = prompt.join(' ');
      fireAndForget(text);
    } else {
      program.help();
    }
  });

// daemon subcommands
const daemon = program
  .command('daemon')
  .description('Manage the Sisyphus daemon');

daemon.command('start').description('Start the daemon').action(start);
daemon.command('stop').description('Stop the daemon').action(stop);
daemon.command('status').description('Show daemon status').action(status);

// chat
program
  .command('chat')
  .description('Start an interactive chat session')
  .option('-n, --new', 'Start a new session instead of continuing the last one')
  .action((options: { new?: boolean }) => {
    chatCommand(options);
  });

// status command
program
  .command('status')
  .description('Show overall system status')
  .action(async () => {
    try {
      const [system, tasks, workers] = await Promise.all([
        apiGet<SystemInfo>('/api/system'),
        apiGet<TaskSummary[]>('/api/tasks'),
        apiGet<WorkerInfo[]>('/api/workers'),
      ]);

      console.log('🏛️  Sisyphus Daemon');
      console.log(`   Status:  ${system.status}`);
      console.log(`   PID:     ${system.pid}`);
      console.log(`   Uptime:  ${formatUptime(system.uptime)}`);
      console.log('');

      const running = tasks.filter(t => t.status === 'running').length;
      const done = tasks.filter(t => t.status === 'done').length;
      const failed = tasks.filter(t => t.status === 'failed').length;
      const pending = tasks.filter(t => t.status === 'pending').length;

      console.log('📋 Tasks');
      console.log(`   Total:   ${tasks.length}`);
      if (pending) console.log(`   ⏳ Pending:  ${pending}`);
      if (running) console.log(`   🔄 Running:  ${running}`);
      if (done)    console.log(`   ✅ Done:     ${done}`);
      if (failed)  console.log(`   ❌ Failed:   ${failed}`);
      console.log('');

      console.log('🤖 Workers');
      console.log(`   Registered: ${workers.length}`);
      for (const w of workers) {
        console.log(`   - ${w.name}: ${w.description}`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Error');
    }
  });

// result command
program
  .command('result <taskId>')
  .description('Show the result of a task')
  .action(async (taskId: string) => {
    try {
      // Try exact match first, then partial
      let task = await apiGet<TaskSummary>(`/api/tasks/${taskId}`).catch(() => null);
      if (!task) {
        // Try partial match via listing
        const tasks = await apiGet<TaskSummary[]>('/api/tasks');
        const matches = tasks.filter(t => t.id.startsWith(taskId));
        if (matches.length === 0) {
          console.error(`❌ No task found matching "${taskId}"`);
          process.exit(1);
        }
        if (matches.length > 1) {
          console.error(`❌ Multiple tasks match "${taskId}":`);
          for (const m of matches) console.error(`   ${m.id.slice(0, 8)} - ${m.description.slice(0, 50)}`);
          process.exit(1);
        }
        task = matches[0];
      }

      const icon = STATUS_ICONS[task.status] ?? '?';
      console.log(`${icon} Task ${task.id.slice(0, 8)} — ${task.status.toUpperCase()}`);
      console.log(`   Description: ${task.description}`);
      if (task.assignedTo) console.log(`   Worker: ${task.assignedTo}`);
      console.log(`   Created: ${task.createdAt}`);
      console.log('');

      if (task.status === 'done' && task.result) {
        console.log('--- Result ---');
        console.log(task.result);
      } else if (task.status === 'running') {
        console.log('⏳ Task is still running...');
      } else if (task.status === 'pending') {
        console.log('⏳ Task is pending...');
      } else if (task.status === 'failed') {
        console.log(`❌ Error: ${task.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Error');
    }
  });

// tasks
program
  .command('tasks')
  .description('List and manage tasks')
  .option('-w, --watch', 'Watch mode — refresh every 2 seconds')
  .action(async (options: { watch?: boolean }) => {
    try {
      if (options.watch) {
        const poll = async (): Promise<void> => {
          while (true) {
            process.stdout.write('\x1B[2J\x1B[H'); // clear screen
            console.log('📋 Tasks (watching — Ctrl+C to stop)\n');
            const tasks = await apiGet<TaskSummary[]>('/api/tasks');
            renderTasks(tasks);
            await new Promise(r => setTimeout(r, 2000));
          }
        };
        await poll();
      } else {
        const tasks = await apiGet<TaskSummary[]>('/api/tasks');
        renderTasks(tasks);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Error');
    }
  });

// agents
const agents = program
  .command('agents')
  .description('Manage agents');

agents
  .command('list')
  .description('List registered workers')
  .action(async () => {
    try {
      const workers = await apiGet<WorkerInfo[]>('/api/workers');
      if (workers.length === 0) {
        console.log('No workers registered.');
        return;
      }
      for (const w of workers) {
        const desc = w.description.length > 80 ? w.description.slice(0, 77) + '...' : w.description;
        console.log(`  ${w.name}: ${desc}`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Error');
    }
  });

program.parse();
