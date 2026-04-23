import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { State } from '../../src/state/index.js';

describe('message routing via state + notifier', () => {
  let state: State;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'msg-test-'));
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

  it('message inserted by teammate is visible to lead query', async () => {
    state.insertMessage({
      team_name: 'test-team',
      from_agent: 'worker-1',
      to_agent: 'lead',
      kind: 'message',
      body: JSON.stringify({ text: 'I completed the task' }),
      created_at: Date.now(),
    });

    const msgs = state.getMessages('test-team', { toAgent: 'lead' });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.from_agent).toBe('worker-1');
    const body = JSON.parse(msgs[0]?.body ?? '{}') as { text: string };
    expect(body.text).toContain('completed');
  });

  it('notifier fires message event within 500ms of insert', async () => {
    const notifier = state.startNotifier('test-team');
    const received: unknown[] = [];

    notifier.on('message', (e) => {
      received.push(e.message);
    });

    // Insert after notifier starts
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    state.insertMessage({
      team_name: 'test-team',
      from_agent: 'worker-1',
      to_agent: 'lead',
      kind: 'message',
      body: JSON.stringify({ text: 'hello' }),
      created_at: Date.now(),
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    notifier.stop();

    expect(received.length).toBeGreaterThan(0);
  }, 3000);

  it('plan_request message is stored with correct kind', () => {
    state.insertMessage({
      team_name: 'test-team',
      from_agent: 'worker-1',
      to_agent: 'lead',
      kind: 'plan_request',
      body: JSON.stringify({ plan: 'Step 1: analyze. Step 2: implement.' }),
      created_at: Date.now(),
    });

    const msgs = state.getMessages('test-team', { kind: 'plan_request' });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.kind).toBe('plan_request');
  });
});
