import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { PlanState } from './types.js';

interface Props {
  plan: PlanState;
  termWidth: number;
  onConfirm: (agentCount: number) => void;
  onCancel: () => void;
}

function clampAgents(n: number): number {
  return Math.min(5, Math.max(1, n));
}

export function PlanPanel({ plan, termWidth, onConfirm, onCancel }: Props) {
  useInput((input, key) => {
    if (!plan.awaitingConfirm) return;

    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      const suggested = plan.parsed?.suggestedAgents ?? null;
      const count = suggested != null
        ? clampAgents(suggested)
        : clampAgents(Math.min(plan.parsed?.steps.length ?? 3, 3));
      onConfirm(count);
      return;
    }

    // 1-9 override
    const digit = parseInt(input, 10);
    if (!isNaN(digit) && digit >= 1 && digit <= 9) {
      onConfirm(clampAgents(digit));
    }
  });

  const lines = plan.text.split('\n');
  const visibleLines = lines.slice(-30); // show last 30 lines while streaming

  const defaultCount = plan.parsed?.suggestedAgents != null
    ? clampAgents(plan.parsed.suggestedAgents)
    : clampAgents(Math.min(plan.parsed?.steps.length ?? 3, 3));

  return (
    <Box
      flexDirection="column"
      width={termWidth}
      borderStyle="double"
      borderColor="magenta"
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text bold color="magenta">Plan Mode</Text>
        {plan.parsed && (
          <Text color="gray">{plan.parsed.steps.length} steps</Text>
        )}
        {!plan.parsed && plan.active && (
          <Text color="yellow">generating...</Text>
        )}
      </Box>

      <Box flexDirection="column" marginY={1}>
        {visibleLines.map((line, i) => (
          <Text key={i} wrap="truncate">{line || ' '}</Text>
        ))}
      </Box>

      {plan.awaitingConfirm && plan.parsed && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginTop={1}>
          <Text color="cyan" bold>
            Spawn {defaultCount} agent{defaultCount !== 1 ? 's' : ''}?
          </Text>
          <Text color="gray" dimColor>
            [Enter=yes ({defaultCount}) / 1-9=override / Esc=cancel]
          </Text>
        </Box>
      )}
    </Box>
  );
}
