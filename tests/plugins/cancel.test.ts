import { describe, it, expect } from 'vitest';
import { cancelBuiltin, CANCEL_PLUGIN } from '../../src/plugins/builtin/cancel.js';
import type { PluginContext } from '../../src/plugins/types.js';

function mkCtx(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    args: '',
    teamName: 't',
    cwd: '/tmp',
    emit: () => { /* noop */ },
    setPendingPrompt: () => { /* noop */ },
    setCompletionPromise: () => { /* noop */ },
    activateRalphLoop: () => { /* noop */ },
    ...overrides,
  };
}

describe('CANCEL_PLUGIN', () => {
  it('has the /cancel command registered', () => {
    expect(CANCEL_PLUGIN.command).toBe('/cancel');
    expect(CANCEL_PLUGIN.handler).toBe('builtin');
    expect(CANCEL_PLUGIN.builtinKey).toBe('cancel');
  });
});

describe('cancelBuiltin', () => {
  it('invokes activateRalphLoop with null to clear loop', async () => {
    const calls: Array<{ promise: string | null }> = [];
    await cancelBuiltin(mkCtx({
      activateRalphLoop: (promise) => { calls.push({ promise }); },
    }));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.promise).toBeNull();
  });

  it('emits cancel_requested + stdout message', async () => {
    const events: Array<{ kind: string }> = [];
    await cancelBuiltin(mkCtx({
      emit: (kind) => events.push({ kind }),
    }));
    expect(events.some((e) => e.kind === 'cancel_requested')).toBe(true);
    expect(events.some((e) => e.kind === 'plugin_output')).toBe(true);
  });

  it('works gracefully when activateRalphLoop is not wired', async () => {
    await expect(cancelBuiltin(mkCtx({ activateRalphLoop: undefined }))).resolves.toBeUndefined();
  });
});
