import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeStubState } from './stub-state.js';
import { bootClient, callTool } from './helpers.js';

vi.mock('../../src/hooks/registry.js', () => ({
  fireHook: vi.fn(),
}));

import { fireHook } from '../../src/hooks/registry.js';

describe('hook veto on create_task', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
  });

  it('returns error with feedback when TaskCreated hook vetoes', async () => {
    vi.mocked(fireHook).mockResolvedValue({ allowed: false, feedback: 'not good enough', exitCode: 2 });

    const state = makeStubState();
    const { client, cleanup: c } = await bootClient(state);
    cleanup = c;

    const { isError, text } = await callTool(client, 'create_task', { title: 'Risky task' });
    expect(isError).toBe(true);
    expect(text).toContain('not good enough');
    expect(state.tasks.size).toBe(0);
  });

  it('proceeds when TaskCreated hook allows', async () => {
    vi.mocked(fireHook).mockResolvedValue({ allowed: true, exitCode: 0 });

    const state = makeStubState();
    const { client, cleanup: c } = await bootClient(state);
    cleanup = c;

    const { isError } = await callTool(client, 'create_task', { title: 'Safe task' });
    expect(isError).toBe(false);
    expect(state.tasks.size).toBe(1);
  });

  it('blocks complete_task when TaskCompleted hook vetoes', async () => {
    vi.mocked(fireHook).mockResolvedValue({ allowed: false, feedback: 'quality not met', exitCode: 2 });

    const state = makeStubState();
    state.tasks.set('t1', {
      id: 't1',
      team_name: 'test-team',
      title: 'Some task',
      description: null,
      status: 'in_progress',
      assigned_to: null,
      claim_lock_owner: null,
      claim_lock_expires: null,
      depends_on: null,
      result: null,
      created_by: 'lead',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const { client, cleanup: c } = await bootClient(state);
    cleanup = c;

    const { isError, text } = await callTool(client, 'complete_task', { task_id: 't1', result: 'partial work' });
    expect(isError).toBe(true);
    expect(text).toContain('quality not met');
    expect(state.tasks.get('t1')?.status).toBe('in_progress');
  });
});
