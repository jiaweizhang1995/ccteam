import { State } from '../../src/state/index.js';
import { homedir } from 'node:os';

const s = new State(homedir() + '/.agent-teams/state.db');
s.createTeam({
  name: 'bridge-test',
  created_at: Date.now(),
  lead_session_id: 'test-lead',
  lead_provider: 'codex-cli',
  permission_mode: 'bypassPermissions',
  working_dir: process.cwd(),
  status: 'active',
});
s.close();
console.log('seeded bridge-test team');
