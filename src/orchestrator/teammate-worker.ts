/**
 * Entry point for teammate worker child processes.
 * Boots provider + MCP client + agent loop.
 */
import { join } from 'node:path';
import { homedir } from 'node:os';

const teamName = process.env['AGENT_TEAMS_TEAM_NAME'] ?? '';
const agentName = process.env['AGENT_TEAMS_AGENT_NAME'] ?? '';
const agentId = process.env['AGENT_TEAMS_AGENT_ID'] ?? '';
const providerId = process.env['AGENT_TEAMS_PROVIDER'] ?? '';
const systemPromptEnv = process.env['AGENT_TEAMS_SYSTEM_PROMPT'];
const mcpConfigPathEnv = process.env['AGENT_TEAMS_MCP_CONFIG_PATH'];

if (!teamName || !agentName || !agentId || !providerId) {
  console.error('teammate-worker: missing required env vars (TEAM_NAME, AGENT_NAME, AGENT_ID, PROVIDER)');
  process.exit(1);
}

const dbPath = join(homedir(), '.agent-teams', 'state.db');

const { State } = await import('../state/index.js');
const { createBackend } = await import('../providers/factory.js');
const { createInProcessServer } = await import('../mcp-server/server.js');
const { StateAdapter } = await import('../mcp-server/state-adapter.js');
const { loadConfig } = await import('../config/loader.js');
const { getCodexMcpOverrides } = await import('./mcp-config-writer.js');
import type { ProviderConfig } from '../providers/factory.js';
import type { ChatMessage } from '../providers/types.js';

const state = new State(dbPath);
const adapter = new StateAdapter(state, teamName);

const identity = {
  agentId,
  agentName,
  teamName,
  isLead: false,
};

const { client: mcpClient, cleanup: mcpCleanup } = await createInProcessServer(adapter, identity);

const toolsResult = await mcpClient.listTools();
const toolSpecs = (toolsResult.tools ?? []).map((t) => ({
  name: t.name,
  description: t.description ?? '',
  schema: {
    type: 'object' as const,
    properties: (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {},
    required: (t.inputSchema as { required?: string[] }).required,
  },
}));

// Resolve full provider config from config file
const config = loadConfig(process.cwd());
const baseConfig = config.providers.get(providerId) ?? ({ type: providerId } as ProviderConfig);
const resolvedConfig: ProviderConfig = {
  ...baseConfig,
  // Thread mcp config path for CLI-backed providers
  ...(mcpConfigPathEnv ? { mcpConfigPath: mcpConfigPathEnv } : {}),
  // codex needs inline -c overrides instead of a config file
  ...(baseConfig.type === 'codex-cli'
    ? { mcpOverrides: getCodexMcpOverrides({ teamName, agentName, agentId, isLead: false }) }
    : {}),
};

const backend = createBackend(agentName, resolvedConfig);

const systemPrompt = systemPromptEnv ?? `You are ${agentName}, a teammate in team ${teamName}. Use the available tools to coordinate with your team, claim tasks, and complete your assigned work.`;

const conversation: ChatMessage[] = [];

const notifier = state.startNotifier(teamName);

notifier.on('message', (e) => {
  const msg = e.message;
  if (msg.to_agent !== agentName && msg.to_agent !== null) return;
  const body = JSON.parse(msg.body) as {
    text?: string; decision?: string; reason?: string; plan?: string; request_id?: string; feedback?: string;
  };

  if (msg.kind === 'shutdown_request') {
    process.stderr.write(`[${agentName}] received shutdown_request, shutting down\n`);
    shutdown().catch(() => {});
    return;
  }

  if (msg.kind === 'plan_decision') {
    // Unblock any submit_plan poll waiting on this — it reads directly from state,
    // so just surface the decision as a user turn for awareness
    const verdict = body.decision === 'approve' ? 'APPROVED' : `REJECTED: ${body.feedback ?? 'no feedback'}`;
    conversation.push({ role: 'user', content: `[Plan decision from lead]: ${verdict}` });
    return;
  }

  const text = body.text ?? JSON.stringify(body);
  conversation.push({ role: 'user', content: `[Message from ${msg.from_agent}]: ${text}` });
});

const controller = new AbortController();

function extractToolResultText(content: unknown): string {
  if (!Array.isArray(content)) return String(content);
  return (content as Array<{ type: string; text?: string }>)
    .map((c) => (c.type === 'text' ? (c.text ?? '') : c.type === 'image' ? '[image]' : ''))
    .join('');
}

async function agentLoop(): Promise<void> {
  state.updateTeammateStatus(agentId, 'active');

  let lastConversationLen = -1;

  while (!controller.signal.aborted) {
    // Don't re-query provider if nothing changed since last idle — wait for inbound message.
    if (conversation.length === lastConversationLen) {
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      continue;
    }

    const result = await backend.run({
      systemPrompt,
      messages: conversation,
      tools: toolSpecs,
      signal: controller.signal,
      onEvent: () => {},
    });

    if (result.error) {
      console.error(`[${agentName}] error: ${result.error}`);
      break;
    }

    if (result.tool_calls.length > 0) {
      // Build assistant turn with content blocks
      const assistantContent: ChatMessage['content'] = [];
      if (result.text) {
        (assistantContent as Array<unknown>).push({ type: 'text', text: result.text });
      }
      for (const tc of result.tool_calls) {
        (assistantContent as Array<unknown>).push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      conversation.push({ role: 'assistant', content: assistantContent });

      state.updateTeammateStatus(agentId, 'active');

      // Execute tools and build tool_result user turn
      const toolResultContent: ChatMessage['content'] = [];
      for (const tc of result.tool_calls) {
        const toolResult = await mcpClient.callTool({ name: tc.name, arguments: tc.input });
        const text = extractToolResultText(toolResult.content);
        const isError = !!(toolResult as { isError?: boolean }).isError;
        (toolResultContent as Array<unknown>).push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: text,
          is_error: isError,
        });
      }
      conversation.push({ role: 'user', content: toolResultContent });
    } else {
      // No tool calls — pure text, go idle
      if (result.text) {
        conversation.push({ role: 'assistant', content: result.text });
      }
      state.updateTeammateStatus(agentId, 'idle');
      state.appendEvent({
        team_name: teamName,
        agent: agentName,
        kind: 'teammate_idle',
        payload: JSON.stringify({ name: agentName, last_activity_ts: Date.now() }),
        created_at: Date.now(),
      });
      lastConversationLen = conversation.length;
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function shutdown(): Promise<void> {
  controller.abort();
  notifier.stop();
  await mcpCleanup();
  await backend.shutdown();
  state.updateTeammateStatus(agentId, 'shutdown');
  state.appendEvent({
    team_name: teamName,
    agent: agentName,
    kind: 'teammate_shutdown',
    payload: JSON.stringify({ name: agentName }),
    created_at: Date.now(),
  });
  state.close();
  process.exit(0);
}

process.on('SIGTERM', () => { shutdown().catch(() => {}); });
process.on('SIGINT', () => { shutdown().catch(() => {}); });

await agentLoop();
await shutdown();
