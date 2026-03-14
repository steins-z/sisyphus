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

const program = new Command();

program
  .name('sisyphus')
  .description('Sisyphus — AI-powered task execution daemon')
  .version('0.1.0');

// Default command: sisyphus "<prompt>"
program
  .argument('[prompt...]', 'Send a prompt to Sisyphus')
  .action((prompt: string[]) => {
    if (prompt.length > 0) {
      const text = prompt.join(' ');
      console.log(`[placeholder] Would send prompt: "${text}"`);
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

// system-status
program
  .command('system-status')
  .description('Show overall system status')
  .action(() => {
    console.log('[placeholder] System status not yet implemented');
  });

// tasks
program
  .command('tasks')
  .description('List and manage tasks')
  .action(async () => {
    try {
      interface TaskSummary {
        id: string;
        description: string;
        status: string;
        assignedTo?: string;
        createdAt: string;
        result?: string;
        error?: string;
      }
      const tasks = await apiGet<TaskSummary[]>('/api/tasks');
      if (tasks.length === 0) {
        console.log('No tasks.');
        return;
      }
      for (const t of tasks) {
        const truncDesc = t.description.length > 60 ? t.description.slice(0, 57) + '...' : t.description;
        const worker = t.assignedTo ? ` [${t.assignedTo}]` : '';
        console.log(`${t.status.toUpperCase().padEnd(7)} ${t.id.slice(0, 8)}${worker} ${truncDesc}`);
        if (t.status === 'failed' && t.error) {
          console.log(`        Error: ${t.error}`);
        }
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
      interface Worker { name: string; description: string; }
      const workers = await apiGet<Worker[]>('/api/workers');
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
