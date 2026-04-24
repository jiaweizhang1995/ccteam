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
  'message_sent',
  'tool_result',
]);

// See LeadPane.tsx for rationale — one oversize event can eat the whole
// pane, so we clip to N lines / M chars with a middle-ellipsis.
const MAX_EVENT_LINES = 6;
const MAX_EVENT_CHARS = 500;

function clipForPane(text: string): string {
  const lines = text.split('\n');
  if (lines.length > MAX_EVENT_LINES) {
    const head = lines.slice(0, 1);
    const tail = lines.slice(-(MAX_EVENT_LINES - 2));
    return [
      ...head,
      `… (${lines.length - MAX_EVENT_LINES + 1} more lines) …`,
      ...tail,
    ].join('\n');
  }
  if (text.length > MAX_EVENT_CHARS) {
    const keepTail = Math.floor(MAX_EVENT_CHARS * 0.7);
    const keepHead = MAX_EVENT_CHARS - keepTail - 30;
    return (
      text.slice(0, keepHead) +
      ` … (${text.length - MAX_EVENT_CHARS} chars) … ` +
      text.slice(-keepTail)
    );
  }
  return text;
}

function EventLine({ event }: { event: DisplayEvent }) {
  const color = event.kind === 'error' ? 'red' : event.kind === 'tool_call' ? 'cyan' : 'white';
  const isContent = CONTENT_EVENT_KINDS.has(event.kind);
  const wrapMode = isContent ? 'wrap' : 'truncate';
  const text = isContent ? clipForPane(event.text) : event.text;
  return (
    <Text color={color} wrap={wrapMode}>
      {text}
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
