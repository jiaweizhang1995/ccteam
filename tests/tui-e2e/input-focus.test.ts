/**
 * Test 3: input-focus
 * Enter focuses input bar; typed text shows; Enter submits and clears.
 * Requires real PTY (tmux). Gated behind AGENT_TEAMS_TUI_E2E=1.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { IS_E2E, spawnTui, waitForCapture, type TuiHandle } from './helpers.js';

describe.skipIf(!IS_E2E)('input-focus (tmux)', () => {
  let handle: TuiHandle | undefined;

  afterEach(() => {
    handle?.kill();
    handle = undefined;
  });

  it('Enter activates input, typed text appears, Enter submits and clears', async () => {
    handle = spawnTui('test input focus', 'test-input-team', { w: 200, h: 50 });
    await waitForCapture(handle, 'lead', { timeout: 8000 });

    // Activate input
    handle.sendKeys('Enter');
    // Wait for active (cyan border hint: box changes; input placeholder gone)
    await new Promise((r) => setTimeout(r, 400));

    // Type a test message
    handle.send('hello world');
    await new Promise((r) => setTimeout(r, 300));

    const withText = handle.capture();
    expect(withText).toContain('hello world');

    // Submit
    handle.sendKeys('Enter');
    await new Promise((r) => setTimeout(r, 400));

    // Input should be cleared after submit
    const afterSubmit = handle.capture();
    expect(afterSubmit).not.toContain('hello world');
  }, 20000);
});
