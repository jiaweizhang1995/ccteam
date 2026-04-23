import { State } from '../state/index.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

export async function listTeams(): Promise<void> {
  const dbPath = join(homedir(), '.agent-teams', 'state.db');
  const state = new State(dbPath);
  const teams = state.listTeams();
  state.close();

  if (teams.length === 0) {
    console.log('No active teams.');
    return;
  }

  for (const team of teams) {
    console.log(`${team.name}  [${team.status}]  lead: ${team.lead_provider}  dir: ${team.working_dir}`);
  }
}
