import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { FocusTarget, TeammateState } from './types.js';

interface Props {
  focus: FocusTarget;
  teammates: TeammateState[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isActive: boolean;
}

function focusLabel(focus: FocusTarget, teammates: TeammateState[]): string {
  if (focus === 'lead') return 'lead';
  return teammates[focus as number]?.name ?? `teammate ${(focus as number) + 1}`;
}

export function InputBar({ focus, teammates, value, onChange, onSubmit, isActive }: Props) {
  return (
    <Box borderStyle="single" borderColor={isActive ? 'cyan' : 'gray'} paddingX={1}>
      <Text color="gray" dimColor>
        [{focusLabel(focus, teammates)}]{' '}
      </Text>
      {isActive ? (
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
      ) : (
        <Text color="gray" dimColor>
          press Enter to focus, Shift+Down to cycle
        </Text>
      )}
    </Box>
  );
}
