/**
 * Test 4: esc-interrupt
 * Esc while input is active deactivates it (deactivate = interrupt signal path).
 * Requires real PTY (tmux). Gated behind AGENT_TEAMS_TUI_E2E=1.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { IS_E2E, spawnTui, waitForCapture, type TuiHandle } from './helpers.js';

describe.skipIf(!IS_E2E)('esc-interrupt (tmux)', () => {
  let handle: TuiHandle | undefined;

  afterEach(() => {
    handle?.kill();
    handle = undefined;
  });

  it('Esc deactivates the input bar', async () => {
    handle = spawnTui('test esc interrupt', 'test-esc-team', { w: 200, h: 50 });
    await waitForCapture(handle, 'lead', { timeout: 8000 });

    // Activate input
    handle.sendKeys('Enter');
    await new Promise((r) => setTimeout(r, 400));

    // Type something
    handle.send('partial text');
    await new Promise((r) => setTimeout(r, 200));

    // Press Escape
    handle.sendKeys('Escape');
    await new Promise((r) => setTimeout(r, 400));

    // Input should be deactivated — hint text "press Enter to focus" visible
    const frame = handle.capture();
    expect(frame).toContain('press Enter to focus');
  }, 20000);
});
