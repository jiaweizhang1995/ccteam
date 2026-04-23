import { describe, it, expect, afterEach } from 'vitest';
import { makeStubState, addTeammate, addTask } from './stub-state.js';
import { bootClient, callTool, defaultIdentity } from './helpers.js';

describe('MCP server end-to-end', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it('list_teammates returns team roster', async () => {
    const state = makeStubState();
    addTeammate(state, 'worker-1');
    addTeammate(state, 'worker-2');

    const { client, cleanup: c } = await bootClient(state);
    cleanup = c;

    const { text } = await callTool(client, 'list_teammates');
    const rows = JSON.parse(text);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('worker-1');
  });

  it('list_tasks returns tasks with filter', async () => {
    const state = makeStubState();
    addTask(state, 'task-1', 'Task A');
    addTask(state, 'task-2', 'Task B', 'test-team', 'completed');

    const { client, cleanup: c } = await bootClient(state);
    cleanup = c;

    const { text } = await callTool(client, 'list_tasks', { filter: 'pending' });
    const rows = JSON.parse(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('task-1');
  });

  it('create_task creates a task and returns it', async () => {
    const state = makeStubState();
    const { client, cleanup: c } = await bootClient(state);
    cleanup = c;

    const { text, isError } = await callTool(client, 'create_task', {
      title: 'Build feature X',
      description: 'Detailed description',
    });

    expect(isError).toBe(false);
    const task = JSON.parse(text);
    expect(task.title).toBe('Build feature X');
    expect(task.status).toBe('pending');
    expect(state.tasks.size).toBe(1);
  });

  it('claim_task atomically claims a pending task', async () => {
    const state = makeStubState();
    addTask(state, 'task-1', 'Do work');

    const { client, cleanup: c } = await bootClient(state);
    cleanup = c;

    const { text, isError } = await callTool(client, 'claim_task', { task_id: 'task-1' });
    expect(isError).toBe(false);
    expect(text).toContain('claimed successfully');

    const task = state.tasks.get('task-1');
    expect(task?.status).toBe('in_progress');
    expect(task?.assigned_to).toBe(defaultIdentity.agentName);
  });

  it('claim_task fails on already-claimed task', async () => {
    const state = makeStubState();
    addTask(state, 'task-1', 'Do work', 'test-team', 'in_progress');

    const { client, cleanup: c } = await bootClient(state);
    cleanup = c;

    const { isError } = await callTool(client, 'claim_task', { task_id: 'task-1' });
    expect(isError).toBe(true);
  });

  it('complete_task marks task done', async () => {
    const state = makeStubState();
    addTask(state, 'task-1', 'Do work', 'test-team', 'in_progress');

    const { client, cleanup: c } = await bootClient(state);
    cleanup = c;

    const { isError } = await callTool(client, 'complete_task', { task_id: 'task-1', result: 'All done' });
    expect(isError).toBe(false);

    const task = state.tasks.get('task-1');
    expect(task?.status).toBe('completed');
    expect(task?.result).toBe('All done');
  });

  it('send_message inserts message into mailbox', async () => {
    const state = makeStubState();
    addTeammate(state, 'lead', 'test-team', 'active');

    const { client, cleanup: c } = await bootClient(state);
    cleanup = c;

    const { isError } = await callTool(client, 'send_message', { to: 'lead', body: 'Hello lead!' });
    expect(isError).toBe(false);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.to_agent).toBe('lead');
    const body = JSON.parse(state.messages[0]?.body ?? '{}') as { text: string };
    expect(body.text).toBe('Hello lead!');
  });

  it('broadcast sends to all active teammates', async () => {
    const state = makeStubState();
    addTeammate(state, 'worker-2');
    addTeammate(state, 'worker-3');
    addTeammate(state, 'worker-1'); // self — should be excluded

    const { client, cleanup: c } = await bootClient(state, { ...defaultIdentity, agentName: 'worker-1' });
    cleanup = c;

    const { isError } = await callTool(client, 'broadcast', { body: 'All hands!' });
    expect(isError).toBe(false);
    // worker-1 excluded from recipients
    expect(state.messages).toHaveLength(2);
  });

  it('submit_plan inserts plan_request message and returns when lead approves', async () => {
    const state = makeStubState();
    const { client, cleanup: c } = await bootClient(state);
    cleanup = c;

    // Simulate lead replying after a short delay
    const approveAfterInsert = new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        const planMsg = state.messages.find((m) => m.kind === 'plan_request');
        if (!planMsg) return;
        clearInterval(poll);
        const body = JSON.parse(planMsg.body) as { request_id?: string };
        state.insertMessage({
          team_name: defaultIdentity.teamName,
          from_agent: 'lead',
          to_agent: defaultIdentity.agentName,
          kind: 'plan_decision',
          body: JSON.stringify({ decision: 'approve', request_id: body.request_id }),
          created_at: Date.now(),
        });
        resolve();
      }, 50);
    });

    const [result] = await Promise.all([
      callTool(client, 'submit_plan', { plan: 'Step 1: do X. Step 2: do Y.' }),
      approveAfterInsert,
    ]);

    expect(state.messages.some((m) => m.kind === 'plan_request')).toBe(true);
    expect(state.messages.some((m) => m.kind === 'plan_request' && m.to_agent === 'lead')).toBe(true);
    expect(result.isError).toBe(false);
    expect(result.text).toContain('approved');
  }, 15000);
});
