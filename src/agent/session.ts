import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SESSIONS_DIR } from '../shared/constants.js';
import { ensureDataDir } from '../shared/utils.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export function createSession(): Session {
  ensureDataDir();
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function saveSession(session: Session): void {
  ensureDataDir();
  session.updatedAt = new Date().toISOString();
  const filePath = join(SESSIONS_DIR, `${session.id}.json`);
  writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

export function loadSession(id: string): Session | null {
  const filePath = join(SESSIONS_DIR, `${id}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as Session;
  } catch {
    return null;
  }
}

export function listSessions(): { id: string; createdAt: string; messageCount: number }[] {
  ensureDataDir();
  if (!existsSync(SESSIONS_DIR)) return [];
  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const session = JSON.parse(readFileSync(join(SESSIONS_DIR, f), 'utf-8')) as Session;
    return {
      id: session.id,
      createdAt: session.createdAt,
      messageCount: session.messages.length,
    };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getOrCreateActiveSession(): Session {
  const sessions = listSessions();
  if (sessions.length > 0) {
    const loaded = loadSession(sessions[0].id);
    if (loaded) return loaded;
  }
  return createSession();
}
