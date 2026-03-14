import { readFileSync, writeFileSync } from 'node:fs';
import { loadAgentIdentity } from './identity.js';
import { chat } from './llm.js';
import { loadConfig } from '../shared/config.js';
import { getWorkerDir } from './registry.js';
import type { Task } from './task.js';
import type { ChatMessage } from './session.js';

async function main(): Promise<void> {
  const [taskPath, workerName] = process.argv.slice(2);
  if (!taskPath || !workerName) {
    console.error('Usage: worker-runner <task-file> <worker-name>');
    process.exit(1);
  }

  let task: Task;
  try {
    task = JSON.parse(readFileSync(taskPath, 'utf-8')) as Task;
  } catch (err) {
    console.error(`Failed to read task file: ${err}`);
    process.exit(1);
  }

  try {
    const config = loadConfig();
    const workerDir = getWorkerDir(workerName);
    const systemPrompt = loadAgentIdentity(workerDir);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt, timestamp: new Date().toISOString() },
      { role: 'user', content: task.description, timestamp: new Date().toISOString() },
    ];

    const result = await chat(messages, config);

    task.status = 'done';
    task.result = result;
    task.updatedAt = new Date().toISOString();
    writeFileSync(taskPath, JSON.stringify(task, null, 2), 'utf-8');
  } catch (err) {
    task.status = 'failed';
    task.error = err instanceof Error ? err.message : String(err);
    task.updatedAt = new Date().toISOString();
    writeFileSync(taskPath, JSON.stringify(task, null, 2), 'utf-8');
    process.exit(1);
  }
}

main();
