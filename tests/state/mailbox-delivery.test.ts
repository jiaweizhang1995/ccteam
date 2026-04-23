import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openDb } from '../../src/state/db.js';
import { createTeam } from '../../src/state/teams.js';
import { createTeammate } from '../../src/state/teammates.js';
import { broadcast, insertMessage, fetchUndelivered, markDelivered, markManyDelivered } from '../../src/state/mailbox.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let tmpDir: string;
const TEAM = 'test-team';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agent-teams-mail-'));
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

  for (const name of ['alice', 'bob', 'carol']) {
    createTeammate(db, {
      id: `tm-${name}`,
      team_name: TEAM,
      name,
      agent_type: null,
      provider: 'test',
      model: null,
      system_prompt: null,
      pid: null,
      pane_id: null,
      status: 'active',
      tools_allowlist: null,
    });
  }
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('mailbox delivery', () => {
  it('direct message delivered only to recipient', () => {
    insertMessage(db, {
      team_name: TEAM,
      from_agent: 'lead',
      to_agent: 'alice',
      kind: 'message',
      body: JSON.stringify({ text: 'hello alice' }),
      created_at: Date.now(),
    });

    const forAlice = fetchUndelivered(db, TEAM, 'alice');
    const forBob = fetchUndelivered(db, TEAM, 'bob');

    expect(forAlice).toHaveLength(1);
    expect(forBob).toHaveLength(0);
  });

  it('broadcast delivered to all teammates exactly once each', () => {
    broadcast(db, {
      team_name: TEAM,
      from_agent: 'lead',
      kind: 'message',
      body: JSON.stringify({ text: 'hello everyone' }),
      created_at: Date.now(),
    });

    // Fetch for each teammate
    const forAlice = fetchUndelivered(db, TEAM, 'alice');
    const forBob = fetchUndelivered(db, TEAM, 'bob');
    const forCarol = fetchUndelivered(db, TEAM, 'carol');

    expect(forAlice).toHaveLength(1);
    expect(forBob).toHaveLength(1);
    expect(forCarol).toHaveLength(1);
  });

  it('marking delivered hides message from subsequent fetches', () => {
    const msgId = insertMessage(db, {
      team_name: TEAM,
      from_agent: 'lead',
      to_agent: 'alice',
      kind: 'message',
      body: JSON.stringify({ text: 'hello' }),
      created_at: Date.now(),
    });

    markDelivered(db, msgId, 'alice');

    const afterDelivery = fetchUndelivered(db, TEAM, 'alice');
    expect(afterDelivery).toHaveLength(0);
  });

  it('markManyDelivered marks multiple messages at once', () => {
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(insertMessage(db, {
        team_name: TEAM,
        from_agent: 'lead',
        to_agent: 'alice',
        kind: 'message',
        body: JSON.stringify({ text: `msg ${i}` }),
        created_at: Date.now() + i,
      }));
    }

    markManyDelivered(db, ids.map(id => ({ messageId: id, recipientName: 'alice' })));

    const remaining = fetchUndelivered(db, TEAM, 'alice');
    expect(remaining).toHaveLength(0);
  });

  it('broadcast marked delivered to alice does not hide from bob', () => {
    broadcast(db, {
      team_name: TEAM,
      from_agent: 'lead',
      kind: 'message',
      body: JSON.stringify({ text: 'hello all' }),
      created_at: Date.now(),
    });

    const [aliceMsg] = fetchUndelivered(db, TEAM, 'alice');
    expect(aliceMsg).toBeDefined();

    markDelivered(db, aliceMsg!.id, 'alice');

    // alice no longer sees it
    expect(fetchUndelivered(db, TEAM, 'alice')).toHaveLength(0);
    // bob and carol still see it
    expect(fetchUndelivered(db, TEAM, 'bob')).toHaveLength(1);
    expect(fetchUndelivered(db, TEAM, 'carol')).toHaveLength(1);
  });

  it('undelivered messages accumulate until fetched', () => {
    for (let i = 0; i < 5; i++) {
      insertMessage(db, {
        team_name: TEAM,
        from_agent: 'lead',
        to_agent: 'bob',
        kind: 'message',
        body: JSON.stringify({ text: `msg ${i}` }),
        created_at: Date.now() + i,
      });
    }

    const msgs = fetchUndelivered(db, TEAM, 'bob');
    expect(msgs).toHaveLength(5);
  });
});
