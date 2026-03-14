import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import http from 'node:http';
import { loadConfig } from '../shared/config.js';

interface IMessage {
  ROWID: number;
  text: string;
  date: number;
  is_from_me: number;
  handle_id: string;
}

const APPLE_EPOCH = 978307200;

function appleToUnix(appleDate: number): number {
  return (appleDate / 1_000_000_000) + APPLE_EPOCH;
}

function unixToApple(unixTimestamp: number): number {
  return (unixTimestamp - APPLE_EPOCH) * 1_000_000_000;
}

function queryMessages(dbPath: string, sinceAppleDate: number): IMessage[] {
  const query = `SELECT m.ROWID, m.text, m.date, m.is_from_me, h.id as handle_id FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID WHERE m.date > ${sinceAppleDate} AND m.text IS NOT NULL AND m.is_from_me = 0 ORDER BY m.date ASC`;
  try {
    const result = execSync(`sqlite3 -json "${dbPath}" "${query}"`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return JSON.parse(result || '[]') as IMessage[];
  } catch {
    return [];
  }
}

function sendReply(handle: string, message: string): void {
  const escaped = message
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
  const script = `tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant "${handle}" of targetService
    send "${escaped}" to targetBuddy
  end tell`;
  try {
    execSync(`osascript -e '${script}'`, { timeout: 10000 });
  } catch (err) {
    console.error(
      '[imessage] Failed to send reply:',
      err instanceof Error ? err.message : err,
    );
  }
}

function chatWithDaemon(message: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ message });
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let fullResponse = '';
        let buffer = '';
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'chunk' && event.content) {
                fullResponse += event.content;
              }
              if (event.type === 'task_created') {
                fullResponse = `📋 Task assigned to ${event.worker} (ID: ${event.taskId?.slice(0, 8)})\nWorking on it...`;
              }
              if (event.type === 'task_done' && event.result) {
                fullResponse += `\n\n✅ Done:\n${event.result}`;
              }
              if (event.type === 'task_failed') {
                fullResponse += `\n\n❌ Failed: ${event.error || 'Unknown error'}`;
              }
              if (event.type === 'task_override') {
                fullResponse = '';
              }
              if (event.type === 'error') {
                fullResponse = `❌ Error: ${event.content}`;
              }
            } catch {
              /* ignore parse errors */
            }
          }
        });
        res.on('end', () => resolve(fullResponse || '(no response)'));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(300000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.write(payload);
    req.end();
  });
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt <= 0) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}

export async function startBridge(): Promise<void> {
  const config = loadConfig();
  const imessageConfig = config.imessage;

  if (!imessageConfig?.enabled) {
    console.log(
      '[imessage] Bridge disabled. Set imessage.enabled = true in config.',
    );
    return;
  }

  if (!imessageConfig.handle) {
    console.error(
      '[imessage] No handle configured. Set imessage.handle in config.',
    );
    return;
  }

  const dbPath = `${homedir()}/Library/Messages/chat.db`;
  const pollInterval = imessageConfig.pollInterval ?? 2000;
  const port = config.daemon?.dashboardPort ?? 3847;
  const handle = imessageConfig.handle;

  let lastAppleDate = unixToApple(Date.now() / 1000);

  console.log(
    `[imessage] Bridge started. Listening for messages from: ${handle}`,
  );
  console.log(`[imessage] Polling every ${pollInterval}ms`);

  const poll = async () => {
    const messages = queryMessages(dbPath, lastAppleDate);

    for (const msg of messages) {
      if (msg.handle_id !== handle) continue;

      console.log(
        `[imessage] Received: "${msg.text}" from ${msg.handle_id}`,
      );
      lastAppleDate = msg.date;

      try {
        const response = await chatWithDaemon(msg.text, port);
        const chunks = splitMessage(response, 2000);
        for (const chunk of chunks) {
          sendReply(handle, chunk);
        }
        console.log(
          `[imessage] Replied to: "${msg.text.slice(0, 50)}..."`,
        );
      } catch (err) {
        console.error(
          '[imessage] Error processing message:',
          err instanceof Error ? err.message : err,
        );
        sendReply(handle, '❌ Sisyphus error — daemon may not be running.');
      }
    }
  };

  setInterval(poll, pollInterval);
}
