import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openDb } from '../../src/state/db.js';
import { createTeam } from '../../src/state/teams.js';
import { createTask, claimTask, getTask } from '../../src/state/tasks.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let tmpDir: string;
const TEAM = 'test-team';
const TASK_ID = 'task-1';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agent-teams-test-'));
  const dbPath = join(tmpDir, 'state.db');

  // Override lock dir via env so proper-lockfile uses temp dir
  process.env['AGENT_TEAMS_LOCK_DIR'] = tmpDir;

  db = openDb(dbPath);
  createTeam(db, {
    name: TEAM,
    created_at: Date.now(),
    lead_session_id: 'sess-1',
    lead_provider: 'test',
    permission_mode: 'default',
    working_dir: tmpDir,
    status: 'active',
  });

  createTask(db, {
    id: TASK_ID,
    team_name: TEAM,
    title: 'Test task',
    description: null,
    status: 'pending',
    assigned_to: null,
    claim_lock_owner: null,
    claim_lock_expires: null,
    depends_on: null,
    result: null,
    created_by: 'lead',
    created_at: Date.now(),
    updated_at: Date.now(),
  });
});

afterEach(() => {
  db.close();
  delete process.env['AGENT_TEAMS_LOCK_DIR'];
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('concurrent claim race', () => {
  it('only one claimer wins when two race on the same task', async () => {
    const results = await Promise.all([
      claimTask(db, TASK_ID, TEAM, 'alice'),
      claimTask(db, TASK_ID, TEAM, 'bob'),
    ]);

    const wins = results.filter(Boolean).length;
    expect(wins).toBe(1);

    const task = getTask(db, TASK_ID);
    expect(task?.status).toBe('in_progress');
    expect(['alice', 'bob']).toContain(task?.assigned_to);
  });

  it('returns false for tasks not in pending status', async () => {
    // first claim succeeds
    await claimTask(db, TASK_ID, TEAM, 'alice');

    // second claim on already claimed task fails
    const result = await claimTask(db, TASK_ID, TEAM, 'bob');
    expect(result).toBe(false);

    const task = getTask(db, TASK_ID);
    expect(task?.assigned_to).toBe('alice');
  });

  it('returns false for non-existent task', async () => {
    const result = await claimTask(db, 'nonexistent', TEAM, 'alice');
    expect(result).toBe(false);
  });
});
