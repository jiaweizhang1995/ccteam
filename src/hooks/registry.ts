import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HookEventName, HookPayload, HookResult } from './types.js';
import { runHook } from './runner.js';

interface HooksConfig {
  TeammateIdle?: string | null;
  TaskCreated?: string | null;
  TaskCompleted?: string | null;
}

interface AgentTeamsConfig {
  hooks?: HooksConfig;
}

function loadHooksConfig(): HooksConfig {
  const globalPath = join(homedir(), '.agent-teams', 'config.json');
  const cwdPath = join(process.cwd(), '.agent-teams', 'config.json');

  let merged: HooksConfig = {};

  for (const p of [globalPath, cwdPath]) {
    try {
      const raw = readFileSync(p, 'utf8');
      const cfg = JSON.parse(raw) as AgentTeamsConfig;
      if (cfg.hooks) {
        merged = { ...merged, ...cfg.hooks };
      }
    } catch {
      // file absent or unreadable — skip
    }
  }

  return merged;
}

export async function fireHook(
  eventName: HookEventName,
  payload: HookPayload,
): Promise<HookResult> {
  const config = loadHooksConfig();
  const cmd = config[eventName];
  if (!cmd) {
    return { allowed: true, exitCode: 0 };
  }
  return runHook(cmd, eventName, payload);
}
