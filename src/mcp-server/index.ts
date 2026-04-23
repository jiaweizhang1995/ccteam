/**
 * Standalone CLI entry: agent-teams-mcp --team <name> --stdio
 * Spawned as a subprocess by CLI-wrapped agent providers.
 */
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { homedir } from 'node:os';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    team: { type: 'string' },
    stdio: { type: 'boolean' },
  },
  strict: false,
});

if (!values['team']) {
  console.error('Usage: agent-teams-mcp --team <name> [--stdio]');
  process.exit(1);
}

const teamName = values['team'] as string;
const dbPath = join(homedir(), '.agent-teams', 'state.db');

const { State } = await import('../state/index.js');
const { StateAdapter } = await import('./state-adapter.js');
const { runStdioServer } = await import('./server.js');

const state = new State(dbPath);
const adapter = new StateAdapter(state, teamName);
await runStdioServer(adapter);
