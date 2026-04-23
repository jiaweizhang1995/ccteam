import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ralphLoopBuiltin } from '../../src/plugins/builtin/ralph-loop.js';
import type { PluginContext } from '../../src/plugins/types.js';

let cwd: string;

beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'ccteam-ralph-')); });
afterEach(() => { rmSync(cwd, { recursive: true, force: true }); });

function mkCtx(args: string, overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    args, teamName: 't', cwd,
    emit: () => { /* noop */ },
    setPendingPrompt: () => { /* noop */ },
    setCompletionPromise: () => { /* noop */ },
    activateRalphLoop: () => { /* noop */ },
    ...overrides,
  };
}

describe('ralph-loop activation (runtime loop wiring)', () => {
  it('invokes activateRalphLoop with <promise>DONE</promise> and default maxIterations', async () => {
    const calls: Array<{ promise: string; maxIterations: number | undefined }> = [];
    await ralphLoopBuiltin(mkCtx('ship feature X', {
      activateRalphLoop: (promise, maxIterations) => { calls.push({ promise, maxIterations }); },
    }));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.promise).toBe('<promise>DONE</promise>');
    expect(calls[0]!.maxIterations).toBe(20);
  });

  it('works fine when activateRalphLoop not provided (falls back to state file)', async () => {
    // no activateRalphLoop → should not throw
    await expect(
      ralphLoopBuiltin(mkCtx('task', { activateRalphLoop: undefined })),
    ).resolves.toBeUndefined();
    expect(existsSync(join(cwd, '.ccteam', 'ralph', 'state.md'))).toBe(true);
  });

  it('emits ralph_loop_started event with iteration metadata', async () => {
    const events: Array<{ kind: string; payload: Record<string, unknown> }> = [];
    await ralphLoopBuiltin(mkCtx('build it', {
      emit: (kind, payload) => events.push({ kind, payload }),
    }));
    const started = events.find((e) => e.kind === 'ralph_loop_started');
    expect(started).toBeDefined();
    expect(started!.payload.iteration).toBe(1);
    expect(started!.payload.completionPromise).toBe('DONE');
  });

  it('state file contains completion promise template', async () => {
    await ralphLoopBuiltin(mkCtx('do stuff'));
    const content = readFileSync(join(cwd, '.ccteam', 'ralph', 'state.md'), 'utf8');
    expect(content).toContain('<promise>DONE</promise>');
    expect(content).toContain('do stuff');
    expect(content).toContain('Rules for you');
  });
});
