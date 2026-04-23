/**
 * Test 9: resize
 * Resize tmux window mid-run; TUI must re-render without crash.
 * Requires real PTY (tmux). Gated behind AGENT_TEAMS_TUI_E2E=1.
 */
import { execSync } from 'node:child_process';
import { describe, it, expect, afterEach } from 'vitest';
import { IS_E2E, spawnTui, waitForCapture, type TuiHandle } from './helpers.js';

describe.skipIf(!IS_E2E)('resize (tmux)', () => {
  let handle: TuiHandle | undefined;

  afterEach(() => {
    handle?.kill();
    handle = undefined;
  });

  it('re-renders cleanly after tmux window resize', async () => {
    handle = spawnTui('test resize', 'test-resize-team', { w: 200, h: 50 });
    await waitForCapture(handle, 'lead', { timeout: 8000 });

    // Resize the window
    execSync(`tmux resize-window -t ${handle.sid} -x 120 -y 35`);
    await new Promise((r) => setTimeout(r, 500));

    // TUI should still render without crash
    const after = handle.capture();
    expect(after).toContain('lead');
    expect(after).not.toContain('Error:');

    // Resize back to larger
    execSync(`tmux resize-window -t ${handle.sid} -x 240 -y 55`);
    await new Promise((r) => setTimeout(r, 500));

    const final = handle.capture();
    expect(final).toContain('lead');
  }, 20000);
});
