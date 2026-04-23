import React from 'react';
import { Box, Text } from 'ink';
import type { DisplayEvent } from './types.js';

const MAX_LINES = 20;

interface Props {
  teamName: string;
  events: DisplayEvent[];
  isFocused: boolean;
  width: number;
}

function EventLine({ event }: { event: DisplayEvent }) {
  const color = event.kind === 'error' ? 'red' : event.kind === 'tool_call' ? 'cyan' : 'white';
  return (
    <Text color={color} wrap="truncate">
      {event.text}
    </Text>
  );
}

export function LeadPane({ teamName, events, isFocused, width }: Props) {
  const borderColor = isFocused ? 'cyan' : 'gray';
  const recent = events.slice(-MAX_LINES);

  return (
    <Box
      borderStyle="single"
      borderColor={borderColor}
      flexDirection="column"
      width={width}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text bold color={isFocused ? 'cyan' : 'white'}>
          lead
        </Text>
        <Text color="gray" dimColor>
          {teamName}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {recent.length === 0 ? (
          <Text color="gray" dimColor>
            waiting...
          </Text>
        ) : (
          recent.map((ev) => <EventLine key={ev.id} event={ev} />)
        )}
      </Box>
    </Box>
  );
}
