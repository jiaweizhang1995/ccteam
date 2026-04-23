import { describe, it, expect, afterEach } from 'vitest';
import { makeStubState, addTeammate } from './stub-state.js';
import { bootClient, callTool, leadIdentity, defaultIdentity } from './helpers.js';

describe('lead-only tools', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it('decide_plan rejected for non-lead', async () => {
    const state = makeStubState();
    const { client, cleanup: c } = await bootClient(state, defaultIdentity);
    cleanup = c;

    const { isError, text } = await callTool(client, 'decide_plan', {
      teammate: 'worker-2',
      decision: 'approve',
    });
    expect(isError).toBe(true);
    expect(text).toContain('only available to the team lead');
  });

  it('decide_plan allowed for lead', async () => {
    const state = makeStubState();
    addTeammate(state, 'worker-2');

    const { client, cleanup: c } = await bootClient(state, leadIdentity);
    cleanup = c;

    const { isError } = await callTool(client, 'decide_plan', {
      teammate: 'worker-2',
      decision: 'approve',
    });
    expect(isError).toBe(false);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.kind).toBe('plan_decision');
  });

  it('request_shutdown rejected for non-lead', async () => {
    const state = makeStubState();
    addTeammate(state, 'worker-2');

    const { client, cleanup: c } = await bootClient(state, defaultIdentity);
    cleanup = c;

    const { isError, text } = await callTool(client, 'request_shutdown', { teammate: 'worker-2' });
    expect(isError).toBe(true);
    expect(text).toContain('only available to the team lead');
  });

  it('request_shutdown allowed for lead', async () => {
    const state = makeStubState();
    addTeammate(state, 'worker-2');

    const { client, cleanup: c } = await bootClient(state, leadIdentity);
    cleanup = c;

    const { isError } = await callTool(client, 'request_shutdown', { teammate: 'worker-2', reason: 'Done' });
    expect(isError).toBe(false);
    expect(state.messages[0]?.kind).toBe('shutdown_request');
  });
});
