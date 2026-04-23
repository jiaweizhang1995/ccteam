import type { State } from '../state/index.js';

/** On startup: scan state DB, SIGKILL stale pids from previous crashed runs */
export function cleanupOrphans(state: State, teamName: string): void {
  const teammates = state.listTeammates(teamName);
  for (const tm of teammates) {
    if (tm.status === 'shutdown') continue;
    if (!tm.pid) continue;

    let alive = false;
    try {
      process.kill(tm.pid, 0); // signal 0 = check existence
      alive = true;
    } catch {
      // ESRCH = no such process
    }

    if (!alive) {
      state.updateTeammateStatus(tm.id, 'shutdown');
    }
  }
}

/** Kill all non-shutdown teammates in a team */
export async function killAllTeammates(state: State, teamName: string, gracePeriodMs = 5_000): Promise<void> {
  const teammates = state.listTeammates(teamName).filter((t) => t.status !== 'shutdown');

  for (const tm of teammates) {
    if (tm.pid) {
      try { process.kill(tm.pid, 'SIGTERM'); } catch { /* ignore */ }
    }
  }

  if (teammates.length === 0) return;

  await new Promise<void>((resolve) => setTimeout(resolve, gracePeriodMs));

  for (const tm of teammates) {
    if (tm.pid) {
      try { process.kill(tm.pid, 'SIGKILL'); } catch { /* already dead */ }
    }
    state.updateTeammateStatus(tm.id, 'shutdown');
  }
}
