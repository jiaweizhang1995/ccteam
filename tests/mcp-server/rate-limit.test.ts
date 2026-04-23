import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { makeStubState, addTeammate } from './stub-state.js';
import { bootClient, callTool } from './helpers.js';
import type { AgentIdentity } from '../../src/mcp-server/identity.js';

describe('rate limiting', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it('rejects the 31st message in a minute with specific error', async () => {
    const state = makeStubState();
    addTeammate(state, 'lead', 'test-team', 'active');

    // Use a unique agentId per test run to avoid shared window state
    const identity: AgentIdentity = {
      agentId: `rate-test-${Date.now()}`,
      agentName: 'worker-1',
      teamName: 'test-team',
      isLead: false,
    };

    const { client, cleanup: c } = await bootClient(state, identity);
    cleanup = c;

    // Send 30 — all should succeed
    for (let i = 0; i < 30; i++) {
      const r = await callTool(client, 'send_message', { to: 'lead', body: `msg ${i}` });
      expect(r.isError).toBe(false);
    }

    // 31st should be rate-limited
    const { isError, text } = await callTool(client, 'send_message', { to: 'lead', body: 'msg 31' });
    expect(isError).toBe(true);
    expect(text).toContain('Rate limit exceeded');
  }, 10_000);
});
