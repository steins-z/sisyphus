import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_SYSTEM_PROMPT = `You are Sisyphus, a helpful AI assistant and orchestrator. You help users manage tasks, answer questions, and coordinate work. Be concise, direct, and helpful.`;

export function loadAgentIdentity(agentDir: string): string {
  const parts: string[] = [];

  const soulPath = join(agentDir, 'soul.md');
  if (existsSync(soulPath)) {
    parts.push(readFileSync(soulPath, 'utf-8').trim());
  }

  const agentsPath = join(agentDir, 'agents.md');
  if (existsSync(agentsPath)) {
    parts.push(readFileSync(agentsPath, 'utf-8').trim());
  }

  return parts.length > 0 ? parts.join('\n\n') : DEFAULT_SYSTEM_PROMPT;
}
