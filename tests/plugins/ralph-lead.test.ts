/**
 * Test that TeamLead's setRalphPromise correctly drives the loop to exit
 * when the promise appears, and bounds iterations when it doesn't.
 *
 * Uses a stub provider that returns canned text — no live API calls.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TeamLead } from '../../src/orchestrator/lead.js';
import { registerBackend } from '../../src/providers/registry.js';
import type { AgentBackend, AgentTurnResult } from '../../src/providers/types.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ccteam-ralphlead-'));
  // Keep state.db in tmp by setting HOME (lead resolves via homedir())
  process.env['HOME_ORIG'] = process.env['HOME'] ?? '';
  process.env['HOME'] = tmp;
});

afterEach(() => {
  process.env['HOME'] = process.env['HOME_ORIG'] ?? '';
  rmSync(tmp, { recursive: true, force: true });
});

/** Stub provider that returns a sequence of canned text outputs. */
class SequenceBackend implements AgentBackend {
  readonly id = 'seq';
  readonly label = 'seq';
  readonly model = 'seq';
  private idx = 0;
  constructor(public outputs: string[]) { }
  async run(opts: Parameters<AgentBackend['run']>[0]): Promise<AgentTurnResult> {
    const text = this.outputs[this.idx] ?? '(no more)';
    this.idx++;
    opts.onEvent({ type: 'text_delta', text });
    opts.onEvent({ type: 'done', stop_reason: 'stop' });
    return { stop_reason: 'stop', text, tool_calls: [] };
  }
  async shutdown(): Promise<void> { /* noop */ }
}

describe('TeamLead ralph-loop integration', () => {
  it('setRalphPromise enables loop; exits when promise appears', async () => {
    // Register stub as 'seq-stub' provider type
    registerBackend('seq-stub-1', (_id, _cfg) => {
      return new SequenceBackend([
        'first attempt, not done yet',
        'second attempt, progressing',
        'task complete <promise>DONE</promise>',
      ]);
    });

    const events: Array<{ kind: string; payload: Record<string, unknown> }> = [];
    const lead = new TeamLead({
      teamName: 'ralph-exit',
      prompt: 'build thing',
      leadProvider: 'seq-stub-1',
      teammateProvider: 'seq-stub-1',
      dangerouslySkipPermissions: true,
      debug: false,
      onEvent: (_agent, kind, payload) => events.push({ kind, payload }),
      workingDir: tmp,
    });
    lead.setRalphPromise('<promise>DONE</promise>', 10);
    await lead.run();
    await lead.shutdown();

    const completed = events.find((e) => e.kind === 'ralph_completed');
    expect(completed).toBeDefined();
    expect(completed!.payload.promise).toBe('<promise>DONE</promise>');

    const iterations = events.filter((e) => e.kind === 'ralph_iteration');
    expect(iterations.length).toBe(2); // iterations 1, 2 without promise; 3rd has it → completion
  }, 15000);

  it('enforces maxIterations when promise never appears', async () => {
    registerBackend('seq-stub-2', () => {
      return new SequenceBackend([
        'attempt 1', 'attempt 2', 'attempt 3', 'attempt 4', 'attempt 5',
        'attempt 6', 'attempt 7', 'attempt 8', 'attempt 9', 'attempt 10',
      ]);
    });

    const events: Array<{ kind: string; payload: Record<string, unknown> }> = [];
    const lead = new TeamLead({
      teamName: 'ralph-max',
      prompt: 'do thing',
      leadProvider: 'seq-stub-2',
      teammateProvider: 'seq-stub-2',
      dangerouslySkipPermissions: true,
      debug: false,
      onEvent: (_agent, kind, payload) => events.push({ kind, payload }),
      workingDir: tmp,
    });
    lead.setRalphPromise('<promise>DONE</promise>', 3);
    await lead.run();
    await lead.shutdown();

    const maxHit = events.find((e) => e.kind === 'ralph_max_iterations');
    expect(maxHit).toBeDefined();
    expect(maxHit!.payload.iteration).toBe(3);
    // Should not have a ralph_completed since promise never appeared
    expect(events.find((e) => e.kind === 'ralph_completed')).toBeUndefined();
  }, 15000);

  it('with ralphPromise=null, lead exits normally after first turn', async () => {
    registerBackend('seq-stub-3', () => new SequenceBackend(['one and done']));
    const events: Array<{ kind: string; payload: Record<string, unknown> }> = [];
    const lead = new TeamLead({
      teamName: 'no-ralph',
      prompt: 'quick task',
      leadProvider: 'seq-stub-3',
      teammateProvider: 'seq-stub-3',
      dangerouslySkipPermissions: true,
      debug: false,
      onEvent: (_agent, kind, payload) => events.push({ kind, payload }),
      workingDir: tmp,
    });
    // no setRalphPromise — default null
    await lead.run();
    await lead.shutdown();

    expect(events.find((e) => e.kind === 'ralph_iteration')).toBeUndefined();
    expect(events.find((e) => e.kind === 'ralph_completed')).toBeUndefined();
    expect(events.find((e) => e.kind === 'done')).toBeDefined();
  }, 10000);
});
