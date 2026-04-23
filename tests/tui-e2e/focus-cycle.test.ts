/**
 * Test 1: focus-cycle
 * Stub 3 teammates. Shift+Down 4x should wrap focus back to lead.
 * Requires real PTY (tmux). Gated behind AGENT_TEAMS_TUI_E2E=1.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { IS_E2E, spawnTui, waitForCapture, type TuiHandle } from './helpers.js';

describe.skipIf(!IS_E2E)('focus-cycle (tmux)', () => {
  let handle: TuiHandle | undefined;

  afterEach(() => {
    handle?.kill();
    handle = undefined;
  });

  it('Shift+Down 4x wraps focus back to lead with 3 teammates', async () => {
    handle = spawnTui('test focus cycle', 'test-focus-team', { w: 200, h: 50 });

    // Wait for TUI to render
    await waitForCapture(handle, 'lead', { timeout: 8000 });

    // Cycle 4x: lead → 0 → 1 → 2 → lead
    handle.sendKeys('S-Down');
    await new Promise((r) => setTimeout(r, 300));
    handle.sendKeys('S-Down');
    await new Promise((r) => setTimeout(r, 300));
    handle.sendKeys('S-Down');
    await new Promise((r) => setTimeout(r, 300));
    handle.sendKeys('S-Down');
    await new Promise((r) => setTimeout(r, 300));

    const frame = handle.capture();
    // After wrapping, focus should be on lead — InputBar shows "[lead]"
    expect(frame).toContain('[lead]');
  }, 20000);
});
