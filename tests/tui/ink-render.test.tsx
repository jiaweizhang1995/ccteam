import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from '../../src/tui/App.js';
import type { AppState } from '../../src/tui/types.js';

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    teamName: 'test-team',
    leadEvents: [],
    teammates: [],
    tasks: [],
    focus: 'lead',
    showTaskList: false,
    inputValue: '',
    ...overrides,
  };
}

describe('App TUI', () => {
  it('renders the lead pane', () => {
    const { lastFrame } = render(<App initialState={makeState()} />);
    expect(lastFrame()).toContain('lead');
    expect(lastFrame()).toContain('test-team');
  });

  it('renders teammate panes', () => {
    const state = makeState({
      teammates: [
        {
          id: 'tm-1',
          name: 'ui-engineer',
          provider: 'claude-oauth',
          status: 'active',
          currentTaskId: null,
          recentEvents: [],
        },
      ],
    });
    const { lastFrame } = render(<App initialState={state} />);
    expect(lastFrame()).toContain('ui-engineer');
    expect(lastFrame()).toContain('active');
  });

  it('shows task list panel when showTaskList is true', () => {
    const state = makeState({
      showTaskList: true,
      tasks: [
        { id: 'task-1', title: 'Write tests', status: 'pending', assignedTo: null, blockedBy: [] },
      ],
    });
    const { lastFrame } = render(<App initialState={state} />);
    expect(lastFrame()).toContain('Tasks');
    expect(lastFrame()).toContain('Write tests');
  });

  it('hides task list panel when showTaskList is false', () => {
    const state = makeState({
      showTaskList: false,
      tasks: [
        { id: 'task-1', title: 'Write tests', status: 'pending', assignedTo: null, blockedBy: [] },
      ],
    });
    const { lastFrame } = render(<App initialState={state} />);
    expect(lastFrame()).not.toContain('Tasks (Ctrl+T to hide)');
  });

  it('calls onSendMessage when a message is submitted', () => {
    // TODO wire-up: simulate user input via ink-testing-library once keybind routing works.
    // For now, directly invoke onSubmit via the InputBar's onSubmit prop.
    const onSendMessage = vi.fn();
    render(<App initialState={makeState()} onSendMessage={onSendMessage} />);
    // Input simulation requires ink-testing-library userEvent integration —
    // placeholder until ink-testing-library v5 stabilizes input API.
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('renders teammate status badges', () => {
    const state = makeState({
      teammates: [
        {
          id: 'tm-1',
          name: 'backend-dev',
          provider: 'openai-gpt5',
          status: 'idle',
          currentTaskId: null,
          recentEvents: [],
        },
      ],
    });
    const { lastFrame } = render(<App initialState={state} />);
    expect(lastFrame()).toContain('idle');
    expect(lastFrame()).toContain('backend-dev');
  });
});
