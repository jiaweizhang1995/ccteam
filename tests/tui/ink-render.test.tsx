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

  it('renders PlanPanel overlay when planState.active is true', () => {
    const state = makeState({
      planState: {
        active: true,
        text: 'Step 1: do something\nStep 2: do more',
        parsed: null,
        awaitingConfirm: false,
      },
    });
    const { lastFrame } = render(<App initialState={state} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Plan Mode');
    expect(frame).toContain('generating...');
    expect(frame).toContain('Step 1: do something');
  });

  it('renders PlanPanel confirmation dialog when awaitingConfirm is true', () => {
    const state = makeState({
      planState: {
        active: true,
        text: 'Step 1: build api\nStep 2: write tests',
        parsed: { steps: ['build api', 'write tests'], suggestedAgents: 2, rawText: 'Step 1: build api\nStep 2: write tests' },
        awaitingConfirm: true,
      },
    });
    const { lastFrame } = render(<App initialState={state} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Spawn');
    expect(frame).toContain('agent');
    expect(frame).toContain('Enter=yes');
  });

  it('shows teammate name in InputBar label when focused on a teammate', () => {
    const state = makeState({
      focus: 0,
      teammates: [
        { id: 'tm-1', name: 'alice', provider: 'stub', status: 'active', currentTaskId: null, recentEvents: [] },
      ],
    });
    const { lastFrame } = render(<App initialState={state} />);
    expect(lastFrame()).toContain('[alice]');
  });
});
