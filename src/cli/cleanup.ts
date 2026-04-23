import { State } from '../state/index.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

export async function cleanupTeam(teamName: string, opts: { force?: boolean }): Promise<void> {
  const dbPath = join(homedir(), '.agent-teams', 'state.db');
  const state = new State(dbPath);

  const team = state.getTeam(teamName);
  if (!team) {
    console.error(`Team not found: ${teamName}`);
    state.close();
    process.exit(1);
  }

  const activeTeammates = state.listActiveTeammates(teamName);
  if (activeTeammates.length > 0 && !opts.force) {
    console.error(`Team ${teamName} has ${activeTeammates.length} active teammate(s). Use --force to kill them.`);
    state.close();
    process.exit(1);
  }

  if (opts.force) {
    for (const tm of activeTeammates) {
      if (tm.pid) {
        try { process.kill(tm.pid, 'SIGKILL'); } catch { /* already dead */ }
      }
      state.updateTeammateStatus(tm.id, 'shutdown');
    }
  }

  state.updateTeamStatus(teamName, 'cleaned');
  state.close();
  console.log(`Team ${teamName} cleaned up.`);
}
