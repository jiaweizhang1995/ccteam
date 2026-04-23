import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { State } from '../../src/state/index.js';
import { killAllTeammates } from '../../src/orchestrator/orphan-cleanup.js';

describe('spawn + shutdown lifecycle', () => {
  let state: State;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spawn-test-'));
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

  it('killAllTeammates shuts down all non-shutdown teammates', async () => {
    state.createTeammate({
      id: 'tm-1', team_name: 'test-team', name: 'w1',
      agent_type: null, provider: 'claude-api', model: null, system_prompt: null,
      pid: null, pane_id: null, status: 'active', tools_allowlist: null,
    });
    state.createTeammate({
      id: 'tm-2', team_name: 'test-team', name: 'w2',
      agent_type: null, provider: 'claude-api', model: null, system_prompt: null,
      pid: null, pane_id: null, status: 'idle', tools_allowlist: null,
    });
    state.createTeammate({
      id: 'tm-3', team_name: 'test-team', name: 'w3',
      agent_type: null, provider: 'claude-api', model: null, system_prompt: null,
      pid: null, pane_id: null, status: 'shutdown', tools_allowlist: null,
    });

    await killAllTeammates(state, 'test-team', 100);

    expect(state.getTeammate('tm-1')?.status).toBe('shutdown');
    expect(state.getTeammate('tm-2')?.status).toBe('shutdown');
    expect(state.getTeammate('tm-3')?.status).toBe('shutdown'); // already shutdown — stays
  }, 5000);

  it('listActiveTeammates only returns non-shutdown', () => {
    state.createTeammate({
      id: 'tm-4', team_name: 'test-team', name: 'w4',
      agent_type: null, provider: 'claude-api', model: null, system_prompt: null,
      pid: null, pane_id: null, status: 'active', tools_allowlist: null,
    });
    state.createTeammate({
      id: 'tm-5', team_name: 'test-team', name: 'w5',
      agent_type: null, provider: 'claude-api', model: null, system_prompt: null,
      pid: null, pane_id: null, status: 'shutdown', tools_allowlist: null,
    });

    const active = state.listActiveTeammates('test-team');
    expect(active.map((t) => t.id)).toContain('tm-4');
    expect(active.map((t) => t.id)).not.toContain('tm-5');
  });
});
