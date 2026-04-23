import { describe, it, expect } from 'vitest';
import { PluginRegistry } from '../../src/plugins/registry.js';
import type { Plugin } from '../../src/plugins/types.js';

function mkPlugin(command: string, name = command.slice(1)): Plugin {
  return {
    name,
    command,
    description: `desc ${name}`,
    handler: 'prompt-prepend',
    body: `body for ${name}`,
    source: 'test',
  };
}

describe('PluginRegistry', () => {
  it('registers + retrieves by command', () => {
    const r = new PluginRegistry();
    r.register(mkPlugin('/plan'));
    expect(r.get('/plan')?.name).toBe('plan');
  });

  it('first-wins on collision', () => {
    const r = new PluginRegistry();
    r.register({ ...mkPlugin('/plan'), description: 'original' });
    r.register({ ...mkPlugin('/plan'), description: 'override attempt' });
    expect(r.get('/plan')?.description).toBe('original');
  });

  it('list is sorted alphabetically', () => {
    const r = new PluginRegistry();
    r.register(mkPlugin('/zebra'));
    r.register(mkPlugin('/alpha'));
    r.register(mkPlugin('/middle'));
    const cmds = r.list().map((p) => p.command);
    expect(cmds).toEqual(['/alpha', '/middle', '/zebra']);
  });

  it('match prefix-ranks strict-prefix above substring', () => {
    const r = new PluginRegistry();
    r.register(mkPlugin('/plan'));
    r.register(mkPlugin('/plant-trees'));
    r.register(mkPlugin('/deploy'));
    r.register(mkPlugin('/ralph-loop'));
    const matches = r.match('/pl');
    const cmds = matches.map((m) => m.plugin.command);
    expect(cmds[0]).toBe('/plan');
    expect(cmds[1]).toBe('/plant-trees');
    expect(cmds).not.toContain('/deploy');
    expect(cmds).not.toContain('/ralph-loop');
  });

  it('match returns all on empty input', () => {
    const r = new PluginRegistry();
    r.register(mkPlugin('/a'));
    r.register(mkPlugin('/b'));
    expect(r.match('').length).toBe(2);
  });

  it('registerBuiltin + getBuiltin roundtrip', () => {
    const r = new PluginRegistry();
    r.registerBuiltin('foo', async () => { /* noop */ });
    expect(r.getBuiltin('foo')).toBeDefined();
    expect(r.getBuiltin('missing')).toBeUndefined();
  });
});
