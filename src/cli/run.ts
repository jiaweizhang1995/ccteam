import React from 'react';
import { render } from 'ink';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { State } from '../state/index.js';
import { TeamLead } from '../orchestrator/lead.js';
import { App } from '../tui/App.js';
import { useTeamState } from '../tui/useTeamState.js';
import type { FocusTarget, PlanState, PlanResult, BrainstormState } from '../tui/types.js';
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
  // setBrainstormState from the live App component — updated on every render.
  let setBrainstormStateRef: ((s: BrainstormState | ((prev: BrainstormState) => BrainstormState)) => void) | null = null;

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
  // Separate abort controller for the multi-turn brainstorm stream.
  let brainstormAbortController: AbortController | null = null;

  /**
   * Stream lead's brainstorm output to both the TUI event log (so the user
   * sees it in the main chat pane) AND aggregate into brainstormState.latest
   * on completion. Shared by startBrainstorm + continueBrainstorm handlers.
   */
  const streamBrainstormTurn = (
    run: (onDelta: (chunk: string) => void, signal: AbortSignal) => Promise<PlanResult>,
  ): void => {
    brainstormAbortController?.abort();
    brainstormAbortController = new AbortController();
    const signal = brainstormAbortController.signal;

    setBrainstormStateRef?.((s) => ({ ...s, streaming: true }));

    run((delta) => {
      // Mirror the text stream into the main lead chat pane so the
      // conversation reads naturally in the TUI.
      onLeadEventRef?.('lead', 'text_delta', { text: delta });
    }, signal).then((result) => {
      setBrainstormStateRef?.(() => ({
        active: true,
        streaming: false,
        latest: result,
      }));
      onLeadEventRef?.('lead', 'brainstorm_turn_completed', {
        steps: result.steps.length,
        suggestedAgents: result.suggestedAgents,
      });
    }).catch((err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return;
      onLeadEventRef?.('lead', 'error', { message: err instanceof Error ? err.message : String(err) });
      setBrainstormStateRef?.((s) => ({ ...s, streaming: false }));
    });
  };

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
      // When brainstorm is active, any plain-text message from the user is
      // a plan refinement — route it to lead.continueBrainstorm rather than
      // the teammate mailbox.
      if (lead.isBrainstormActive() && target === 'lead') {
        onLeadEventRef?.('user', 'text', { text });
        streamBrainstormTurn((onDelta, signal) => lead.continueBrainstorm(text, onDelta, signal));
        return;
      }

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
        activateRalphLoop: (promise: string, maxIterations = 20) => {
          lead.setRalphPromise(promise, maxIterations);
        },
        startBrainstorm: (goal: string) => {
          setBrainstormStateRef?.(() => ({ active: true, streaming: true, latest: null }));
          onLeadEventRef?.('user', 'text', { text: `/brainstorm ${goal}` });
          streamBrainstormTurn((onDelta, signal) => lead.startBrainstorm(goal, onDelta, signal));
        },
        executeBrainstormPlan: () => {
          if (!lead.isBrainstormActive()) {
            onLeadEventRef?.('lead', 'plugin_output', {
              stream: 'stdout',
              text: '[/go] no active brainstorm; use /brainstorm <goal> first.',
            });
            return;
          }
          if (!lead.getBrainstormLatest()) {
            onLeadEventRef?.('lead', 'plugin_output', {
              stream: 'stdout',
              text: '[/go] brainstorm has no plan yet — send at least one message first.',
            });
            return;
          }
          brainstormAbortController?.abort();
          lead.commitBrainstorm().then(() => {
            setBrainstormStateRef?.(() => ({ active: false, streaming: false, latest: null }));
          }).catch((err: unknown) => {
            onLeadEventRef?.('lead', 'error', {
              message: `commit failed: ${err instanceof Error ? err.message : String(err)}`,
            });
            setBrainstormStateRef?.((s) => ({ ...s, streaming: false }));
          });
        },
        exitBrainstorm: () => {
          brainstormAbortController?.abort();
          lead.exitBrainstorm();
          setBrainstormStateRef?.(() => ({ active: false, streaming: false, latest: null }));
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
      onSetBrainstormState: (setter) => { setBrainstormStateRef = setter; },
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

  // Run the initial lead turn in background. Previously we called shutdown()
  // the moment lead.run() returned, which killed the TUI after a single-shot
  // CLI-subprocess turn — making interactive chat, /brainstorm, and /plan
  // (which need the TUI alive beyond that first turn) unreachable for those
  // provider types. Now we let lead.run() finish quietly and keep the TUI
  // alive until the user exits via SIGINT/SIGTERM or Ink's own exit signals.
  lead.run().catch(async (err: unknown) => {
    onLeadEventRef?.('lead', 'error', {
      message: err instanceof Error ? err.message : String(err),
    });
  });

  await waitUntilExit();
  await shutdown();
}
