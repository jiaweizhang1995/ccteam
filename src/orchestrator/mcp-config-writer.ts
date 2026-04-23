import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface McpBridgeIdentity {
  teamName: string;
  agentName: string;
  agentId: string;
  isLead?: boolean;
}

/** Resolve the bridge script path. tsx in dev, compiled JS in dist. */
function resolveBridgePath(): { command: string; args: string[] } {
  // If we're running under tsx (the file URL points into src/), use tsx.
  // Subprocess may not have node_modules/.bin in PATH, so use the absolute tsx path.
  const isSrc = __dirname.includes('/src/');
  if (isSrc) {
    const bridgeSrc = join(__dirname, '..', 'mcp-bridge.ts');
    const projectRoot = join(__dirname, '..', '..');
    const tsxBin = join(projectRoot, 'node_modules', '.bin', 'tsx');
    return { command: tsxBin, args: [bridgeSrc] };
  }
  // Compiled dist — use node
  const bridgeDist = join(__dirname, '..', 'mcp-bridge.js');
  return { command: 'node', args: [bridgeDist] };
}

function configDir(teamName: string, agentName: string): string {
  return join(homedir(), '.agent-teams', 'teams', teamName, agentName);
}

/** Write a codex mcp-config.toml and return the path. */
export function writeCodexMcpConfig(identity: McpBridgeIdentity): string {
  const { command, args } = resolveBridgePath();
  const dir = configDir(identity.teamName, identity.agentName);
  mkdirSync(dir, { recursive: true });

  const argsToml = args.map((a) => `"${a}"`).join(', ');
  const envBlock = [
    `AGENT_TEAMS_TEAM_NAME = "${identity.teamName}"`,
    `AGENT_TEAMS_AGENT_NAME = "${identity.agentName}"`,
    `AGENT_TEAMS_AGENT_ID = "${identity.agentId}"`,
    `AGENT_TEAMS_IS_LEAD = "${identity.isLead ? '1' : '0'}"`,
  ].join('\n    ');

  const toml = `[mcp_servers.agent_teams]
command = "${command}"
args = [${argsToml}]
env = { ${envBlock} }
`;

  const path = join(dir, 'mcp-config.toml');
  writeFileSync(path, toml, 'utf8');
  return path;
}

/** Write a claude mcp-config.json and return the path. */
export function writeClaudeMcpConfig(identity: McpBridgeIdentity): string {
  const { command, args } = resolveBridgePath();
  const dir = configDir(identity.teamName, identity.agentName);
  mkdirSync(dir, { recursive: true });

  const config = {
    mcpServers: {
      agent_teams: {
        command,
        args,
        env: {
          AGENT_TEAMS_TEAM_NAME: identity.teamName,
          AGENT_TEAMS_AGENT_NAME: identity.agentName,
          AGENT_TEAMS_AGENT_ID: identity.agentId,
          AGENT_TEAMS_IS_LEAD: identity.isLead ? '1' : '0',
        },
      },
    },
  };

  const path = join(dir, 'mcp-config.json');
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
  return path;
}

/** Write the appropriate config file for a provider type. Returns path or undefined if not a CLI provider. */
export function writeMcpConfigForProvider(
  providerType: string,
  identity: McpBridgeIdentity,
): string | undefined {
  if (providerType === 'codex-cli') return writeCodexMcpConfig(identity);
  if (providerType === 'claude-cli') return writeClaudeMcpConfig(identity);
  return undefined;
}

/**
 * Build codex `-c key=value` overrides for the team MCP bridge.
 *
 * codex does not accept a whole alternate config file via a CLI flag; it reads
 * `~/.codex/config.toml` and lets you override individual keys via `-c`. Each
 * override value is parsed as TOML, so we emit one -c per leaf key.
 */
export function getCodexMcpOverrides(identity: McpBridgeIdentity): string[] {
  const { command, args } = resolveBridgePath();
  const argsToml = '[' + args.map((a) => `"${a}"`).join(', ') + ']';
  const envInline =
    '{' +
    [
      `AGENT_TEAMS_TEAM_NAME="${identity.teamName}"`,
      `AGENT_TEAMS_AGENT_NAME="${identity.agentName}"`,
      `AGENT_TEAMS_AGENT_ID="${identity.agentId}"`,
      `AGENT_TEAMS_IS_LEAD="${identity.isLead ? '1' : '0'}"`,
    ].join(', ') +
    '}';

  return [
    '-c', `mcp_servers.agent_teams.command="${command}"`,
    '-c', `mcp_servers.agent_teams.args=${argsToml}`,
    '-c', `mcp_servers.agent_teams.env=${envInline}`,
  ];
}
