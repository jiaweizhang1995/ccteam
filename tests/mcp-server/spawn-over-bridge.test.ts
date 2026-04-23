/**
 * Tests spawn_teammate in bridge mode (no SpawnContext).
 * The tool inserts a spawn_request, orchestrator is simulated by
 * injecting a spawn_response after a short delay.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { makeStubState, addTeammate } from './stub-state.js';
import { bootClient, callTool, leadIdentity } from './helpers.js';

describe('spawn_teammate over bridge (no SpawnContext)', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it('inserts spawn_request message and returns teammate_id when orchestrator responds', async () => {
    const state = makeStubState();

    const { client, cleanup: c } = await bootClient(state, leadIdentity);
    cleanup = c;

    // Simulate orchestrator picking up spawn_request and inserting spawn_response
    const simulateOrchestrator = new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        const req = state.messages.find((m) => m.kind === 'spawn_request');
        if (!req) return;
        clearInterval(poll);

        const body = JSON.parse(req.body) as { request_id?: string; name?: string };
        state.insertMessage({
          team_name: leadIdentity.teamName,
          from_agent: 'orchestrator',
          to_agent: leadIdentity.agentName,
          kind: 'spawn_response',
          body: JSON.stringify({
            request_id: body.request_id,
            teammate_id: 'spawned-uuid-123',
            status: 'spawning',
          }),
          created_at: Date.now(),
        });
        resolve();
      }, 50);
    });

    const [result] = await Promise.all([
      callTool(client, 'spawn_teammate', { name: 'alice' }),
      simulateOrchestrator,
    ]);

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.text) as { teammate_id: string; status: string };
    expect(parsed.teammate_id).toBe('spawned-uuid-123');
    expect(parsed.status).toBe('spawning');

    // Verify spawn_request was inserted with correct fields
    const req = state.messages.find((m) => m.kind === 'spawn_request');
    expect(req).toBeDefined();
    expect(req?.to_agent).toBe('orchestrator');
    const reqBody = JSON.parse(req?.body ?? '{}') as { name: string; request_id: string };
    expect(reqBody.name).toBe('alice');
    expect(reqBody.request_id).toBeTruthy();
  }, 15000);

  it('returns error when orchestrator responds with error', async () => {
    const state = makeStubState();

    const { client, cleanup: c } = await bootClient(state, leadIdentity);
    cleanup = c;

    const simulateOrchestrator = new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        const req = state.messages.find((m) => m.kind === 'spawn_request');
        if (!req) return;
        clearInterval(poll);

        const body = JSON.parse(req.body) as { request_id?: string };
        state.insertMessage({
          team_name: leadIdentity.teamName,
          from_agent: 'orchestrator',
          to_agent: leadIdentity.agentName,
          kind: 'spawn_response',
          body: JSON.stringify({
            request_id: body.request_id,
            error: 'teammate "alice" already exists',
          }),
          created_at: Date.now(),
        });
        resolve();
      }, 50);
    });

    const [result] = await Promise.all([
      callTool(client, 'spawn_teammate', { name: 'alice' }),
      simulateOrchestrator,
    ]);

    expect(result.isError).toBe(true);
    expect(result.text).toContain('already exists');
  }, 15000);

  it('non-lead cannot call spawn_teammate', async () => {
    const state = makeStubState();
    const { client, cleanup: c } = await bootClient(state); // default non-lead identity
    cleanup = c;

    const result = await callTool(client, 'spawn_teammate', { name: 'alice' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('lead-only');
  });

  it('direct spawn path (with SpawnContext) does not insert spawn_request', async () => {
    const state = makeStubState();
    addTeammate(state, 'existing', 'test-team', 'active');

    // With a SpawnContext provided, the tool tries direct spawn (no message round-trip)
    // We just verify the duplicate-name guard works on the direct path
    const { createInProcessServer } = await import('../../src/mcp-server/server.js');

    // Minimal stub SpawnContext — actual spawnTeammate won't be called because name is duplicate
    const stubCtx = {
      state: null as unknown as import('../../src/state/index.js').State,
      teamName: 'test-team',
      teammateProviderId: 'claude-api',
      permissionMode: 'default' as const,
      config: { providers: new Map(), defaults: { lead: 'claude-api', teammate: 'claude-api' }, teammateMode: 'auto' as const, hooks: {} },
      subagentDefs: new Map(),
    };

    const { client, cleanup: c } = await createInProcessServer(state, leadIdentity, stubCtx);
    cleanup = c;

    const result = await callTool(client, 'spawn_teammate', { name: 'existing' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('already exists');

    // No spawn_request message — used direct path
    expect(state.messages.filter((m) => m.kind === 'spawn_request')).toHaveLength(0);
  });
});
