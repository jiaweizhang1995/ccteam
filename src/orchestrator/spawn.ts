import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { State } from '../state/index.js';
import type { Teammate } from '../types/index.js';
import { permissionEnvVars, type PermissionMode } from './permissions.js';
import { writeMcpConfigForProvider } from './mcp-config-writer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SpawnSpec {
  teamName: string;
  name: string;
  provider: string;
  model?: string;
  systemPrompt?: string;
  agentType?: string;
  toolsAllowlist?: string[];
  permissionMode: PermissionMode;
}

export interface SpawnedTeammate {
  id: string;
  pid: number;
}

export async function spawnTeammate(
  state: State,
  spec: SpawnSpec,
): Promise<SpawnedTeammate> {
  const agentId = uuidv4();

  const teammate: Teammate = {
    id: agentId,
    team_name: spec.teamName,
    name: spec.name,
    agent_type: spec.agentType ?? null,
    provider: spec.provider,
    model: spec.model ?? null,
    system_prompt: spec.systemPrompt ?? null,
    pid: null,
    pane_id: null,
    status: 'spawning',
    tools_allowlist: spec.toolsAllowlist ? JSON.stringify(spec.toolsAllowlist) : null,
  };

  state.createTeammate(teammate);

  // Write MCP bridge config for CLI-backed providers so the subprocess can reach team tools
  const mcpConfigPath = writeMcpConfigForProvider(spec.provider, {
    teamName: spec.teamName,
    agentName: spec.name,
    agentId,
    isLead: false,
  });

  const workerPath = join(__dirname, 'teammate-worker.js');

  const child = fork(workerPath, [], {
    env: {
      ...process.env,
      ...permissionEnvVars(spec.permissionMode),
      AGENT_TEAMS_TEAM_NAME: spec.teamName,
      AGENT_TEAMS_AGENT_NAME: spec.name,
      AGENT_TEAMS_AGENT_ID: agentId,
      AGENT_TEAMS_PROVIDER: spec.provider,
      ...(spec.model ? { AGENT_TEAMS_MODEL: spec.model } : {}),
      ...(spec.systemPrompt ? { AGENT_TEAMS_SYSTEM_PROMPT: spec.systemPrompt } : {}),
      ...(mcpConfigPath ? { AGENT_TEAMS_MCP_CONFIG_PATH: mcpConfigPath } : {}),
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });

  if (!child.pid) {
    throw new Error(`Failed to spawn teammate ${spec.name}`);
  }

  state.updateTeammatePid(agentId, child.pid);
  state.updateTeammateStatus(agentId, 'active');

  child.stdout?.on('data', (data: Buffer) => {
    process.stderr.write(`[${spec.name}] ${data.toString()}`);
  });
  child.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[${spec.name}:err] ${data.toString()}`);
  });

  child.on('exit', (code) => {
    state.updateTeammateStatus(agentId, 'shutdown');
    process.stderr.write(`[${spec.name}] exited with code ${code ?? 'null'}\n`);
  });

  return { id: agentId, pid: child.pid };
}
