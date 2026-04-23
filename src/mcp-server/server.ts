import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import type { StateFacade } from './state-facade.js';
import { resolveIdentity, type AgentIdentity } from './identity.js';
import { makeSendMessageHandler, sendMessageSchema } from './tools/send_message.js';
import { makeBroadcastHandler, broadcastSchema } from './tools/broadcast.js';
import { makeListTeammatesHandler } from './tools/list_teammates.js';
import { makeListTasksHandler, listTasksSchema } from './tools/list_tasks.js';
import { makeCreateTaskHandler, createTaskSchema } from './tools/create_task.js';
import { makeClaimTaskHandler, claimTaskSchema } from './tools/claim_task.js';
import { makeCompleteTaskHandler, completeTaskSchema } from './tools/complete_task.js';
import { makeSubmitPlanHandler, submitPlanSchema } from './tools/submit_plan.js';
import { makeDecidePlanHandler, decidePlanSchema } from './tools/decide_plan.js';
import { makeRequestShutdownHandler, requestShutdownSchema } from './tools/request_shutdown.js';
import { makeSpawnTeammateHandler, spawnTeammateSchema, type SpawnContext } from './tools/spawn_teammate.js';
export type { SpawnContext } from './tools/spawn_teammate.js';

export function buildMcpServer(state: StateFacade, identity: AgentIdentity, spawnContext?: SpawnContext): McpServer {
  const server = new McpServer(
    { name: 'agent-teams-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'send_message',
    { description: 'Send a message to a specific teammate or the team lead', inputSchema: sendMessageSchema },
    makeSendMessageHandler(state, identity),
  );

  server.registerTool(
    'broadcast',
    { description: 'Send a message to all active teammates', inputSchema: broadcastSchema },
    makeBroadcastHandler(state, identity),
  );

  server.registerTool(
    'list_teammates',
    { description: 'List all teammates in the current team with their status' },
    makeListTeammatesHandler(state, identity),
  );

  server.registerTool(
    'list_tasks',
    { description: 'List tasks in the team, optionally filtered by status', inputSchema: listTasksSchema },
    makeListTasksHandler(state, identity),
  );

  server.registerTool(
    'create_task',
    { description: 'Create a new task (fires TaskCreated hook — veto-aware)', inputSchema: createTaskSchema },
    makeCreateTaskHandler(state, identity),
  );

  server.registerTool(
    'claim_task',
    { description: 'Atomically claim a pending task to prevent races', inputSchema: claimTaskSchema },
    makeClaimTaskHandler(state, identity),
  );

  server.registerTool(
    'complete_task',
    { description: 'Mark a task as completed with a result (fires TaskCompleted hook)', inputSchema: completeTaskSchema },
    makeCompleteTaskHandler(state, identity),
  );

  server.registerTool(
    'submit_plan',
    { description: 'Submit a plan to the team lead for approval (blocks until decided)', inputSchema: submitPlanSchema },
    makeSubmitPlanHandler(state, identity),
  );

  server.registerTool(
    'decide_plan',
    { description: 'Lead only: approve or reject a teammate plan', inputSchema: decidePlanSchema },
    makeDecidePlanHandler(state, identity),
  );

  server.registerTool(
    'request_shutdown',
    { description: 'Lead only: request a teammate to shut down', inputSchema: requestShutdownSchema },
    makeRequestShutdownHandler(state, identity),
  );

  // Always register spawn_teammate. When spawnContext is present (orchestrator in-process),
  // it spawns directly. When absent (bridge mode), it uses the spawn_request message protocol.
  server.registerTool(
    'spawn_teammate',
    { description: 'Lead only: spawn a new teammate process', inputSchema: spawnTeammateSchema },
    makeSpawnTeammateHandler(state, identity, spawnContext),
  );

  return server;
}

/** Stdio entry: used when spawned as subprocess for CLI-wrapped agents */
export async function runStdioServer(state: StateFacade, identity?: AgentIdentity): Promise<void> {
  const resolvedIdentity = identity ?? resolveIdentity();
  const server = buildMcpServer(state, resolvedIdentity);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/** In-process entry: returns a connected Client + cleanup for SDK providers */
export async function createInProcessServer(
  state: StateFacade,
  identity: AgentIdentity,
  spawnContext?: SpawnContext,
): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const server = buildMcpServer(state, identity, spawnContext);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({ name: 'agent-teams-client', version: '0.1.0' });
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}
