import React, { useState, useCallback } from 'react';
import { Box, useStdout } from 'ink';
import { LeadPane } from './LeadPane.js';
import { TeammatePane } from './TeammatePane.js';
import { TaskListPanel } from './TaskListPanel.js';
import { InputBar } from './InputBar.js';
import { Keybinds } from './Keybinds.js';
import type { AppState, FocusTarget } from './types.js';

interface Props {
  // Live state: leadEvents, teammates, tasks, teamName are updated by parent (useTeamState).
  // App owns local UI state: focus, showTaskList, inputValue.
  initialState: AppState;
  onSendMessage?: (target: FocusTarget, text: string) => void;
  onInterrupt?: (target: FocusTarget) => void;
}

const TASK_PANEL_WIDTH = 36;

export function App({ initialState, onSendMessage, onInterrupt }: Props) {
  // Live content from parent — re-renders as parent passes updated state down.
  const { teamName, leadEvents, teammates, tasks } = initialState;

  // Local UI-only state — not driven by notifier after mount.
  const [focus, setFocus] = useState<FocusTarget>(initialState.focus);
  const [showTaskList, setShowTaskList] = useState(initialState.showTaskList);
  const [inputValue, setInputValue] = useState(initialState.inputValue);
  const [inputActive, setInputActive] = useState(false);

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
      if (value.trim()) {
        onSendMessage?.(focus, value.trim());
        setInputValue('');
        setInputActive(false);
      }
    },
    [focus, onSendMessage],
  );

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
        value={inputValue}
        onChange={handleInputChange}
        onSubmit={handleInputSubmit}
        isActive={inputActive}
      />
    </Box>
  );
}
