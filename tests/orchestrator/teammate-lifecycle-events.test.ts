import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { State } from '../../src/state/index.js';
import { spawnTeammate } from '../../src/orchestrator/spawn.js';
import type { SpawnSpec } from '../../src/orchestrator/spawn.js';

describe('teammate lifecycle events', () => {
  let state: State;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lifecycle-events-'));
    const dbPath = join(dir, 'test.db');
    state = new State(dbPath);
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
  });

  it('spawn.ts exit handler appends teammate_shutdown event when child exits', async () => {
    const appendSpy = vi.spyOn(state, 'appendEvent');

    const spec: SpawnSpec = {
      teamName: 'test-team',
      name: 'alice',
      provider: 'claude-api',
      permissionMode: 'default',
    };

    const spawned = await spawnTeammate(state, spec);

    // Kill child to trigger the exit handler
    process.kill(spawned.pid, 'SIGTERM');

    // Wait for async exit handler to fire
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    const shutdownEvent = appendSpy.mock.calls
      .map((c) => c[0])
      .find((e) => e.kind === 'teammate_shutdown');
    expect(shutdownEvent).toBeDefined();
    expect(shutdownEvent?.team_name).toBe('test-team');
    expect(shutdownEvent?.agent).toBe('alice');
    const payload = JSON.parse(shutdownEvent!.payload) as Record<string, unknown>;
    expect(payload.name).toBe('alice');
  }, 10000);

  it('appendEvent teammate_spawned payload has required fields', () => {
    // Tests that the payload shape emitted by lead.ts spawn_request handler matches
    // what useTeamState expects: { name, id, provider, status }
    const ts = Date.now();
    state.appendEvent({
      team_name: 'test-team',
      agent: 'orchestrator',
      kind: 'teammate_spawned',
      payload: JSON.stringify({ name: 'bob', id: 'bob-id', provider: 'claude-api', status: 'spawning' }),
      created_at: ts,
    });

    const events = state.getEventsByAgent('test-team', 'orchestrator');
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0]!.payload) as Record<string, unknown>;
    expect(payload.name).toBe('bob');
    expect(payload.id).toBe('bob-id');
    expect(payload.provider).toBe('claude-api');
    expect(payload.status).toBe('spawning');
  });

  it('appendEvent teammate_idle payload has required fields', () => {
    const ts = Date.now();
    state.appendEvent({
      team_name: 'test-team',
      agent: 'carol',
      kind: 'teammate_idle',
      payload: JSON.stringify({ name: 'carol', last_activity_ts: ts }),
      created_at: ts,
    });

    const events = state.getEventsByAgent('test-team', 'carol');
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('teammate_idle');
    const payload = JSON.parse(events[0]!.payload) as Record<string, unknown>;
    expect(payload.name).toBe('carol');
    expect(typeof payload.last_activity_ts).toBe('number');
  });

  it('appendEvent teammate_shutdown payload has required fields', () => {
    const ts = Date.now();
    state.appendEvent({
      team_name: 'test-team',
      agent: 'dave',
      kind: 'teammate_shutdown',
      payload: JSON.stringify({ name: 'dave' }),
      created_at: ts,
    });

    const events = state.getEventsByAgent('test-team', 'dave');
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('teammate_shutdown');
    const payload = JSON.parse(events[0]!.payload) as Record<string, unknown>;
    expect(payload.name).toBe('dave');
  });

  it('full lifecycle events are persisted and readable in order from state DB', () => {
    const ts = Date.now();
    state.appendEvent({
      team_name: 'test-team',
      agent: 'orchestrator',
      kind: 'teammate_spawned',
      payload: JSON.stringify({ name: 'eve', id: 'eve-id', provider: 'claude-api', status: 'spawning' }),
      created_at: ts,
    });
    state.appendEvent({
      team_name: 'test-team',
      agent: 'eve',
      kind: 'teammate_idle',
      payload: JSON.stringify({ name: 'eve', last_activity_ts: ts + 1000 }),
      created_at: ts + 1000,
    });
    state.appendEvent({
      team_name: 'test-team',
      agent: 'eve',
      kind: 'teammate_shutdown',
      payload: JSON.stringify({ name: 'eve' }),
      created_at: ts + 2000,
    });

    const allEvents = state.getRecentEvents('test-team', 10);
    const kinds = allEvents.map((e) => e.kind);
    expect(kinds).toContain('teammate_spawned');
    expect(kinds).toContain('teammate_idle');
    expect(kinds).toContain('teammate_shutdown');

    const eveIdle = state.getEventsByAgent('test-team', 'eve');
    expect(eveIdle).toHaveLength(2);
    expect(eveIdle.map((e) => e.kind)).toEqual(['teammate_idle', 'teammate_shutdown']);
  });
});
