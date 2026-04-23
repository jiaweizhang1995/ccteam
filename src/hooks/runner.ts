import { spawn } from 'node:child_process';
import type { HookEventName, HookPayload, HookResult } from './types.js';

const HOOK_TIMEOUT_MS = 5_000;
const VETO_EXIT_CODE = 2;

export async function runHook(
  cmd: string,
  eventName: HookEventName,
  payload: HookPayload,
  timeoutMs = HOOK_TIMEOUT_MS,
): Promise<HookResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, [], {
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, AGENT_TEAMS_HOOK_EVENT: eventName },
    });

    let stderr = '';
    let stdout = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      resolve({ allowed: true, exitCode: 0 }); // timeout → allow (non-blocking)
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const exitCode = code ?? 1;
      if (exitCode === VETO_EXIT_CODE) {
        resolve({ allowed: false, feedback: stderr.trim() || stdout.trim(), exitCode });
      } else {
        resolve({ allowed: true, exitCode });
      }
    });

    child.on('error', (_err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ allowed: true, exitCode: 1 }); // hook launch failure → allow
    });

    const input = JSON.stringify(payload);
    child.stdin?.write(input, () => child.stdin?.end());
  });
}
