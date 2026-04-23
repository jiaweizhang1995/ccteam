import React from 'react';
import { Box, Text } from 'ink';
import type { SlashMatch } from '../plugins/types.js';

interface Props {
  matches: SlashMatch[];
  selectedIndex: number;
  visible: boolean;
  maxShown?: number;
}

/**
 * Dropdown shown under the InputBar when user is typing a slash command.
 * Arrow keys / Tab navigate; Enter selects (handled by InputBar wrapper).
 */
export function SlashAutocomplete({ matches, selectedIndex, visible, maxShown = 6 }: Props) {
  if (!visible || matches.length === 0) return null;

  const visibleMatches = matches.slice(0, maxShown);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="magenta" paddingX={1}>
      <Text bold color="magenta">
        slash commands ({matches.length} match{matches.length === 1 ? '' : 'es'})
      </Text>
      {visibleMatches.map((m, i) => {
        const isSel = i === selectedIndex;
        const prefix = isSel ? '▸ ' : '  ';
        const color = isSel ? 'cyan' : 'gray';
        return (
          <Text key={m.plugin.command} color={color} bold={isSel}>
            {prefix}{m.plugin.command}
            {m.plugin.description ? (
              <Text color="gray" dimColor>  — {m.plugin.description.slice(0, 80)}</Text>
            ) : null}
          </Text>
        );
      })}
      {matches.length > maxShown && (
        <Text color="gray" dimColor>  … and {matches.length - maxShown} more — keep typing to narrow</Text>
      )}
      <Text color="gray" dimColor>↑/↓ or Tab to navigate • Enter to select • Esc to cancel</Text>
    </Box>
  );
}
