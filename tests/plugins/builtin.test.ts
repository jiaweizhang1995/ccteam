import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PluginRegistry } from '../../src/plugins/registry.js';
import { registerBuiltins } from '../../src/plugins/builtin/index.js';
import { ralphLoopBuiltin } from '../../src/plugins/builtin/ralph-loop.js';
import type { PluginContext } from '../../src/plugins/types.js';

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'ccteam-builtin-'));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function mkCtx(args: string, overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    args,
    teamName: 't',
    cwd,
    emit: () => { /* noop */ },
    setPendingPrompt: () => { /* noop */ },
    setCompletionPromise: () => { /* noop */ },
    ...overrides,
  };
}

describe('registerBuiltins', () => {
  it('registers /plan and /ralph-loop', () => {
    const r = new PluginRegistry();
    registerBuiltins(r);
    expect(r.get('/plan')).toBeDefined();
    expect(r.get('/ralph-loop')).toBeDefined();
    expect(r.getBuiltin('plan')).toBeDefined();
    expect(r.getBuiltin('ralph-loop')).toBeDefined();
  });

  it('/ralph-loop has completionPromise=DONE', () => {
    const r = new PluginRegistry();
    registerBuiltins(r);
    expect(r.get('/ralph-loop')!.completionPromise).toBe('DONE');
  });
});

describe('ralphLoopBuiltin', () => {
  it('writes state file on first invocation', async () => {
    const emitted: Array<{ kind: string; payload: Record<string, unknown> }> = [];
    let pending = '';
    let promiseSet = '';

    await ralphLoopBuiltin(mkCtx('build a todo app', {
      emit: (kind, payload) => emitted.push({ kind, payload }),
      setPendingPrompt: (p) => { pending = p; },
      setCompletionPromise: (p) => { promiseSet = p; },
    }));

    const statePath = join(cwd, '.ccteam', 'ralph', 'state.md');
    expect(existsSync(statePath)).toBe(true);
    const content = readFileSync(statePath, 'utf8');
    expect(content).toContain('iteration: 1');
    expect(content).toContain('build a todo app');

    expect(emitted.some((e) => e.kind === 'ralph_loop_started')).toBe(true);
    expect(pending).toContain('build a todo app');
    expect(promiseSet).toBe('<promise>DONE</promise>');
  });

  it('increments iteration on subsequent calls', async () => {
    await ralphLoopBuiltin(mkCtx('task A'));
    await ralphLoopBuiltin(mkCtx('task A'));
    await ralphLoopBuiltin(mkCtx('task A'));
    const content = readFileSync(join(cwd, '.ccteam', 'ralph', 'state.md'), 'utf8');
    expect(content).toContain('iteration: 3');
  });

  it('errors on empty args', async () => {
    const emitted: Array<{ kind: string; payload: Record<string, unknown> }> = [];
    await ralphLoopBuiltin(mkCtx('', {
      emit: (kind, payload) => emitted.push({ kind, payload }),
    }));
    expect(emitted.some((e) =>
      e.kind === 'plugin_output'
      && (e.payload.stream === 'stderr')
      && String(e.payload.text).includes('usage'))).toBe(true);
    const statePath = join(cwd, '.ccteam', 'ralph', 'state.md');
    expect(existsSync(statePath)).toBe(false);
  });
});
