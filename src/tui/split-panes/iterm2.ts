import { execSync } from 'node:child_process';

export interface ITerm2Pane {
  sessionId: string;
  teammateName: string;
}

export function isITerm2Available(): boolean {
  // TERM_PROGRAM is set to "iTerm.app" by iTerm2.
  if (process.env.TERM_PROGRAM !== 'iTerm.app') return false;
  // Also require the it2 CLI to be installed.
  try {
    execSync('which it2', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Open new iTerm2 splits using the `it2` CLI (https://github.com/mkusaka/it2).
// Requires `it2` on $PATH: npm install -g it2
export async function spawnITerm2Panes(
  teamName: string,
  teammateNames: string[],
  binaryPath: string,
): Promise<ITerm2Pane[]> {
  if (!isITerm2Available()) {
    throw new Error(
      'iTerm2 not detected or it2 CLI not installed. Install with: npm install -g it2',
    );
  }

  const panes: ITerm2Pane[] = [];

  for (const name of teammateNames) {
    // it2 split-h opens a vertical split and runs a command.
    const output = execSync(
      `it2 split-h -- '${binaryPath} attach ${teamName} --teammate ${name}'`,
    )
      .toString()
      .trim();

    // it2 outputs the new session ID on stdout.
    panes.push({ sessionId: output, teammateName: name });
  }

  return panes;
}
