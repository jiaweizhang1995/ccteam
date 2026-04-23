import React from 'react';
import { Box, Text } from 'ink';
import type { TaskItem } from './types.js';

const STATUS_SYMBOL: Record<string, string> = {
  pending: '○',
  in_progress: '◎',
  completed: '●',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'gray',
  in_progress: 'yellow',
  completed: 'green',
};

interface Props {
  tasks: TaskItem[];
  width: number;
}

function TaskRow({ task }: { task: TaskItem }) {
  const symbol = STATUS_SYMBOL[task.status] ?? '?';
  const color = STATUS_COLOR[task.status] ?? 'white';
  const blocked = task.blockedBy.length > 0;

  return (
    <Box>
      <Text color={color}>{symbol} </Text>
      <Text
        color={blocked ? 'gray' : 'white'}
        dimColor={blocked}
        wrap="truncate"
      >
        {task.title}
        {task.assignedTo ? ` (${task.assignedTo})` : ''}
        {blocked ? ' [blocked]' : ''}
      </Text>
    </Box>
  );
}

export function TaskListPanel({ tasks, width }: Props) {
  const pending = tasks.filter((t) => t.status === 'pending');
  const inProgress = tasks.filter((t) => t.status === 'in_progress');
  const completed = tasks.filter((t) => t.status === 'completed');

  return (
    <Box
      borderStyle="single"
      borderColor="magenta"
      flexDirection="column"
      width={width}
      paddingX={1}
    >
      <Text bold color="magenta">
        Tasks (Ctrl+T to hide)
      </Text>

      {inProgress.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" dimColor>
            in progress
          </Text>
          {inProgress.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </Box>
      )}

      {pending.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray" dimColor>
            pending
          </Text>
          {pending.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </Box>
      )}

      {completed.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="green" dimColor>
            completed
          </Text>
          {completed.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </Box>
      )}

      {tasks.length === 0 && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            no tasks yet
          </Text>
        </Box>
      )}
    </Box>
  );
}
