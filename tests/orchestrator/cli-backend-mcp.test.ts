/**
 * Integration test: spawn a real mcp-bridge subprocess and verify it serves
 * team tools (list_teammates) correctly over stdio using the MCP protocol.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { State } from '../../src/state/index.js';
import { writeClaudeMcpConfig, writeCodexMcpConfig } from '../../src/orchestrator/mcp-config-writer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgeSrc = join(__dirname, '../../src/mcp-bridge.ts');

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Send a JSON-RPC request to a stdio process and collect the response.
 */
function rpcCall(
  proc: ReturnType<typeof spawn>,
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as JsonRpcResponse;
          if (parsed.id === req.id) {
            proc.stdout?.off('data', onData);
            resolve(parsed);
          }
        } catch {
          // not JSON — ignore
        }
      }
    };
    proc.stdout?.on('data', onData);
    proc.on('error', reject);
    proc.stdin?.write(JSON.stringify(req) + '\n');
  });
}

describe('cli-backend MCP bridge', () => {
  let dir: string;
  let state: State;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcp-bridge-test-'));
    // Bridge resolves DB as $HOME/.agent-teams/state.db
    const agentTeamsDir = join(dir, '.agent-teams');
    mkdirSync(agentTeamsDir, { recursive: true });
    dbPath = join(agentTeamsDir, 'state.db');
    state = new State(dbPath);
    state.createTeam({
      name: 'test-team',
      created_at: Date.now(),
      lead_session_id: 'lead-id',
      lead_provider: 'claude-api',
      permission_mode: 'default',
      working_dir: dir,
      status: 'active',
    });
    state.createTeammate({
      id: 'tm-alice',
      team_name: 'test-team',
      name: 'alice',
      agent_type: null,
      provider: 'claude-api',
      model: null,
      system_prompt: null,
      pid: null,
      pane_id: null,
      status: 'active',
      tools_allowlist: null,
    });
    // Close so bridge subprocess can open the same DB (WAL supports multi-process)
    state.close();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('bridge subprocess responds to list_teammates via JSON-RPC', async () => {
    const proc = spawn('tsx', [bridgeSrc], {
      env: {
        ...process.env,
        AGENT_TEAMS_TEAM_NAME: 'test-team',
        AGENT_TEAMS_AGENT_NAME: 'worker-1',
        AGENT_TEAMS_AGENT_ID: 'agent-id-1',
        AGENT_TEAMS_IS_LEAD: '0',
        // Override db path so bridge reads our test DB
        HOME: dir,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Give the bridge a moment to boot
    await new Promise<void>((r) => setTimeout(r, 800));

    // MCP initialize handshake
    const initResp = await rpcCall(proc, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '0.0.1' },
      },
    });

    expect(initResp.error).toBeUndefined();

    // Send initialized notification (fire and forget, no response)
    proc.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    // Call list_teammates
    const toolResp = await rpcCall(proc, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'list_teammates',
        arguments: {},
      },
    });

    expect(toolResp.error).toBeUndefined();
    const result = toolResp.result as { content?: Array<{ type: string; text: string }> };
    expect(result.content).toBeDefined();
    const text = result.content?.[0]?.text ?? '';
    const teammates = JSON.parse(text) as Array<{ name: string }>;
    expect(teammates.some((t) => t.name === 'alice')).toBe(true);

    proc.kill('SIGTERM');
  }, 15000);

  it('writeClaudeMcpConfig produces valid JSON with correct env vars', async () => {
    const path = writeClaudeMcpConfig({
      teamName: 'test-team',
      agentName: 'lead',
      agentId: 'lead-uuid',
      isLead: true,
    });

    const cfg = JSON.parse(readFileSync(path, 'utf8')) as {
      mcpServers: {
        agent_teams: {
          command: string;
          args: string[];
          env: Record<string, string>;
        };
      };
    };

    expect(cfg.mcpServers.agent_teams.env['AGENT_TEAMS_TEAM_NAME']).toBe('test-team');
    expect(cfg.mcpServers.agent_teams.env['AGENT_TEAMS_AGENT_NAME']).toBe('lead');
    expect(cfg.mcpServers.agent_teams.env['AGENT_TEAMS_AGENT_ID']).toBe('lead-uuid');
    expect(cfg.mcpServers.agent_teams.env['AGENT_TEAMS_IS_LEAD']).toBe('1');
    expect(cfg.mcpServers.agent_teams.args.length).toBeGreaterThan(0);
  });

  it('writeCodexMcpConfig produces valid TOML with correct env section', async () => {
    const path = writeCodexMcpConfig({
      teamName: 'test-team',
      agentName: 'worker-2',
      agentId: 'worker-uuid',
      isLead: false,
    });

    const toml = readFileSync(path, 'utf8');

    expect(toml).toContain('[mcp_servers.agent_teams]');
    expect(toml).toContain('AGENT_TEAMS_TEAM_NAME = "test-team"');
    expect(toml).toContain('AGENT_TEAMS_AGENT_NAME = "worker-2"');
    expect(toml).toContain('AGENT_TEAMS_AGENT_ID = "worker-uuid"');
    expect(toml).toContain('AGENT_TEAMS_IS_LEAD = "0"');
  });
});
