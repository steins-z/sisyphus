import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { CONFIG_FILE } from './constants.js';

export interface SisyphusConfig {
  llm: {
    provider: string;
    model: string;
    apiKey: string;
  };
  daemon: {
    socketPath: string;
  };
}

export function loadConfig(): SisyphusConfig {
  const raw = readFileSync(CONFIG_FILE, 'utf-8');
  return yaml.load(raw) as SisyphusConfig;
}
