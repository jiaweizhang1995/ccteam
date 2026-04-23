import { createInProcessServer } from '../../src/mcp-server/server.js';
import type { StateFacade } from '../../src/mcp-server/state-facade.js';
import type { AgentIdentity } from '../../src/mcp-server/identity.js';

export const defaultIdentity: AgentIdentity = {
  agentId: 'agent-uuid-1',
  agentName: 'worker-1',
  teamName: 'test-team',
  isLead: false,
};

export const leadIdentity: AgentIdentity = {
  agentId: 'lead-uuid',
  agentName: 'lead',
  teamName: 'test-team',
  isLead: true,
};

export async function bootClient(state: StateFacade, identity = defaultIdentity) {
  return createInProcessServer(state, identity);
}

export async function callTool(
  client: Awaited<ReturnType<typeof createInProcessServer>>['client'],
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ text: string; isError: boolean }> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text: string }>;
  const text = content.map((c) => c.text).join('');
  return { text, isError: !!(result as { isError?: boolean }).isError };
}
