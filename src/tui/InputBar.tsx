import React from 'react';
import { Box, Text } from 'ink';
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
            press Enter to focus, Shift+Down to cycle, / for commands
          </Text>
        )}
      </Box>
      <SlashAutocomplete
        matches={slashMatches ?? []}
        selectedIndex={0}
        visible={showAutocomplete}
      />
    </Box>
  );
}
