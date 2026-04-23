import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { SlashAutocomplete } from '../../src/tui/SlashAutocomplete.js';
import type { SlashMatch } from '../../src/plugins/types.js';

function mkMatch(command: string, description = ''): SlashMatch {
  return {
    plugin: {
      name: command.slice(1),
      command,
      description,
      handler: 'prompt-prepend',
      body: '',
    },
    matchLen: 3,
  };
}

describe('SlashAutocomplete', () => {
  it('returns null when not visible', () => {
    const { lastFrame } = render(
      React.createElement(SlashAutocomplete, { matches: [mkMatch('/plan')], selectedIndex: 0, visible: false }),
    );
    expect(lastFrame()?.trim()).toBe('');
  });

  it('returns null when zero matches even if visible', () => {
    const { lastFrame } = render(
      React.createElement(SlashAutocomplete, { matches: [], selectedIndex: 0, visible: true }),
    );
    expect(lastFrame()?.trim()).toBe('');
  });

  it('renders matches with selection indicator', () => {
    const matches = [
      mkMatch('/plan', 'make a plan'),
      mkMatch('/ralph-loop', 'iterate until done'),
    ];
    const { lastFrame } = render(
      React.createElement(SlashAutocomplete, { matches, selectedIndex: 0, visible: true }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('/plan');
    expect(frame).toContain('/ralph-loop');
    expect(frame).toContain('slash commands');
    // selected indicator on first row
    expect(frame).toMatch(/▸.*\/plan/);
  });

  it('truncates overflow with count hint', () => {
    const matches = Array.from({ length: 10 }, (_, i) => mkMatch(`/cmd${i}`));
    const { lastFrame } = render(
      React.createElement(SlashAutocomplete, { matches, selectedIndex: 0, visible: true, maxShown: 3 }),
    );
    expect(lastFrame()).toContain('and 7 more');
  });
});
