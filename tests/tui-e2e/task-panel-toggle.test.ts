/**
 * Test 2: task-panel-toggle
 * Ctrl+T toggles the task list panel on/off.
 * Requires real PTY (tmux). Gated behind AGENT_TEAMS_TUI_E2E=1.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { IS_E2E, spawnTui, waitForCapture, type TuiHandle } from './helpers.js';

describe.skipIf(!IS_E2E)('task-panel-toggle (tmux)', () => {
  let handle: TuiHandle | undefined;

  afterEach(() => {
    handle?.kill();
    handle = undefined;
  });

  it('Ctrl+T shows and hides the task panel', async () => {
    handle = spawnTui('test task panel', 'test-task-team', { w: 200, h: 50 });
    await waitForCapture(handle, 'lead', { timeout: 8000 });

    // Panel should be hidden initially — no "Tasks" header
    const before = handle.capture();
    expect(before).not.toContain('Tasks (Ctrl+T to hide)');

    // Open panel
    handle.sendKeys('C-t');
    const withPanel = await waitForCapture(handle, 'Tasks', { timeout: 3000 });
    expect(withPanel).toContain('Tasks');

    // Close panel
    handle.sendKeys('C-t');
    await new Promise((r) => setTimeout(r, 500));
    const after = handle.capture();
    expect(after).not.toContain('Tasks (Ctrl+T to hide)');
  }, 20000);
});
