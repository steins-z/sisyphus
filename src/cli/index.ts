#!/usr/bin/env node
import { Command } from 'commander';
import { start, stop, status } from '../daemon/manager.js';

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
  .action(() => {
    console.log('[placeholder] Interactive chat not yet implemented');
  });

// system-status (top-level status of the whole system, distinct from daemon status)
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
  .action(() => {
    console.log('[placeholder] Tasks not yet implemented');
  });

// agents
const agents = program
  .command('agents')
  .description('Manage agents');

agents
  .command('list')
  .description('List running agents')
  .action(() => {
    console.log('[placeholder] Agent listing not yet implemented');
  });

program.parse();
