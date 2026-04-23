import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface Config {
  providers?: Record<string, { type: string; model?: string; baseUrl?: string }>;
}

export async function listProviders(): Promise<void> {
  const configPath = join(homedir(), '.agent-teams', 'config.json');
  let config: Config = {};
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8')) as Config;
  } catch {
    console.log('No config file found at ~/.agent-teams/config.json');
    return;
  }

  const providers = config.providers ?? {};
  const entries = Object.entries(providers);
  if (entries.length === 0) {
    console.log('No providers configured.');
    return;
  }

  for (const [id, cfg] of entries) {
    const details = [cfg.type, cfg.model, cfg.baseUrl].filter(Boolean).join('  ');
    console.log(`${id.padEnd(20)} ${details}`);
  }
}
