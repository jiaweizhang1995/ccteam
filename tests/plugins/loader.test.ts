import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPluginsFromDir } from '../../src/plugins/loader.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ccteam-plugins-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('plugin loader', () => {
  it('parses a simple prompt-prepend plugin', () => {
    const dir = join(tmp, 'plugins');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'grep-friend.md'), `---
name: grep-friend
command: /grep
description: search the repo
handler: prompt-prepend
---

You are a search specialist. Use ripgrep to find patterns.
`);

    const plugins = loadPluginsFromDir(dir, 'test');
    expect(plugins).toHaveLength(1);
    expect(plugins[0]!.name).toBe('grep-friend');
    expect(plugins[0]!.command).toBe('/grep');
    expect(plugins[0]!.handler).toBe('prompt-prepend');
    expect(plugins[0]!.body).toContain('ripgrep');
  });

  it('normalizes command to start with /', () => {
    const dir = join(tmp, 'plugins');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'x.md'), `---
name: foo
command: foo
description: test
handler: prompt-prepend
---

body
`);
    const plugins = loadPluginsFromDir(dir, 'test');
    expect(plugins[0]!.command).toBe('/foo');
  });

  it('rejects plugins without required frontmatter', () => {
    const dir = join(tmp, 'plugins');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'incomplete.md'), `---
name: bad
---

body
`);
    expect(loadPluginsFromDir(dir, 'test')).toHaveLength(0);
  });

  it('rejects unknown handler types', () => {
    const dir = join(tmp, 'plugins');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'bad.md'), `---
name: bad
command: /bad
description: bad
handler: unknown-type
---

body
`);
    expect(loadPluginsFromDir(dir, 'test')).toHaveLength(0);
  });

  it('walks nested subdirectories', () => {
    const nested = join(tmp, 'plugins', 'group', 'subgroup');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'deep.md'), `---
name: deep
command: /deep
description: nested
handler: prompt-prepend
---

body
`);
    const plugins = loadPluginsFromDir(join(tmp, 'plugins'), 'test');
    expect(plugins).toHaveLength(1);
    expect(plugins[0]!.name).toBe('deep');
  });

  it('returns empty for non-existent dir', () => {
    expect(loadPluginsFromDir(join(tmp, 'nope'), 'test')).toHaveLength(0);
  });
});
