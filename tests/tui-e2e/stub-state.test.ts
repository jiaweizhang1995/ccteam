/**
 * Stub-state unit tests — no tmux required.
 * Tests useTeamState behavior and App layout with stub state.
 * These run in the normal test suite.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from '../../src/tui/App.js';
import { createStubState, addStubTeammate, emitStubEvent } from './helpers.js';
import type { AppState } from '../../src/tui/types.js';
import type { StubState } from './helpers.js';

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    teamName: 'stub-team',
    leadEvents: [],
    teammates: [],
    tasks: [],
    focus: 'lead',
    showTaskList: false,
    inputValue: '',
    ...overrides,
  };
}

describe('App layout — zero teammates', () => {
  it('renders lead pane with no teammate panes', () => {
    const { lastFrame } = render(React.createElement(App, { initialState: makeState() }));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('lead');
    expect(frame).toContain('stub-team');
  });
});

describe('App layout — one teammate', () => {
  it('renders one teammate pane alongside lead', () => {
    const state = makeState({
      teammates: [{
        id: 'tm-1', name: 'alice', provider: 'stub',
        status: 'active', currentTaskId: null, recentEvents: [],
      }],
    });
    const { lastFrame } = render(React.createElement(App, { initialState: state }));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('alice');
    expect(frame).toContain('active');
  });
});

describe('App layout — many teammates', () => {
  it('renders 6 teammate panes without crashing', () => {
    const teammates = Array.from({ length: 6 }, (_, i) => ({
      id: `tm-${i}`, name: `agent-${i}`, provider: 'stub',
      status: 'idle' as const, currentTaskId: null, recentEvents: [],
    }));
    const state = makeState({ teammates });
    const { lastFrame } = render(React.createElement(App, { initialState: state }));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('lead');
    // In 100 cols with 7 panes (~14 cols each), names truncate but all 7 panes render.
    // Count "waiting..." placeholders — one per pane (lead + 6 teammates = 7).
    const paneBoxCount = (frame.match(/waiting\.\.\./g) ?? []).length;
    expect(paneBoxCount).toBe(7);
    // No crash indicator
    expect(frame).not.toContain('Error:');
  });
});

describe('App layout — status badges', () => {
  const statuses = ['spawning', 'active', 'idle', 'shutdown'] as const;
  for (const status of statuses) {
    it(`renders ${status} badge`, () => {
      const state = makeState({
        teammates: [{
          id: 'tm-1', name: 'bot', provider: 'stub',
          status, currentTaskId: null, recentEvents: [],
        }],
      });
      const { lastFrame } = render(React.createElement(App, { initialState: state }));
      expect(lastFrame()).toContain(status);
    });
  }
});

describe('Stub state helpers', () => {
  let stub: StubState | undefined;

  afterEach(() => {
    stub?.close();
    stub = undefined;
  });

  it('createStubState initializes a working DB + notifier', () => {
    stub = createStubState('test-stub');
    expect(stub.db).toBeTruthy();
    expect(stub.notifier).toBeTruthy();
    expect(stub.teamName).toBe('test-stub');
  });

  it('addStubTeammate inserts a teammate row', () => {
    stub = createStubState();
    const tm = addStubTeammate(stub, { name: 'alice', status: 'active' });
    expect(tm.name).toBe('alice');
    expect(tm.status).toBe('active');
    expect(tm.team_name).toBe(stub.teamName);
  });

  it('emitStubEvent inserts an event row notifier picks up', async () => {
    stub = createStubState();
    addStubTeammate(stub, { name: 'bob' });

    const received: unknown[] = [];
    stub.notifier.on('event_appended', (e) => received.push(e));

    emitStubEvent(stub, 'bob', 'text_delta', { text: 'hello from bob' });

    await new Promise((r) => setTimeout(r, 400));
    expect(received.length).toBeGreaterThan(0);
    const ev = received[0] as { type: string; event: { kind: string; payload: string } };
    expect(ev.type).toBe('event_appended');
    expect(ev.event.kind).toBe('text_delta');
    expect(JSON.parse(ev.event.payload)).toEqual({ text: 'hello from bob' });
  });

  it('emitStubEvent with teammate_spawned kind triggers notifier', async () => {
    stub = createStubState();

    const received: unknown[] = [];
    stub.notifier.on('event_appended', (e) => received.push(e));

    emitStubEvent(stub, 'lead', 'teammate_spawned', { name: 'charlie', provider: 'stub', id: 'tm-charlie' });

    await new Promise((r) => setTimeout(r, 400));
    const ev = received[0] as { event: { kind: string } };
    expect(ev?.event?.kind).toBe('teammate_spawned');
  });
});

describe('InputBar hint text', () => {
  it('shows [lead] label when focus is lead', () => {
    const state = makeState({ focus: 'lead' });
    const { lastFrame } = render(React.createElement(App, { initialState: state }));
    expect(lastFrame()).toContain('[lead]');
  });

  it('shows teammate name label when focus is teammate index 0', () => {
    const state = makeState({
      focus: 0,
      teammates: [{
        id: 'tm-0', name: 'alice', provider: 'stub',
        status: 'idle', currentTaskId: null, recentEvents: [],
      }],
    });
    const { lastFrame } = render(React.createElement(App, { initialState: state }));
    expect(lastFrame()).toContain('[alice]');
  });
});
