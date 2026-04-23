import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openDb } from '../../src/state/db.js';
import { createTeam } from '../../src/state/teams.js';
import { createTask, claimTask, completeTask, getTask, getUnblockedPendingTasks } from '../../src/state/tasks.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let tmpDir: string;
const TEAM = 'test-team';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agent-teams-dep-'));
  const dbPath = join(tmpDir, 'state.db');
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
});

afterEach(() => {
  db.close();
  delete process.env['AGENT_TEAMS_LOCK_DIR'];
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('dependency unblocking', () => {
  it('blocked task cannot be claimed before dependency completes', async () => {
    const now = Date.now();
    createTask(db, {
      id: 'task-a',
      team_name: TEAM,
      title: 'Task A',
      description: null,
      status: 'pending',
      assigned_to: null,
      claim_lock_owner: null,
      claim_lock_expires: null,
      depends_on: null,
      result: null,
      created_by: 'lead',
      created_at: now,
      updated_at: now,
    });

    createTask(db, {
      id: 'task-b',
      team_name: TEAM,
      title: 'Task B (depends on A)',
      description: null,
      status: 'pending',
      assigned_to: null,
      claim_lock_owner: null,
      claim_lock_expires: null,
      depends_on: JSON.stringify(['task-a']),
      result: null,
      created_by: 'lead',
      created_at: now + 1,
      updated_at: now + 1,
    });

    // task-b should not be claimable before task-a completes
    const claimBefore = await claimTask(db, 'task-b', TEAM, 'alice');
    expect(claimBefore).toBe(false);

    // unblocked tasks should only include task-a
    const unblocked = getUnblockedPendingTasks(db, TEAM);
    expect(unblocked.map(t => t.id)).toContain('task-a');
    expect(unblocked.map(t => t.id)).not.toContain('task-b');
  });

  it('task becomes claimable after its dependency completes', async () => {
    const now = Date.now();
    createTask(db, {
      id: 'task-a',
      team_name: TEAM,
      title: 'Task A',
      description: null,
      status: 'pending',
      assigned_to: null,
      claim_lock_owner: null,
      claim_lock_expires: null,
      depends_on: null,
      result: null,
      created_by: 'lead',
      created_at: now,
      updated_at: now,
    });

    createTask(db, {
      id: 'task-b',
      team_name: TEAM,
      title: 'Task B',
      description: null,
      status: 'pending',
      assigned_to: null,
      claim_lock_owner: null,
      claim_lock_expires: null,
      depends_on: JSON.stringify(['task-a']),
      result: null,
      created_by: 'lead',
      created_at: now + 1,
      updated_at: now + 1,
    });

    // Complete task-a
    await claimTask(db, 'task-a', TEAM, 'alice');
    completeTask(db, 'task-a', 'done');

    // task-b should now be claimable
    const claimResult = await claimTask(db, 'task-b', TEAM, 'bob');
    expect(claimResult).toBe(true);

    const taskB = getTask(db, 'task-b');
    expect(taskB?.status).toBe('in_progress');
    expect(taskB?.assigned_to).toBe('bob');
  });

  it('getUnblockedPendingTasks returns all tasks when no dependencies', async () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      createTask(db, {
        id: `task-${i}`,
        team_name: TEAM,
        title: `Task ${i}`,
        description: null,
        status: 'pending',
        assigned_to: null,
        claim_lock_owner: null,
        claim_lock_expires: null,
        depends_on: null,
        result: null,
        created_by: 'lead',
        created_at: now + i,
        updated_at: now + i,
      });
    }

    const unblocked = getUnblockedPendingTasks(db, TEAM);
    expect(unblocked).toHaveLength(3);
  });
});
