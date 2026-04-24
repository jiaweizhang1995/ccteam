import React from 'react';
import { Box, Text } from 'ink';
import type { TeammateState, DisplayEvent } from './types.js';

const STATUS_COLOR: Record<string, string> = {
  spawning: 'yellow',
  active: 'green',
  idle: 'blue',
  shutdown: 'gray',
};

const MAX_LINES = 20;

interface Props {
  teammate: TeammateState;
  isFocused: boolean;
  width: number;
}

// Mirror LeadPane: wrap free-form content events (assistant text, incoming
// messages, tool results), truncate short status markers. Keeps long text
// readable without exploding the log with wrapped marker lines.
const CONTENT_EVENT_KINDS = new Set([
  'text_delta',
  'message_received',
  'tool_result',
]);

function EventLine({ event }: { event: DisplayEvent }) {
  const color = event.kind === 'error' ? 'red' : event.kind === 'tool_call' ? 'cyan' : 'white';
  const wrapMode = CONTENT_EVENT_KINDS.has(event.kind) ? 'wrap' : 'truncate';
  return (
    <Text color={color} wrap={wrapMode}>
      {event.text}
    </Text>
  );
}

export function TeammatePane({ teammate, isFocused, width }: Props) {
  const statusColor = STATUS_COLOR[teammate.status] ?? 'white';
  const borderColor = isFocused ? 'cyan' : 'gray';
  const recent = teammate.recentEvents.slice(-MAX_LINES);

  return (
    <Box
      borderStyle="single"
      borderColor={borderColor}
      flexDirection="column"
      width={width}
      paddingX={1}
    >
      {/* Pane header */}
      <Box justifyContent="space-between">
        <Text bold color={isFocused ? 'cyan' : 'white'}>
          {teammate.name}
        </Text>
        <Text color={statusColor}>{teammate.status}</Text>
      </Box>

      <Text color="gray" dimColor>
        {teammate.provider}
        {teammate.currentTaskId ? ` — task: ${teammate.currentTaskId.slice(0, 8)}` : ''}
      </Text>

      {/* Event log */}
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
