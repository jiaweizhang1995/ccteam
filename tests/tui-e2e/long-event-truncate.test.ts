/**
 * Test 7: long-event-truncate
 * Event text longer than pane width is truncated with ellipsis (Ink wrap="truncate").
 * Uses ink-testing-library (no tmux needed — Ink handles truncation in its layout).
 * This test runs in the normal suite (no AGENT_TEAMS_TUI_E2E gate needed).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { TeammatePane } from '../../src/tui/TeammatePane.js';
import type { TeammateState } from '../../src/tui/types.js';

describe('long-event-truncate', () => {
  it('renders long event text in a narrow pane without crashing', () => {
    const longText = 'A'.repeat(500);
    const tm: TeammateState = {
      id: 'tm-1',
      name: 'alice',
      provider: 'stub',
      status: 'active',
      currentTaskId: null,
      recentEvents: [{ id: 1, kind: 'text_delta', text: longText, ts: Date.now() }],
    };

    const { lastFrame } = render(
      React.createElement(TeammatePane, { teammate: tm, isFocused: false, width: 30 }),
    );

    const frame = lastFrame() ?? '';
    // Ink's wrap="truncate" should keep line width bounded — no newline explosion.
    const lines = frame.split('\n');
    // Each rendered line must be <= 30 visible chars (ANSI codes aside).
    // We strip ANSI escape codes before measuring.
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    for (const line of lines) {
      expect(stripAnsi(line).length).toBeLessThanOrEqual(35); // small buffer for border chars
    }
  });

  it('renders short event text in full', () => {
    const tm: TeammateState = {
      id: 'tm-2',
      name: 'bob',
      provider: 'stub',
      status: 'idle',
      currentTaskId: null,
      recentEvents: [{ id: 2, kind: 'text_delta', text: 'hello', ts: Date.now() }],
    };

    const { lastFrame } = render(
      React.createElement(TeammatePane, { teammate: tm, isFocused: false, width: 60 }),
    );
    expect(lastFrame()).toContain('hello');
  });
});
