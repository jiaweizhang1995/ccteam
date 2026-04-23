import React, { useState, useCallback, useMemo } from 'react';
import { Box, useStdout } from 'ink';
import { LeadPane } from './LeadPane.js';
import { TeammatePane } from './TeammatePane.js';
import { TaskListPanel } from './TaskListPanel.js';
import { InputBar } from './InputBar.js';
import { Keybinds } from './Keybinds.js';
import { PlanPanel } from './PlanPanel.js';
import type { AppState, FocusTarget, PlanState, PlanResult } from './types.js';
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
}

const TASK_PANEL_WIDTH = 36;

const IDLE_PLAN: PlanState = { active: false, text: '', parsed: null, awaitingConfirm: false };

export function App({ initialState, onSendMessage, onInterrupt, onPlanRequest, onPlanConfirm, onSlashCommand, pluginRegistry, onSetPlanState }: Props) {
  const { teamName, leadEvents, teammates, tasks } = initialState;

  const [focus, setFocus] = useState<FocusTarget>(initialState.focus);
  const [showTaskList, setShowTaskList] = useState(initialState.showTaskList);
  const [inputValue, setInputValue] = useState(initialState.inputValue);
  const [inputActive, setInputActive] = useState(false);
  const [planState, setPlanState] = useState<PlanState>(initialState.planState ?? IDLE_PLAN);

  // Keep the external ref current so run.ts can push streaming deltas into planState.
  onSetPlanState?.(setPlanState as (s: PlanState | ((prev: PlanState) => PlanState)) => void);

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
