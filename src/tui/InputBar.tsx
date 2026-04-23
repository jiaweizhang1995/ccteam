import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { SlashAutocomplete } from './SlashAutocomplete.js';
import type { FocusTarget, TeammateState } from './types.js';
import type { SlashMatch } from '../plugins/types.js';

interface Props {
  focus: FocusTarget;
  teammates: TeammateState[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isActive: boolean;
  slashMatches?: SlashMatch[];
}

function focusLabel(focus: FocusTarget, teammates: TeammateState[]): string {
  if (focus === 'lead') return 'lead';
  return teammates[focus as number]?.name ?? `teammate ${(focus as number) + 1}`;
}

export function InputBar({ focus, teammates, value, onChange, onSubmit, isActive, slashMatches }: Props) {
  const showAutocomplete = isActive && value.startsWith('/') && !!slashMatches && slashMatches.length > 0;
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Reset selection to 0 when matches change shape
  useEffect(() => { setSelectedIdx(0); }, [slashMatches?.length]);

  // Refs so useInput sees latest value without stale-closure issues (Ink's
  // useInput useEffect does not include inputHandler in its deps).
  const valueRef = useRef(value);
  const matchesRef = useRef(slashMatches);
  const onChangeRef = useRef(onChange);
  const selectedRef = useRef(selectedIdx);
  const showRef = useRef(showAutocomplete);
  useEffect(() => { valueRef.current = value; });
  useEffect(() => { matchesRef.current = slashMatches; });
  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => { selectedRef.current = selectedIdx; });
  useEffect(() => { showRef.current = showAutocomplete; });

  // Tab to complete, ↑/↓ to navigate suggestion list. Runs alongside
  // ink-text-input's own useInput; non-Tab/arrow keys fall through normally.
  useInput((input, key) => {
    if (!showRef.current) return;
    const matches = matchesRef.current ?? [];
    if (matches.length === 0) return;

    if (key.tab) {
      // Complete to selected match + trailing space (ready for args).
      const pick = matches[selectedRef.current] ?? matches[0]!;
      onChangeRef.current(pick.plugin.command + ' ');
      return;
    }
    if (key.upArrow) {
      setSelectedIdx((i) => (i > 0 ? i - 1 : matches.length - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx((i) => (i < matches.length - 1 ? i + 1 : 0));
      return;
    }
  }, { isActive });

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor={isActive ? 'cyan' : 'gray'} paddingX={1}>
        <Text color="gray" dimColor>
          [{focusLabel(focus, teammates)}]{' '}
        </Text>
        {isActive ? (
          <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
        ) : (
          <Text color="gray" dimColor>
            press Enter to focus, Shift+Down to cycle, / for commands, Tab to complete
          </Text>
        )}
      </Box>
      <SlashAutocomplete
        matches={slashMatches ?? []}
        selectedIndex={selectedIdx}
        visible={showAutocomplete}
      />
    </Box>
  );
}
