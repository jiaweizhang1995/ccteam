import React from 'react';
import { render } from 'ink';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { State } from '../state/index.js';
import { App } from '../tui/App.js';
import { TeammatePane } from '../tui/TeammatePane.js';
import { useTeamState } from '../tui/useTeamState.js';

export interface AttachOptions {
  teammate?: string;
}

export async function attachTeam(teamName: string, opts: AttachOptions = {}): Promise<void> {
  const dbPath = join(homedir(), '.agent-teams', 'state.db');
  const state = new State(dbPath);

  const initialTeammates = state.listTeammates(teamName);
  const initialTasks = state.listTasks(teamName);
  const notifier = state.startNotifier(teamName);

  const cleanup = () => { state.close(); process.exit(0); };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);

  if (opts.teammate) {
    // Single-teammate attach — used by tmux/iTerm2 split panes.
    const matchedRow = initialTeammates.find((tm) => tm.name === opts.teammate);

    function SinglePane() {
      const { appState } = useTeamState({ teamName, initialTeammates, initialTasks, notifier });
      const tm = appState.teammates.find((t) => t.name === opts.teammate);
      if (!tm) {
        // Not yet in DB — show placeholder until notifier picks up spawn event.
        return React.createElement(TeammatePane, {
          teammate: {
            id: 'pending',
            name: opts.teammate!,
            provider: matchedRow?.provider ?? 'unknown',
            status: 'spawning' as const,
            currentTaskId: null,
            recentEvents: [],
          },
          isFocused: true,
          width: process.stdout.columns ?? 80,
        });
      }
      return React.createElement(TeammatePane, {
        teammate: tm,
        isFocused: true,
        width: process.stdout.columns ?? 80,
      });
    }

    const { waitUntilExit } = render(React.createElement(SinglePane));
    await waitUntilExit();
    state.close();
    return;
  }

  // Full TUI reattach — no lead active, read-only subscribe to state.
  function LiveApp() {
    const { appState } = useTeamState({ teamName, initialTeammates, initialTasks, notifier });
    return React.createElement(App, { initialState: appState });
  }

  const { waitUntilExit } = render(React.createElement(LiveApp));
  await waitUntilExit();
  state.close();
}
