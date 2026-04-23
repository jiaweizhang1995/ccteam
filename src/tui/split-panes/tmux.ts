import { execSync, spawn } from 'node:child_process';

export interface TmuxPane {
  paneId: string;
  teammateName: string;
}

export function isTmuxAvailable(): boolean {
  return Boolean(process.env.TMUX);
}

// Split the current tmux window into N panes, one per teammate.
// Returns pane IDs that can be stored in the teammates DB row.
export async function spawnTmuxPanes(
  teamName: string,
  teammateNames: string[],
  binaryPath: string,
): Promise<TmuxPane[]> {
  if (!isTmuxAvailable()) {
    throw new Error('$TMUX not set — not inside a tmux session');
  }

  const panes: TmuxPane[] = [];

  for (const name of teammateNames) {
    // Split the current pane horizontally; capture the new pane id.
    // -P -F '#{pane_id}' prints the new pane's id.
    const paneId = execSync(
      `tmux split-window -h -P -F '#{pane_id}' '${binaryPath} attach ${teamName} --teammate ${name}'`,
    )
      .toString()
      .trim();

    panes.push({ paneId, teammateName: name });
  }

  // Re-balance all panes after splitting.
  execSync('tmux select-layout even-horizontal');

  return panes;
}

export async function killTmuxPane(paneId: string): Promise<void> {
  try {
    execSync(`tmux kill-pane -t ${paneId}`);
  } catch {
    // Pane already gone — fine.
  }
}
