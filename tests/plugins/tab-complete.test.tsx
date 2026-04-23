import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { InputBar } from '../../src/tui/InputBar.js';
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

describe('InputBar Tab-complete', () => {
  it('renders autocomplete when active + slash + matches', () => {
    const matches = [mkMatch('/plan'), mkMatch('/plant')];
    const { lastFrame } = render(
      React.createElement(InputBar, {
        focus: 'lead' as const,
        teammates: [],
        value: '/pl',
        onChange: () => { /* noop */ },
        onSubmit: () => { /* noop */ },
        isActive: true,
        slashMatches: matches,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('/plan');
    expect(frame).toContain('/plant');
    expect(frame).toContain('slash commands');
  });

  it('does not render dropdown when value is empty', () => {
    const { lastFrame } = render(
      React.createElement(InputBar, {
        focus: 'lead' as const,
        teammates: [],
        value: '',
        onChange: () => { /* noop */ },
        onSubmit: () => { /* noop */ },
        isActive: true,
        slashMatches: [mkMatch('/plan')],
      }),
    );
    expect(lastFrame()).not.toContain('slash commands');
  });

  it('does not render dropdown when inactive', () => {
    const { lastFrame } = render(
      React.createElement(InputBar, {
        focus: 'lead' as const,
        teammates: [],
        value: '/pl',
        onChange: () => { /* noop */ },
        onSubmit: () => { /* noop */ },
        isActive: false,
        slashMatches: [mkMatch('/plan')],
      }),
    );
    expect(lastFrame()).not.toContain('slash commands');
  });

  it('hint text mentions Tab to complete', () => {
    const { lastFrame } = render(
      React.createElement(InputBar, {
        focus: 'lead' as const,
        teammates: [],
        value: '',
        onChange: () => { /* noop */ },
        onSubmit: () => { /* noop */ },
        isActive: false,
        slashMatches: [],
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Tab');
  });
});
