/**
 * Tests for the /brainstorm + /go multi-turn plan-refinement flow.
 *
 * Scope: the builtin plugins themselves (how they invoke the PluginContext
 * callbacks). The underlying TeamLead.startBrainstorm/continueBrainstorm/
 * commitBrainstorm methods are exercised in tests/orchestrator/brainstorm-lead.test.ts
 * via mocked backends — split out because they require wiring State + providers.
 *
 * This file mirrors the pattern in cancel.test.ts + builtin.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { brainstormBuiltin, BRAINSTORM_PLUGIN } from '../../src/plugins/builtin/brainstorm.js';
import { goBuiltin, GO_PLUGIN } from '../../src/plugins/builtin/go.js';
import { cancelBuiltin } from '../../src/plugins/builtin/cancel.js';
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

describe('BRAINSTORM_PLUGIN registration', () => {
  it('registers /brainstorm as a builtin', () => {
    expect(BRAINSTORM_PLUGIN.command).toBe('/brainstorm');
    expect(BRAINSTORM_PLUGIN.handler).toBe('builtin');
    expect(BRAINSTORM_PLUGIN.builtinKey).toBe('brainstorm');
  });
  it('has a description mentioning /go', () => {
    expect(BRAINSTORM_PLUGIN.description).toMatch(/\/go/i);
  });
});

describe('brainstormBuiltin', () => {
  it('invokes startBrainstorm with the user goal', async () => {
    const starts: string[] = [];
    await brainstormBuiltin(mkCtx({
      args: 'build a todo CLI',
      startBrainstorm: (goal) => { starts.push(goal); },
    }));
    expect(starts).toEqual(['build a todo CLI']);
  });

  it('emits brainstorm_started before calling startBrainstorm', async () => {
    const order: string[] = [];
    await brainstormBuiltin(mkCtx({
      args: 'write tests',
      emit: (kind) => { order.push(`emit:${kind}`); },
      startBrainstorm: () => { order.push('start'); },
    }));
    // emit must land before start so the TUI shows the banner before any stream begins.
    expect(order.indexOf('emit:brainstorm_started')).toBeLessThan(order.indexOf('start'));
  });

  it('prints usage error when goal is empty', async () => {
    const stderrLines: string[] = [];
    const starts: string[] = [];
    await brainstormBuiltin(mkCtx({
      args: '   ',
      emit: (kind, payload) => {
        if (kind === 'plugin_output' && (payload as { stream: string }).stream === 'stderr') {
          stderrLines.push((payload as { text: string }).text);
        }
      },
      startBrainstorm: (goal) => { starts.push(goal); },
    }));
    expect(starts).toHaveLength(0);
    expect(stderrLines.join('\n')).toMatch(/usage/i);
  });

  it('prints a TUI-required hint when startBrainstorm is not wired (non-TUI driver)', async () => {
    const stderrLines: string[] = [];
    await brainstormBuiltin(mkCtx({
      args: 'x',
      emit: (kind, payload) => {
        if (kind === 'plugin_output' && (payload as { stream: string }).stream === 'stderr') {
          stderrLines.push((payload as { text: string }).text);
        }
      },
      // startBrainstorm intentionally undefined
    }));
    expect(stderrLines.join('\n')).toMatch(/interactive TUI/i);
  });
});

describe('GO_PLUGIN registration', () => {
  it('registers /go as a builtin', () => {
    expect(GO_PLUGIN.command).toBe('/go');
    expect(GO_PLUGIN.handler).toBe('builtin');
    expect(GO_PLUGIN.builtinKey).toBe('go');
  });
});

describe('goBuiltin', () => {
  it('invokes executeBrainstormPlan exactly once', async () => {
    let calls = 0;
    await goBuiltin(mkCtx({
      executeBrainstormPlan: () => { calls += 1; },
    }));
    expect(calls).toBe(1);
  });

  it('emits brainstorm_go_requested before executing', async () => {
    const order: string[] = [];
    await goBuiltin(mkCtx({
      emit: (kind) => { order.push(`emit:${kind}`); },
      executeBrainstormPlan: () => { order.push('execute'); },
    }));
    expect(order.indexOf('emit:brainstorm_go_requested')).toBeLessThan(order.indexOf('execute'));
  });

  it('prints a TUI-required hint when executeBrainstormPlan is not wired', async () => {
    const stderrLines: string[] = [];
    await goBuiltin(mkCtx({
      emit: (kind, payload) => {
        if (kind === 'plugin_output' && (payload as { stream: string }).stream === 'stderr') {
          stderrLines.push((payload as { text: string }).text);
        }
      },
    }));
    expect(stderrLines.join('\n')).toMatch(/interactive TUI/i);
  });
});

describe('cancelBuiltin — brainstorm integration', () => {
  it('calls exitBrainstorm when wired (and still clears ralph-loop)', async () => {
    let ralphCleared = false;
    let brainstormExited = false;
    await cancelBuiltin(mkCtx({
      activateRalphLoop: (p) => { if (p === null) ralphCleared = true; },
      exitBrainstorm: () => { brainstormExited = true; },
    }));
    expect(ralphCleared).toBe(true);
    expect(brainstormExited).toBe(true);
  });

  it('does not throw when exitBrainstorm is not wired', async () => {
    await expect(cancelBuiltin(mkCtx({
      activateRalphLoop: () => { /* noop */ },
      // exitBrainstorm intentionally undefined
    }))).resolves.toBeUndefined();
  });
});
