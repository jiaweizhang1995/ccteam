import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text, useStdout } from 'ink';
import { LeadPane } from './LeadPane.js';
import { TeammatePane } from './TeammatePane.js';
import { TaskListPanel } from './TaskListPanel.js';
import { InputBar } from './InputBar.js';
import { Keybinds } from './Keybinds.js';
import { PlanPanel } from './PlanPanel.js';
import type { AppState, FocusTarget, PlanState, PlanResult, BrainstormState } from './types.js';
import type { PluginRegistry } from '../plugins/registry.js';

interface Props {
  initialState: AppState;
  onSendMessage?: (target: FocusTarget, text: string) => void;
  onInterrupt?: (target: FocusTarget) => void;
  onPlanRequest?: (goal: string) => void;
  onPlanConfirm?: (plan: PlanResult, agentCount: number) => void;
  /** Called when user submits a slash command that isn't the builtin /plan shortcut. */
  onSlashCommand?: (line: string) => void;
  /** Optional plugin registry — enables slash-command autocomplete dropdown. */
  pluginRegistry?: PluginRegistry;
  // Called on every render with the current setPlanState so run.ts can stream deltas in.
  onSetPlanState?: (setter: (s: PlanState | ((prev: PlanState) => PlanState)) => void) => void;
  // Same pattern for brainstormState (multi-turn /brainstorm + /go flow).
  onSetBrainstormState?: (setter: (s: BrainstormState | ((prev: BrainstormState) => BrainstormState)) => void) => void;
}

const TASK_PANEL_WIDTH = 36;

const IDLE_PLAN: PlanState = { active: false, text: '', parsed: null, awaitingConfirm: false };
const IDLE_BRAINSTORM: BrainstormState = { active: false, streaming: false, latest: null };

