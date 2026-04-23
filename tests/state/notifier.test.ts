import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openDb } from '../../src/state/db.js';
import { createTeam } from '../../src/state/teams.js';
import { insertMessage } from '../../src/state/mailbox.js';
import { createTask, completeTask } from '../../src/state/tasks.js';
import { appendEvent } from '../../src/state/events.js';
import { StateNotifier } from '../../src/state/notifier.js';
import type Database from 'better-sqlite3';
import type { NotifierEvent } from '../../src/types/index.js';

let db: Database.Database;
let tmpDir: string;
const TEAM = 'test-team';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agent-teams-notifier-'));
  const dbPath = join(tmpDir, 'state.db');
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
  rmSync(tmpDir, { recursive: true, force: true });
});

function waitForEvent<T>(
  notifier: StateNotifier,
  eventName: string,
  timeoutMs: number = 500
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for '${eventName}'`)), timeoutMs);
    notifier.once(eventName, (e: T) => {
      clearTimeout(timer);
      resolve(e);
    });
  });
}

describe('state notifier', () => {
  it('fires message event within 500ms of insert', async () => {
    const notifier = new StateNotifier(db, TEAM);
    notifier.start();

    const eventPromise = waitForEvent<Extract<NotifierEvent, { type: 'message' }>>(notifier, 'message');

    insertMessage(db, {
      team_name: TEAM,
      from_agent: 'lead',
      to_agent: 'alice',
      kind: 'message',
      body: JSON.stringify({ text: 'ping' }),
      created_at: Date.now(),
    });

    const event = await eventPromise;
    notifier.stop();

    expect(event.type).toBe('message');
    expect(event.message.from_agent).toBe('lead');
  });

  it('fires task_updated event within 500ms of task change', async () => {
    const now = Date.now();
    createTask(db, {
      id: 'task-watch',
      team_name: TEAM,
      title: 'Watched task',
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

    const notifier = new StateNotifier(db, TEAM);
    notifier.start();

    const eventPromise = waitForEvent<Extract<NotifierEvent, { type: 'task_updated' }>>(notifier, 'task_updated');

    // Slight delay to ensure notifier cursor is past the create
    await new Promise(r => setTimeout(r, 50));
    completeTask(db, 'task-watch', 'result-value');

    const event = await eventPromise;
    notifier.stop();

    expect(event.type).toBe('task_updated');
    expect(event.task.id).toBe('task-watch');
    expect(event.task.status).toBe('completed');
  });

  it('fires event_appended event within 500ms of append', async () => {
    const notifier = new StateNotifier(db, TEAM);
    notifier.start();

    const eventPromise = waitForEvent<Extract<NotifierEvent, { type: 'event_appended' }>>(notifier, 'event_appended');

    appendEvent(db, {
      team_name: TEAM,
      agent: 'alice',
      kind: 'text',
      payload: JSON.stringify({ text: 'working...' }),
      created_at: Date.now(),
    });

    const event = await eventPromise;
    notifier.stop();

    expect(event.type).toBe('event_appended');
    expect(event.event.agent).toBe('alice');
    expect(event.event.kind).toBe('text');
  });

  it('does not fire events after stop()', async () => {
    const notifier = new StateNotifier(db, TEAM);
    notifier.start();
    notifier.stop();

    let fired = false;
    notifier.on('message', () => { fired = true; });

    insertMessage(db, {
      team_name: TEAM,
      from_agent: 'lead',
      to_agent: 'bob',
      kind: 'message',
      body: JSON.stringify({ text: 'after stop' }),
      created_at: Date.now(),
    });

    await new Promise(r => setTimeout(r, 400));
    expect(fired).toBe(false);
  });
});
