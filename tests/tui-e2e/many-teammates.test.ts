/**
 * Test 6: many-teammates
 * Spawn 6 stub teammates; TUI must not crash or hang.
 * Requires real PTY (tmux). Gated behind AGENT_TEAMS_TUI_E2E=1.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { IS_E2E, spawnTui, waitForCapture, type TuiHandle } from './helpers.js';

describe.skipIf(!IS_E2E)('many-teammates (tmux)', () => {
  let handle: TuiHandle | undefined;

  afterEach(() => {
    handle?.kill();
    handle = undefined;
  });

  it('renders TUI with 6 teammates without crashing', async () => {
    handle = spawnTui('test many teammates', 'test-many-team', { w: 300, h: 50 });

    // TUI must render without crash — look for lead pane at minimum.
    const frame = await waitForCapture(handle, 'lead', { timeout: 10000 });
    expect(frame).toContain('lead');
    // No error output expected
    expect(frame).not.toContain('Error:');
    expect(frame).not.toContain('Uncaught');
  }, 25000);
});
