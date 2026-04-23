import { describe, it, expect } from 'vitest';
import { runHook } from '../../src/hooks/runner.js';
import type { TeammateIdlePayload } from '../../src/hooks/types.js';

const payload: TeammateIdlePayload = {
  team: 'test-team',
  teammate: 'worker-1',
  last_activity_ts: Date.now(),
};

describe('timeout', () => {
  it('aborts long-running hook and returns allowed=true after timeout', async () => {
    const start = Date.now();
    const result = await runHook('sleep 60', 'TeammateIdle', payload, 300);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1500);
    expect(result.allowed).toBe(true);
  }, 3000);
});
