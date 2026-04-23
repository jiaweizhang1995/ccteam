import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseSlashCommand, dispatchSlashCommand } from '../../src/plugins/dispatcher.js';
import { PluginRegistry } from '../../src/plugins/registry.js';
import type { Plugin, PluginContext } from '../../src/plugins/types.js';

function mkContext(overrides: Partial<Omit<PluginContext, 'args'>> = {}): Omit<PluginContext, 'args'> {
  const events: Array<{ kind: string; payload: Record<string, unknown> }> = [];
  return {
    teamName: 'test-team',
    cwd: mkdtempSync(join(tmpdir(), 'ccteam-disp-')),
    emit: (kind, payload) => events.push({ kind, payload }),
    setPendingPrompt: () => { /* noop */ },
    setCompletionPromise: () => { /* noop */ },
    ...overrides,
  };
}

describe('parseSlashCommand', () => {
  it('parses simple command', () => {
    expect(parseSlashCommand('/plan build a todo')).toEqual({ command: '/plan', args: 'build a todo' });
  });
  it('handles no args', () => {
    expect(parseSlashCommand('/ralph-loop')).toEqual({ command: '/ralph-loop', args: '' });
  });
  it('strips leading whitespace', () => {
    expect(parseSlashCommand('   /plan test')).toEqual({ command: '/plan', args: 'test' });
  });
  it('returns null for non-slash input', () => {
    expect(parseSlashCommand('plain message')).toBeNull();
  });
  it('rejects slash alone', () => {
    expect(parseSlashCommand('/')).toBeNull();
  });
});

describe('dispatchSlashCommand', () => {
  it('returns error for unknown command', async () => {
    const r = new PluginRegistry();
    const result = await dispatchSlashCommand('/nope', r, mkContext());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown command/);
  });

  it('invokes builtin handler', async () => {
    const r = new PluginRegistry();
    let called = '';
    r.registerBuiltin('foo-key', async (ctx) => { called = ctx.args; });
    const plugin: Plugin = {
      name: 'foo', command: '/foo', description: 'test',
      handler: 'builtin', builtinKey: 'foo-key', body: '', source: 'test',
    };
    r.register(plugin);
    const result = await dispatchSlashCommand('/foo hello world', r, mkContext());
    expect(result.ok).toBe(true);
    expect(called).toBe('hello world');
  });

  it('prompt-prepend composes prompt from body + args', async () => {
    const r = new PluginRegistry();
    const plugin: Plugin = {
      name: 'critic', command: '/critic', description: 'test',
      handler: 'prompt-prepend',
      body: 'You are a harsh critic.',
      source: 'test',
    };
    r.register(plugin);

    let pending = '';
    const result = await dispatchSlashCommand(
      '/critic review this code',
      r,
      mkContext({ setPendingPrompt: (p) => { pending = p; } }),
    );
    expect(result.ok).toBe(true);
    expect(pending).toContain('You are a harsh critic.');
    expect(pending).toContain('review this code');
  });

  it('propagates completionPromise from plugin', async () => {
    const r = new PluginRegistry();
    const plugin: Plugin = {
      name: 'loop', command: '/loop', description: 'test',
      handler: 'prompt-prepend',
      body: 'Do X',
      completionPromise: 'FINISHED',
      source: 'test',
    };
    r.register(plugin);

    let promiseSet = '';
    await dispatchSlashCommand('/loop work', r, mkContext({
      setCompletionPromise: (p) => { promiseSet = p; },
      setPendingPrompt: () => { /* noop */ },
    }));
    expect(promiseSet).toBe('FINISHED');
  });
});
