import { useInput } from 'ink';
import type { FocusTarget } from './types.js';

interface Props {
  focus: FocusTarget;
  teammateCount: number;
  inputActive: boolean;
  onCycleFocus: (next: FocusTarget) => void;
  onToggleTaskList: () => void;
  onActivateInput: () => void;
  onDeactivateInput: () => void;
}

export function Keybinds({
  focus,
  teammateCount,
  inputActive,
  onCycleFocus,
  onToggleTaskList,
  onActivateInput,
  onDeactivateInput,
}: Props) {
  useInput((input, key) => {
    // Shift+Down — cycle focus: lead → teammate 0 → ... → teammate N-1 → lead
    if (key.shift && key.downArrow) {
      if (focus === 'lead') {
        if (teammateCount > 0) onCycleFocus(0);
      } else {
        const next = focus + 1;
        onCycleFocus(next >= teammateCount ? 'lead' : next);
      }
      return;
    }

    // Ctrl+T — toggle task list
    if (key.ctrl && input === 't') {
      onToggleTaskList();
      return;
    }

    // Enter — activate input for focused pane (only when not already active)
    if (key.return && !inputActive) {
      onActivateInput();
      return;
    }

    // Esc — deactivate input / interrupt
    if (key.escape) {
      onDeactivateInput();
      return;
    }
  });

  return null;
}
