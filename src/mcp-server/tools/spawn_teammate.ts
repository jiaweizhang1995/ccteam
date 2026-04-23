import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { StateFacade } from '../state-facade.js';
import type { AgentIdentity } from '../identity.js';

export const spawnTeammateSchema = {
  name: z.string().describe('Unique name for the teammate within the team'),
  provider: z.string().optional().describe('Provider ID to use (falls back to team default)'),
  model: z.string().optional().describe('Model override for the provider'),
  system_prompt: z.string().optional().describe('Custom system prompt for the teammate'),
  agent_type: z.string().optional().describe('Agent type hint (e.g. "explorer", "coder")'),
  tools: z.array(z.string()).optional().describe('Allowlist of tool names the teammate may use'),
};

export type SpawnTeammateArgs = z.infer<z.ZodObject<typeof spawnTeammateSchema>>;

export interface SpawnContext {
  state: import('../../state/index.js').State;
  teamName: string;
  teammateProviderId: string;
  permissionMode: import('../../orchestrator/permissions.js').PermissionMode;
  config: import('../../config/loader.js').AgentTeamsConfig;
  subagentDefs: Map<string, import('../../orchestrator/subagent-defs.js').SubagentDef>;
}

const SPAWN_POLL_INTERVAL_MS = 500;
const SPAWN_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

export function makeSpawnTeammateHandler(state: StateFacade, identity: AgentIdentity, ctx?: SpawnContext) {
  return async (args: SpawnTeammateArgs) => {
    if (!identity.isLead) {
      return { content: [{ type: 'text' as const, text: 'Error: spawn_teammate is lead-only' }], isError: true };
    }

    // Direct spawn path — orchestrator's in-process MCP with full SpawnContext
    if (ctx) {
      const existing = state.getTeammateByName(identity.teamName, args.name);
      if (existing) {
        return {
          content: [{ type: 'text' as const, text: `Error: teammate "${args.name}" already exists` }],
          isError: true,
        };
      }

      let providerId = args.provider ?? ctx.teammateProviderId;
      let systemPrompt = args.system_prompt;
      const model = args.model;

      if (args.agent_type) {
        const def = ctx.subagentDefs.get(args.agent_type);
        if (def) {
          if (!args.provider && def.model) providerId = def.model;
          if (!args.system_prompt && def.description) {
            systemPrompt = `You are ${args.name}. ${def.description}`;
          }
        }
      }

      const { spawnTeammate } = await import('../../orchestrator/spawn.js');

      const spawned = await spawnTeammate(ctx.state, {
        teamName: ctx.teamName,
        name: args.name,
        provider: providerId,
        model,
        systemPrompt,
        agentType: args.agent_type,
        toolsAllowlist: args.tools,
        permissionMode: ctx.permissionMode,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ teammate_id: spawned.id, status: 'spawning' }),
        }],
      };
    }

    // Bridge path — no in-process SpawnContext. Send spawn_request to orchestrator
    // and poll for spawn_response correlated by request_id.
    const requestId = uuidv4();

    state.insertMessage({
      team_name: identity.teamName,
      from_agent: identity.agentName,
      to_agent: 'orchestrator',
      kind: 'spawn_request',
      body: JSON.stringify({ ...args, request_id: requestId }),
      created_at: Date.now(),
    });

    const deadline = Date.now() + SPAWN_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, SPAWN_POLL_INTERVAL_MS));

      const messages = state.getMessages(identity.teamName, {
        fromAgent: 'orchestrator',
        toAgent: identity.agentName,
        kind: 'spawn_response',
      });

      for (const msg of messages) {
        const body = JSON.parse(msg.body) as {
          request_id?: string;
          teammate_id?: string;
          status?: string;
          error?: string;
        };
        if (body.request_id !== requestId) continue;

        if (body.error) {
          return {
            content: [{ type: 'text' as const, text: `Error spawning teammate: ${body.error}` }],
            isError: true,
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ teammate_id: body.teammate_id, status: body.status ?? 'spawning' }),
          }],
        };
      }
    }

    return {
      content: [{ type: 'text' as const, text: 'spawn_teammate timed out waiting for orchestrator response' }],
      isError: true,
    };
  };
}
