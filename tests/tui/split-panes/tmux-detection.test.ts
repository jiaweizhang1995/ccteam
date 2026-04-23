import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isTmuxAvailable, spawnTmuxPanes } from '../../../src/tui/split-panes/tmux.js';

describe('tmux detection', () => {
  const originalEnv = process.env.TMUX;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TMUX;
    } else {
      process.env.TMUX = originalEnv;
    }
  });

  it('returns true when $TMUX is set', () => {
    process.env.TMUX = '/private/tmp/tmux-501/default,1234,0';
    expect(isTmuxAvailable()).toBe(true);
  });

  it('returns false when $TMUX is unset', () => {
    delete process.env.TMUX;
    expect(isTmuxAvailable()).toBe(false);
  });
});

describe('resolveSplitMode', () => {
  it('resolves to tmux when $TMUX is set', async () => {
    const { resolveSplitMode } = await import('../../../src/tui/split-panes/auto.js');
    process.env.TMUX = '/private/tmp/tmux-501/default,1234,0';
    expect(resolveSplitMode('auto')).toBe('tmux');
    delete process.env.TMUX;
  });

  it('resolves to in-process when no split env present', async () => {
    const { resolveSplitMode } = await import('../../../src/tui/split-panes/auto.js');
    delete process.env.TMUX;
    const savedTerm = process.env.TERM_PROGRAM;
    delete process.env.TERM_PROGRAM;
    expect(resolveSplitMode('auto')).toBe('in-process');
    if (savedTerm !== undefined) process.env.TERM_PROGRAM = savedTerm;
  });

  it('respects explicit tmux mode', async () => {
    const { resolveSplitMode } = await import('../../../src/tui/split-panes/auto.js');
    expect(resolveSplitMode('tmux')).toBe('tmux');
  });

  it('respects explicit in-process mode', async () => {
    const { resolveSplitMode } = await import('../../../src/tui/split-panes/auto.js');
    expect(resolveSplitMode('in-process')).toBe('in-process');
  });
});
