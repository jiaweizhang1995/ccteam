/**
 * Stdio MCP bridge — spawned as a subprocess by CLI-wrapped providers (codex, claude).
 * Reads identity from env vars, opens state DB, serves team tools over stdio.
 */
import { join } from 'node:path';
import { homedir } from 'node:os';

const teamName = process.env['AGENT_TEAMS_TEAM_NAME'] ?? '';
const agentName = process.env['AGENT_TEAMS_AGENT_NAME'] ?? '';
const agentId = process.env['AGENT_TEAMS_AGENT_ID'] ?? '';
const isLead = process.env['AGENT_TEAMS_IS_LEAD'] === '1';

if (!teamName || !agentName || !agentId) {
  process.stderr.write(
    'mcp-bridge: missing required env vars (AGENT_TEAMS_TEAM_NAME, AGENT_TEAMS_AGENT_NAME, AGENT_TEAMS_AGENT_ID)\n',
  );
  process.exit(1);
}

const dbPath = join(homedir(), '.agent-teams', 'state.db');

const { State } = await import('./state/index.js');
const { StateAdapter } = await import('./mcp-server/state-adapter.js');
const { runStdioServer } = await import('./mcp-server/server.js');

const state = new State(dbPath);
const adapter = new StateAdapter(state, teamName);

const identity = { agentId, agentName, teamName, isLead };

await runStdioServer(adapter, identity);
