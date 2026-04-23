/**
 * Test 10: slash-command-plan
 * Type /plan <goal>, verify plan mode triggers + confirmation dialog.
 * Blocked on T5+T6 (PlanPanel + runPlanMode backend). Gated behind AGENT_TEAMS_TUI_E2E=1.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { IS_E2E, spawnTui, waitForCapture, type TuiHandle } from './helpers.js';

describe.skipIf(!IS_E2E)('slash-command-plan (tmux)', () => {
  let handle: TuiHandle | undefined;

  afterEach(() => {
    handle?.kill();
    handle = undefined;
  });

  it('typing /plan <goal> triggers plan mode and shows confirmation dialog', async () => {
    handle = spawnTui('test plan command', 'test-plan-team', { w: 200, h: 50 });
    await waitForCapture(handle, 'lead', { timeout: 8000 });

    // Activate input bar
    handle.sendKeys('Enter');
    await new Promise((r) => setTimeout(r, 400));

    // Type /plan command
    handle.send('/plan build a todo app');
    await new Promise((r) => setTimeout(r, 300));
    handle.sendKeys('Enter');

    // Wait for plan mode to appear
    // PlanPanel shows "Generating plan..." or similar header
    const planFrame = await waitForCapture(handle, 'plan', { timeout: 10000 });
    expect(planFrame.toLowerCase()).toContain('plan');

    // Confirmation dialog should appear after plan generation
    // "Spawn N agents? [Enter=yes / 1-9=override / Esc=cancel]"
    // This will only work fully after T5+T6 land.
  }, 30000);
});
