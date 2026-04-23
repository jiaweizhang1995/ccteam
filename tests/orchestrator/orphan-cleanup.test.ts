import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { State, openDb } from '../../src/state/index.js';
import { cleanupOrphans } from '../../src/orchestrator/orphan-cleanup.js';

describe('orphan-cleanup', () => {
  let state: State;
  let dbPath: string;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-test-'));
    dbPath = join(dir, 'test.db');
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
  });

  it('marks teammate with dead pid as shutdown', () => {
    state.createTeammate({
      id: 'tm-1',
      team_name: 'test-team',
      name: 'worker-1',
      agent_type: null,
      provider: 'claude-api',
      model: null,
      system_prompt: null,
      pid: 999999, // very unlikely to be alive
      pane_id: null,
      status: 'active',
      tools_allowlist: null,
    });

    cleanupOrphans(state, 'test-team');

    const tm = state.getTeammate('tm-1');
    expect(tm?.status).toBe('shutdown');
  });

  it('leaves teammates with no pid unchanged', () => {
    state.createTeammate({
      id: 'tm-2',
      team_name: 'test-team',
      name: 'worker-2',
      agent_type: null,
      provider: 'claude-api',
      model: null,
      system_prompt: null,
      pid: null,
      pane_id: null,
      status: 'active',
      tools_allowlist: null,
    });

    cleanupOrphans(state, 'test-team');

    const tm = state.getTeammate('tm-2');
    expect(tm?.status).toBe('active');
  });

  it('leaves already-shutdown teammates unchanged', () => {
    state.createTeammate({
      id: 'tm-3',
      team_name: 'test-team',
      name: 'worker-3',
      agent_type: null,
      provider: 'claude-api',
      model: null,
      system_prompt: null,
      pid: 999999,
      pane_id: null,
      status: 'shutdown',
      tools_allowlist: null,
    });

    cleanupOrphans(state, 'test-team');

    const tm = state.getTeammate('tm-3');
    expect(tm?.status).toBe('shutdown');
  });
});
