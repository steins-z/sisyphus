import * as readline from 'node:readline';
import http from 'node:http';
import { SOCKET_FILE } from '../shared/constants.js';

function postChat(message: string, sessionId?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ message, sessionId });
    const req = http.request(
      {
        socketPath: SOCKET_FILE,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let buffer = '';
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as { type: string; content?: string; sessionId?: string; taskId?: string; result?: string; error?: string };
              if (event.type === 'chunk' && event.content) {
                process.stdout.write(event.content);
              } else if (event.type === 'error') {
                process.stdout.write(`\n[Error: ${event.content}]`);
              } else if (event.type === 'task_created') {
                // Already shown via chunk, just note it
              } else if (event.type === 'task_done' && event.result) {
                process.stdout.write(`\n\n✅ Task complete:\n${event.result}`);
              } else if (event.type === 'task_failed') {
                process.stdout.write(`\n\n❌ Task failed: ${event.error ?? 'unknown error'}`);
              } else if (event.type === 'done') {
                if (event.sessionId) {
                  currentSessionId = event.sessionId;
                }
              }
            } catch { /* skip malformed */ }
          }
        });
        res.on('end', () => {
          process.stdout.write('\n\n');
          resolve();
        });
        res.on('error', reject);
      },
    );
    req.on('error', (err) => {
      reject(new Error(`Cannot connect to daemon: ${err.message}. Is it running? (sisyphus daemon start)`));
    });
    req.write(body);
    req.end();
  });
}

let currentSessionId: string | undefined;

export async function chatCommand(options: { new?: boolean }): Promise<void> {
  // Check daemon is running
  try {
    await new Promise<void>((resolve, reject) => {
      const req = http.get({ socketPath: SOCKET_FILE, path: '/api/system' }, (res) => {
        res.resume();
        res.on('end', resolve);
      });
      req.on('error', reject);
      req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  } catch {
    console.error('Daemon is not running. Start it with: sisyphus daemon start');
    process.exit(1);
  }

  // Get active session (skip if --new)
  if (!options.new) {
    try {
      const sessions = await new Promise<{ id: string }[]>((resolve, reject) => {
        const req = http.get({ socketPath: SOCKET_FILE, path: '/api/sessions' }, (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk; });
          res.on('end', () => {
            try { resolve(JSON.parse(data) as { id: string }[]); }
            catch { resolve([]); }
          });
        });
        req.on('error', reject);
      });
      if (sessions.length > 0) {
        currentSessionId = sessions[0].id;
      }
    } catch { /* will create new session on first message */ }
  }

  console.log(`Sisyphus Chat ${currentSessionId ? `(session: ${currentSessionId})` : '(new session)'}`);
  console.log('Type your message and press Enter. Ctrl+C to exit.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'you> ',
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed === '/new') {
      currentSessionId = undefined;
      console.log('Started new session.\n');
      rl.prompt();
      return;
    }

    try {
      await postChat(trimmed, currentSessionId);
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Error communicating with daemon');
    }
    rl.prompt();
  });

  rl.on('close', () => {
    if (currentSessionId) {
      console.log(`\nSession: ${currentSessionId}`);
    }
    console.log('Goodbye!');
    process.exit(0);
  });
}