export function App({ initialState, onSendMessage, onInterrupt, onPlanRequest, onPlanConfirm, onSlashCommand, pluginRegistry, onSetPlanState, onSetBrainstormState }: Props) {
  const { teamName, leadEvents, teammates, tasks } = initialState;

  const [focus, setFocus] = useState<FocusTarget>(initialState.focus);
  const [showTaskList, setShowTaskList] = useState(initialState.showTaskList);
  const [inputValue, setInputValue] = useState(initialState.inputValue);
  const [inputActive, setInputActive] = useState(false);
  const [planState, setPlanState] = useState<PlanState>(initialState.planState ?? IDLE_PLAN);
  const [brainstormState, setBrainstormState] = useState<BrainstormState>(initialState.brainstormState ?? IDLE_BRAINSTORM);

  // Keep the external refs current so run.ts can push streaming deltas in.
  onSetPlanState?.(setPlanState as (s: PlanState | ((prev: PlanState) => PlanState)) => void);
  onSetBrainstormState?.(setBrainstormState as (s: BrainstormState | ((prev: BrainstormState) => BrainstormState)) => void);

  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 120;
  const paneAreaWidth = showTaskList ? termWidth - TASK_PANEL_WIDTH - 1 : termWidth;
  const paneCount = 1 + teammates.length;
  const paneWidth = Math.max(20, Math.floor(paneAreaWidth / paneCount));

  const cycleFocus = useCallback((next: FocusTarget) => {
    setFocus(next);
    setInputActive(false);
  }, []);

  const toggleTaskList = useCallback(() => setShowTaskList((v) => !v), []);
  const activateInput = useCallback(() => setInputActive(true), []);

  const deactivateInput = useCallback(() => {
    setInputActive(false);
    onInterrupt?.(focus);
  }, [focus, onInterrupt]);

  const handleInputChange = useCallback((value: string) => setInputValue(value), []);

  const handleInputSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      // /plan is a special-case builtin — TUI handles it directly for streaming UX.
      const planMatch = trimmed.match(/^\/plan\s+(.+)$/i);
      if (planMatch) {
        setInputValue('');
        setInputActive(false);
        setPlanState({ active: true, text: '', parsed: null, awaitingConfirm: false });
        onPlanRequest?.(planMatch[1]!.trim());
        return;
      }

      // Any other slash command — dispatch via plugin registry if configured.
      if (trimmed.startsWith('/')) {
        setInputValue('');
        setInputActive(false);
        onSlashCommand?.(trimmed);
        return;
      }

      onSendMessage?.(focus, trimmed);
      setInputValue('');
      setInputActive(false);
    },
    [focus, onSendMessage, onPlanRequest, onSlashCommand],
  );

  const slashMatches = useMemo(() => {
    if (!pluginRegistry || !inputValue.startsWith('/')) return [];
    return pluginRegistry.match(inputValue);
  }, [pluginRegistry, inputValue]);

  const handlePlanConfirm = useCallback(
    (agentCount: number) => {
      if (!planState.parsed) return;
      onPlanConfirm?.(planState.parsed, agentCount);
      setPlanState(IDLE_PLAN);
    },
    [planState.parsed, onPlanConfirm],
  );

  const handlePlanCancel = useCallback(() => setPlanState(IDLE_PLAN), []);

  if (planState.active) {
    return (
      <Box flexDirection="column" width={termWidth}>
        <PlanPanel
          plan={planState}
          termWidth={termWidth}
          onConfirm={handlePlanConfirm}
          onCancel={handlePlanCancel}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={termWidth}>
      {brainstormState.active && (
        <Box
          borderStyle="single"
          borderColor="magenta"
          paddingX={1}
          flexDirection="column"
        >
          <Box>
            <Text bold color="magenta">🧠 brainstorming </Text>
            {brainstormState.streaming && <Text color="yellow">… thinking</Text>}
            {!brainstormState.streaming && brainstormState.latest && (
              <Text color="gray">
                — plan has {brainstormState.latest.steps.length} step{brainstormState.latest.steps.length === 1 ? '' : 's'}
                {brainstormState.latest.suggestedAgents != null && `, suggests ${brainstormState.latest.suggestedAgents} agent${brainstormState.latest.suggestedAgents === 1 ? '' : 's'}`}
              </Text>
            )}
          </Box>

          {/*
            Plan preview. LeadPane truncates each event to one line so
            long plan text flowing through as text_delta fragments was
            effectively invisible — the user complaint that kicked off
            this panel. Render `brainstormState.latest` here with full
            wrapping so the current plan is always legible.

            Prefer parsed steps when available (each step as its own line,
            numbered). Fall back to rawText when parsing returned nothing
            useful (e.g. lead responded with discussion rather than a
            numbered plan — we still want to show what it said).
          */}
          {brainstormState.latest && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="magenta" bold>current plan:</Text>
              {brainstormState.latest.steps.length > 0 ? (
                brainstormState.latest.steps.map((step, i) => (
                  <Text key={`step-${i}`} wrap="wrap">
                    <Text color="cyan">{i + 1}. </Text>
                    <Text>{step}</Text>
                  </Text>
                ))
              ) : (
                <Text wrap="wrap" color="white">{brainstormState.latest.rawText}</Text>
              )}
            </Box>
          )}

          <Text color="gray" dimColor>
            send messages to refine · /go to execute · /cancel to abort
          </Text>
        </Box>
      )}

      <Keybinds
        focus={focus}
        teammateCount={teammates.length}
        inputActive={inputActive}
        onCycleFocus={cycleFocus}
        onToggleTaskList={toggleTaskList}
        onActivateInput={activateInput}
        onDeactivateInput={deactivateInput}
      />

      <Box flexDirection="row" flexGrow={1}>
        <LeadPane
          teamName={teamName}
          events={leadEvents}
          isFocused={focus === 'lead'}
          width={paneWidth}
        />
        {teammates.map((tm, idx) => (
          <TeammatePane
            key={tm.id}
            teammate={tm}
            isFocused={focus === idx}
            width={paneWidth}
          />
        ))}

        {showTaskList && (
          <TaskListPanel tasks={tasks} width={TASK_PANEL_WIDTH} />
        )}
      </Box>

      <InputBar
        focus={focus}
        teammates={teammates}
        value={inputValue}
        onChange={handleInputChange}
        onSubmit={handleInputSubmit}
        isActive={inputActive}
        slashMatches={slashMatches}
      />
    </Box>
  );
}
