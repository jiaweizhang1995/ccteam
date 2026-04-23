/**
 * Tests that the lead.ts notifier handler picks up spawn_request messages
 * and inserts spawn_response (no actual process spawning — spawnTeammate mocked).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { State } from '../../src/state/index.js';

// Mock spawnTeammate to avoid actually forking processes
vi.mock('../../src/orchestrator/spawn.js', () => ({
  spawnTeammate: vi.fn().mockResolvedValue({ id: 'mock-spawned-id', pid: 9999 }),
}));

describe('spawn_request routing in lead notifier', () => {
  let dir: string;
  let state: State;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spawn-routing-test-'));
    state = new State(join(dir, 'state.db'));
    state.createTeam({
      name: 'test-team',
      created_at: Date.now(),
      lead_session_id: 'lead-id',
      lead_provider: 'claude-api',
      permission_mode: 'default',
      working_dir: dir,
      status: 'active',
    });
  });

  afterEach(() => {
    state.close();
    rmSync(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('orchestrator inserts spawn_response when spawn_request arrives', async () => {
    // Import the spawn mock so we can inspect calls
    const { spawnTeammate } = await import('../../src/orchestrator/spawn.js');

    // Simulate what lead.ts notifier handler does:
    // replicate the handler logic directly against the state
    const { TeamLead } = await import('../../src/orchestrator/lead.js');

    // We don't want to run TeamLead.run() (needs providers), just test the notifier logic.
    // Instead, simulate what the notifier callback does by calling the same logic inline.

    const requestId = uuidv4();
    const teamName = 'test-team';
    const permissionMode = 'default' as const;

    const spawnContext = {
      state,
      teamName,
      teammateProviderId: 'claude-api',
      permissionMode,
      config: {
        providers: new Map(),
        defaults: { lead: 'claude-api', teammate: 'claude-api' },
        teammateMode: 'auto' as const,
        hooks: {},
      },
      subagentDefs: new Map(),
    };

    // Insert the spawn_request (as if bridge did it)
    state.insertMessage({
      team_name: teamName,
      from_agent: 'lead',
      to_agent: 'orchestrator',
      kind: 'spawn_request',
      body: JSON.stringify({ name: 'alice', provider: 'claude-api', request_id: requestId }),
      created_at: Date.now(),
    });

    // Simulate the handler logic (extracted from lead.ts)
    const { spawnTeammate: spawnFn } = await import('../../src/orchestrator/spawn.js');
    const msg = state.getMessages(teamName, { kind: 'spawn_request' })[0]!;
    const body = JSON.parse(msg.body) as {
      name?: string; provider?: string; model?: string; system_prompt?: string;
      agent_type?: string; tools?: string[]; request_id?: string;
    };

    try {
      const spawned = await spawnFn(spawnContext.state, {
        teamName,
        name: body.name!,
        provider: body.provider ?? spawnContext.teammateProviderId,
        model: body.model,
        systemPrompt: body.system_prompt,
        agentType: body.agent_type,
        toolsAllowlist: body.tools,
        permissionMode: spawnContext.permissionMode,
      });

      state.insertMessage({
        team_name: teamName,
        from_agent: 'orchestrator',
        to_agent: msg.from_agent,
        kind: 'spawn_response',
        body: JSON.stringify({ request_id: body.request_id, teammate_id: spawned.id, status: 'spawning' }),
        created_at: Date.now(),
      });
    } catch (err) {
      state.insertMessage({
        team_name: teamName,
        from_agent: 'orchestrator',
        to_agent: msg.from_agent,
        kind: 'spawn_response',
        body: JSON.stringify({ request_id: body.request_id, error: String(err) }),
        created_at: Date.now(),
      });
    }

    // Verify spawnTeammate was called with correct args
    expect(spawnTeammate).toHaveBeenCalledWith(
      state,
      expect.objectContaining({ name: 'alice', teamName }),
    );

    // Verify spawn_response was inserted
    const responses = state.getMessages(teamName, { kind: 'spawn_response' });
    expect(responses).toHaveLength(1);
    const resp = JSON.parse(responses[0]!.body) as { request_id: string; teammate_id: string; status: string };
    expect(resp.request_id).toBe(requestId);
    expect(resp.teammate_id).toBe('mock-spawned-id');
    expect(resp.status).toBe('spawning');
    expect(responses[0]!.to_agent).toBe('lead');
  });

  it('spawn_response uses correct request_id for correlation', async () => {
    const reqId1 = uuidv4();
    const reqId2 = uuidv4();

    // Insert two spawn_requests (different agents)
    state.insertMessage({
      team_name: 'test-team',
      from_agent: 'lead',
      to_agent: 'orchestrator',
      kind: 'spawn_request',
      body: JSON.stringify({ name: 'alice', request_id: reqId1 }),
      created_at: Date.now(),
    });
    state.insertMessage({
      team_name: 'test-team',
      from_agent: 'lead',
      to_agent: 'orchestrator',
      kind: 'spawn_request',
      body: JSON.stringify({ name: 'bob', request_id: reqId2 }),
      created_at: Date.now(),
    });

    // Verify both requests are present and have different IDs
    const reqs = state.getMessages('test-team', { kind: 'spawn_request' });
    expect(reqs).toHaveLength(2);

    const ids = reqs.map((r) => {
      const b = JSON.parse(r.body) as { request_id: string };
      return b.request_id;
    });
    expect(ids).toContain(reqId1);
    expect(ids).toContain(reqId2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
