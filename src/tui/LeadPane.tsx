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

// Which event kinds are "content" (free-form text the user needs to read in
// full) versus "markers" (short status badges that look fine on one line).
// Wrapping content events avoids truncating long assistant text; truncating
// markers keeps the log compact.
const CONTENT_EVENT_KINDS = new Set([
  'text_delta',
  'message_received',
  'message_sent',
  'tool_result',
]);

// Per-event display ceiling. Even a single LLM text_delta can be thousands
// of chars; if we wrap all of that, one event fills the entire pane and
// the user loses context of everything else that was happening. Clip each
// content event to max N lines / M chars with a middle-ellipsis so the
// start and end are both visible.
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
    // Prefer keeping the tail since for streaming assistant text the
    // latest tokens are more informative than the earliest.
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
