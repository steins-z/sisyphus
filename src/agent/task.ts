import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TASKS_DIR } from '../shared/constants.js';
import { ensureDataDir } from '../shared/utils.js';

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  assignedTo?: string;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export function createTask(description: string): Task {
  ensureDataDir();
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    description,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

export function saveTask(task: Task): void {
  ensureDataDir();
  task.updatedAt = new Date().toISOString();
  const filePath = join(TASKS_DIR, `${task.id}.json`);
  writeFileSync(filePath, JSON.stringify(task, null, 2), 'utf-8');
}

export function taskFilePath(id: string): string {
  return join(TASKS_DIR, `${id}.json`);
}

export function loadTask(id: string): Task | null {
  const filePath = taskFilePath(id);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as Task;
  } catch {
    return null;
  }
}

export function listTasks(): Task[] {
  ensureDataDir();
  if (!existsSync(TASKS_DIR)) return [];
  const files = readdirSync(TASKS_DIR).filter(f => f.endsWith('.json'));
  return files
    .map(f => {
      try {
        return JSON.parse(readFileSync(join(TASKS_DIR, f), 'utf-8')) as Task;
      } catch {
        return null;
      }
    })
    .filter((t): t is Task => t !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateTask(id: string, updates: Partial<Task>): Task {
  const task = loadTask(id);
  if (!task) throw new Error(`Task ${id} not found`);
  Object.assign(task, updates);
  saveTask(task);
  return task;
}
