import { fork, ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Task } from './task.js';
import { saveTask, loadTask, taskFilePath } from './task.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type WorkerDoneCallback = (task: Task) => void;

const activeWorkers = new Map<string, ChildProcess>();

export function spawnWorker(
  workerName: string,
  task: Task,
  onDone?: WorkerDoneCallback,
): void {
  task.status = 'running';
  task.assignedTo = workerName;
  saveTask(task);

  const runnerPath = join(__dirname, 'worker-runner.js');
  const taskPath = taskFilePath(task.id);

  const child = fork(runnerPath, [taskPath, workerName], {
    detached: false,
    stdio: 'ignore',
  });

  activeWorkers.set(task.id, child);

  child.on('exit', (code) => {
    activeWorkers.delete(task.id);
    // Reload task from file (worker may have written result)
    const updatedTask = loadTask(task.id);
    if (updatedTask) {
      // If worker crashed without writing status, mark as failed
      if (code !== 0 && updatedTask.status === 'running') {
        updatedTask.status = 'failed';
        updatedTask.error = `Worker exited with code ${code}`;
        saveTask(updatedTask);
      }
      if (onDone) onDone(updatedTask);
    }
  });

  child.on('error', (err) => {
    activeWorkers.delete(task.id);
    const current = loadTask(task.id);
    if (current && current.status === 'running') {
      current.status = 'failed';
      current.error = `Worker spawn error: ${err.message}`;
      saveTask(current);
      if (onDone) onDone(current);
    }
  });
}
