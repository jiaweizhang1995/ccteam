import React from 'react';
import { render } from 'ink';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { State } from '../state/index.js';
import { TeamLead } from '../orchestrator/lead.js';
import { App } from '../tui/App.js';
import { useTeamState } from '../tui/useTeamState.js';
import type { FocusTarget } from '../tui/types.js';

export interface RunOptions {
  lead?: string;
  teammateProvider?: string;
  teammateMode?: string;
  team?: string;
  dangerouslySkipPermissions?: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'team';
}

export async function runInteractive(prompt: string, opts: RunOptions): Promise<void> {
  const dbPath = join(homedir(), '.agent-teams', 'state.db');
  const state = new State(dbPath);
  const teamName = opts.team ?? slugify(prompt || 'team');

  // Load initial roster and task list so TUI has something before the first notifier poll.
  const initialTeammates = state.listTeammates(teamName);
  const initialTasks = state.listTasks(teamName);
  const notifier = state.startNotifier(teamName);

  // Ref lets the TeamLead callback reach into the live React state without closure capture.
  let onLeadEventRef: ((agent: string, kind: string, payload: Record<string, unknown>) => void) | null = null;

  const lead = new TeamLead({
    teamName,
    prompt,
    leadProvider: opts.lead,
    teammateProvider: opts.teammateProvider,
    dangerouslySkipPermissions: opts.dangerouslySkipPermissions ?? false,
    debug: false,
    onEvent(agent: string, kind: string, payload: Record<string, unknown>) {
      onLeadEventRef?.(agent, kind, payload);
    },
  });

  // Root component: wires live state hook and passes everything down to App.
  function LiveApp() {
    const { appState, onLeadEvent } = useTeamState({
      teamName,
      initialTeammates,
      initialTasks,
      notifier,
    });

    // Keep the ref current on every render so TeamLead's onEvent always reaches
    // the latest dispatch function.
    onLeadEventRef = onLeadEvent;

    const handleSendMessage = (target: FocusTarget, text: string) => {
      const toAgent =
        target === 'lead'
          ? null
          : (appState.teammates[target as number]?.name ?? null);
      if (!toAgent) return;
      state.insertMessage({
        team_name: teamName,
        from_agent: 'lead',
        to_agent: toAgent,
        kind: 'message',
        body: JSON.stringify({ text }),
        created_at: Date.now(),
      });
    };

    return React.createElement(App, {
      initialState: appState,
      onSendMessage: handleSendMessage,
    });
  }

  const { unmount, waitUntilExit } = render(React.createElement(LiveApp));

  const shutdown = async () => {
    unmount();
    await lead.shutdown();
    state.close();
  };

  process.once('SIGINT', () => void shutdown().then(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().then(() => process.exit(0)));

  // Run lead in background; TUI stays live until Ctrl+C or lead finishes.
  lead.run().then(() => shutdown()).then(() => unmount()).catch(async (err: unknown) => {
    await shutdown();
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });

  await waitUntilExit();
}
