import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { FocusTarget } from './types.js';

interface Props {
  focus: FocusTarget;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isActive: boolean;
}

function focusLabel(focus: FocusTarget): string {
  if (focus === 'lead') return 'lead';
  return `teammate ${focus + 1}`;
}

export function InputBar({ focus, value, onChange, onSubmit, isActive }: Props) {
  return (
    <Box borderStyle="single" borderColor={isActive ? 'cyan' : 'gray'} paddingX={1}>
      <Text color="gray" dimColor>
        [{focusLabel(focus)}]{' '}
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
