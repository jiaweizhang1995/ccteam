import { describe, it, expect } from 'vitest';
import { runHook } from '../../src/hooks/runner.js';
import type { TaskCreatedPayload } from '../../src/hooks/types.js';

const payload: TaskCreatedPayload = {
  team: 'test-team',
  task: { id: 'task-1', title: 'Do something', created_by: 'lead' },
};

describe('exit-code-2 veto', () => {
  it('rejects when hook exits 2 with stderr feedback', async () => {
    const result = await runHook(
      'echo "not good enough" >&2; exit 2',
      'TaskCreated',
      payload,
    );
    expect(result.allowed).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.feedback).toContain('not good enough');
  });

  it('allows when hook exits 0', async () => {
    const result = await runHook('exit 0', 'TaskCreated', payload);
    expect(result.allowed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('allows when hook exits 1 (non-veto error)', async () => {
    const result = await runHook('exit 1', 'TaskCreated', payload);
    expect(result.allowed).toBe(true);
    expect(result.exitCode).toBe(1);
  });
});
