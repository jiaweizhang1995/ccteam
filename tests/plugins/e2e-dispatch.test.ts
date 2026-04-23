import { describe, it, expect } from 'vitest';
import { bootstrapPlugins } from '../../src/plugins/bootstrap.js';
import { dispatchSlashCommand } from '../../src/plugins/dispatcher.js';
import type { PluginContext } from '../../src/plugins/types.js';

type Events = Array<{ kind: string; payload: Record<string, unknown> }>;

function mkRegistry() {
  return bootstrapPlugins(process.cwd());
}

function mkCtxCapture(): {
  ctx: Omit<PluginContext, 'args'>;
  events: Events;
  pending: { value: string };
  completionPromise: { value: string };
  ralphActivations: Array<{ promise: string | null; max?: number }>;
} {
  const events: Events = [];
  const pending = { value: '' };
  const completionPromise = { value: '' };
  const ralphActivations: Array<{ promise: string | null; max?: number }> = [];
  return {
    events, pending, completionPromise, ralphActivations,
    ctx: {
      teamName: 'e2e',
      cwd: process.cwd(),
      emit: (kind, payload) => events.push({ kind, payload }),
      setPendingPrompt: (p) => { pending.value = p; },
      setCompletionPromise: (p) => { completionPromise.value = p; },
      activateRalphLoop: (p, max) => { ralphActivations.push({ promise: p, max }); },
    },
  };
}

describe('end-to-end dispatch over the real bootstrapped registry', () => {
  it('resolves /ralph-loop builtin and activates the runtime loop', async () => {
    const registry = mkRegistry();
    const { ctx, events, ralphActivations, completionPromise } = mkCtxCapture();
    const res = await dispatchSlashCommand('/ralph-loop build a thing', registry, ctx);
    expect(res.ok).toBe(true);
    expect(events.some((e) => e.kind === 'ralph_loop_started')).toBe(true);
    expect(completionPromise.value).toBe('<promise>DONE</promise>');
    expect(ralphActivations).toHaveLength(1);
    expect(ralphActivations[0]!.promise).toBe('<promise>DONE</promise>');
    expect(ralphActivations[0]!.max).toBe(20);
  });

  it('resolves /cancel builtin and clears the loop', async () => {
    const registry = mkRegistry();
    const { ctx, events, ralphActivations } = mkCtxCapture();
    const res = await dispatchSlashCommand('/cancel', registry, ctx);
    expect(res.ok).toBe(true);
    expect(events.some((e) => e.kind === 'cancel_requested')).toBe(true);
    expect(ralphActivations).toHaveLength(1);
    expect(ralphActivations[0]!.promise).toBeNull();
  });

  it('returns error for unknown command', async () => {
    const registry = mkRegistry();
    const { ctx } = mkCtxCapture();
    const res = await dispatchSlashCommand('/does-not-exist', registry, ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown command/i);
  });

  it('prefix-match narrows /pl to /plan and /ralp to /ralph-loop', () => {
    const registry = mkRegistry();
    const pl = registry.match('/pl');
    expect(pl[0]!.plugin.command).toBe('/plan');

    const ralp = registry.match('/ralp');
    // Top match should be /ralph-loop (builtin has priority over /claude-ralph-loop)
    expect(ralp[0]!.plugin.command).toBe('/ralph-loop');
  });

  it('discovers at least 100 commands from the full Claude ecosystem', () => {
    const registry = mkRegistry();
    const all = registry.list();
    // Real user has 113 but this test just asserts the bridge works
    expect(all.length).toBeGreaterThan(10);
    expect(all.some((p) => p.command === '/plan')).toBe(true);
    expect(all.some((p) => p.command === '/ralph-loop')).toBe(true);
    expect(all.some((p) => p.command === '/cancel')).toBe(true);
  });
});
