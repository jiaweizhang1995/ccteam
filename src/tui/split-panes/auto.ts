import { isTmuxAvailable, spawnTmuxPanes } from './tmux.js';
import { isITerm2Available, spawnITerm2Panes } from './iterm2.js';

export type TeammateMode = 'in-process' | 'tmux' | 'iterm2' | 'auto';

export interface SpawnedPane {
  teammateName: string;
  mode: 'tmux' | 'iterm2';
  paneId: string;
}

// Resolve which split-pane mode to use.
export function resolveSplitMode(requested: TeammateMode): 'in-process' | 'tmux' | 'iterm2' {
  if (requested === 'auto') {
    if (isTmuxAvailable()) return 'tmux';
    if (isITerm2Available()) return 'iterm2';
    return 'in-process';
  }
  if (requested === 'tmux') return 'tmux';
  if (requested === 'iterm2') return 'iterm2';
  return 'in-process';
}

// Spawn split panes for all teammates, using the resolved mode.
// Returns pane descriptors to store in DB; empty array if in-process mode.
export async function spawnSplitPanes(
  teamName: string,
  teammateNames: string[],
  binaryPath: string,
  mode: TeammateMode,
): Promise<SpawnedPane[]> {
  const resolved = resolveSplitMode(mode);

  if (resolved === 'in-process') return [];

  if (resolved === 'tmux') {
    const panes = await spawnTmuxPanes(teamName, teammateNames, binaryPath);
    return panes.map((p) => ({ teammateName: p.teammateName, mode: 'tmux', paneId: p.paneId }));
  }

  if (resolved === 'iterm2') {
    const panes = await spawnITerm2Panes(teamName, teammateNames, binaryPath);
    return panes.map((p) => ({
      teammateName: p.teammateName,
      mode: 'iterm2',
      paneId: p.sessionId,
    }));
  }

  return [];
}
