import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SISYPHUS_DIR } from './constants.js';
import { ensureDataDir } from './utils.js';

const USAGE_FILE = join(SISYPHUS_DIR, 'data', 'usage.json');

export interface UsageRecord {
  timestamp: string;
  sessionId?: string;
  taskId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  requestCount: number;
  records: UsageRecord[];
}

function loadUsageData(): UsageRecord[] {
  ensureDataDir();
  if (!existsSync(USAGE_FILE)) return [];
  try {
    return JSON.parse(readFileSync(USAGE_FILE, 'utf-8')) as UsageRecord[];
  } catch { return []; }
}

function saveUsageData(records: UsageRecord[]): void {
  ensureDataDir();
  writeFileSync(USAGE_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

export function recordUsage(record: UsageRecord): void {
  const records = loadUsageData();
  records.push(record);
  saveUsageData(records);
}

export function getUsageSummary(): UsageSummary {
  const records = loadUsageData();
  return {
    totalPromptTokens: records.reduce((s, r) => s + r.promptTokens, 0),
    totalCompletionTokens: records.reduce((s, r) => s + r.completionTokens, 0),
    totalTokens: records.reduce((s, r) => s + r.totalTokens, 0),
    requestCount: records.length,
    records,
  };
}
