import { describe, it, expect } from 'vitest';
import { runHook } from '../../src/hooks/runner.js';
import type { TaskCompletedPayload } from '../../src/hooks/types.js';

const payload: TaskCompletedPayload = {
  team: 'my-team',
  task: { id: 'task-42', title: 'Write tests', result: 'done', assigned_to: 'worker-1' },
};

describe('payload delivery', () => {
  it('hook stdin receives exact JSON payload', async () => {
    // The hook reads stdin and echoes it on stderr so we can capture it
    const result = await runHook(
      'stdin=$(cat); echo "$stdin" >&2; exit 2',
      'TaskCompleted',
      payload,
    );
    expect(result.allowed).toBe(false);
    const received = JSON.parse(result.feedback ?? '{}') as typeof payload;
    expect(received.team).toBe(payload.team);
    expect(received.task.id).toBe(payload.task.id);
    expect(received.task.title).toBe(payload.task.title);
  });

  it('AGENT_TEAMS_HOOK_EVENT env var is set', async () => {
    const result = await runHook(
      'echo "$AGENT_TEAMS_HOOK_EVENT" >&2; exit 2',
      'TaskCompleted',
      payload,
    );
    expect(result.feedback).toContain('TaskCompleted');
  });
});
