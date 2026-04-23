/**
 * Test 8: graceful-shutdown
 * Ctrl+C causes the TUI process to exit cleanly (exit code 0 or SIGINT).
 * Requires real PTY (tmux). Gated behind AGENT_TEAMS_TUI_E2E=1.
 */
import { execSync } from 'node:child_process';
import { describe, it, expect, afterEach } from 'vitest';
import { IS_E2E, spawnTui, waitForCapture, type TuiHandle } from './helpers.js';

describe.skipIf(!IS_E2E)('graceful-shutdown (tmux)', () => {
  let handle: TuiHandle | undefined;

  afterEach(() => {
    handle?.kill();
    handle = undefined;
  });

  it('Ctrl+C causes TUI session to exit', async () => {
    handle = spawnTui('test graceful shutdown', 'test-shutdown-team', { w: 180, h: 50 });
    await waitForCapture(handle, 'lead', { timeout: 8000 });

    // Send Ctrl+C
    handle.sendKeys('C-c');

    // Wait for the session to disappear (process exited)
    await new Promise((r) => setTimeout(r, 2000));

    // tmux session should be gone after exit
    let sessionExists = true;
    try {
      execSync(`tmux has-session -t ${handle.sid} 2>/dev/null`);
    } catch {
      sessionExists = false;
    }

    expect(sessionExists).toBe(false);
    handle = undefined; // already dead, no need to kill
  }, 20000);
});
