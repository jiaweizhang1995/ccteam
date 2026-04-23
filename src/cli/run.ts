import React from 'react';
import { render } from 'ink';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { State } from '../state/index.js';
import { TeamLead } from '../orchestrator/lead.js';
import { App } from '../tui/App.js';
import { useTeamState } from '../tui/useTeamState.js';
import type { FocusTarget, PlanState, PlanResult } from '../tui/types.js';
import { bootstrapPlugins } from '../plugins/bootstrap.js';
import { dispatchSlashCommand } from '../plugins/dispatcher.js';

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
  const pluginRegistry = bootstrapPlugins(process.cwd());

  // Load initial roster and task list so TUI has something before the first notifier poll.
  const initialTeammates = state.listTeammates(teamName);
  const initialTasks = state.listTasks(teamName);
  const notifier = state.startNotifier(teamName);

  // Refs let TeamLead callbacks reach into live React state without closure capture.
  let onLeadEventRef: ((agent: string, kind: string, payload: Record<string, unknown>) => void) | null = null;
  // setPlanState from the live App component — updated on every render via LiveApp.
  let setPlanStateRef: ((s: PlanState | ((prev: PlanState) => PlanState)) => void) | null = null;

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

  // Abort controller for cancelling in-flight plan generation via Esc.
  let planAbortController: AbortController | null = null;

  // Root component: wires live state hook and passes everything down to App.
  function LiveApp() {
    const { appState, onLeadEvent } = useTeamState({
      teamName,
      initialTeammates,
      initialTasks,
      notifier,
    });

    // Keep refs current on every render.
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

    const handlePlanRequest = (goal: string) => {
      planAbortController?.abort();
      planAbortController = new AbortController();
      const signal = planAbortController.signal;

      lead.runPlanMode(
        goal,
        (delta: string) => {
          setPlanStateRef?.((s) => ({ ...s, text: s.text + delta }));
        },
        signal,
      ).then((result) => {
        setPlanStateRef?.(() => ({
          active: true,
          text: result.rawText,
          parsed: result,
          awaitingConfirm: true,
        }));
      }).catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') {
          // Esc cancelled — plan state already reset by handlePlanCancel in App
          return;
        }
        setPlanStateRef?.(() => ({
          active: false, text: '', parsed: null, awaitingConfirm: false,
        }));
      });
    };

    const handlePlanConfirm = (plan: PlanResult, agentCount: number) => {
      lead.executeFromPlan(plan, agentCount).catch((err: unknown) => {
        console.error('executeFromPlan failed:', err instanceof Error ? err.message : String(err));
      });
    };

    const handleSlashCommand = (line: string) => {
      dispatchSlashCommand(line, pluginRegistry, {
        teamName,
        cwd: process.cwd(),
        emit: (kind: string, payload: Record<string, unknown>) => {
          onLeadEventRef?.('lead', kind, payload);
        },
        setPendingPrompt: (prompt: string) => {
          // Push as a user message to the lead via the state mailbox so it appears
          // in the next turn naturally. Works for prompt-prepend + ralph-loop.
          state.insertMessage({
            team_name: teamName,
            from_agent: 'user',
            to_agent: 'lead',
            kind: 'message',
            body: JSON.stringify({ text: prompt }),
            created_at: Date.now(),
          });
        },
        setCompletionPromise: (promise: string) => {
          onLeadEventRef?.('lead', 'completion_promise_set', { promise });
        },
      }).catch((err: unknown) => {
        console.error('slash dispatch failed:', err instanceof Error ? err.message : String(err));
      });
    };

    return React.createElement(App, {
      initialState: appState,
      onSendMessage: handleSendMessage,
      onPlanRequest: handlePlanRequest,
      onPlanConfirm: handlePlanConfirm,
      onSlashCommand: handleSlashCommand,
      pluginRegistry,
      onSetPlanState: (setter) => { setPlanStateRef = setter; },
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
