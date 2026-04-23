import { z } from 'zod';
import type { StateFacade } from '../state-facade.js';
import type { AgentIdentity } from '../identity.js';

export const requestShutdownSchema = {
  teammate: z.string().describe('Teammate name to request shutdown for'),
  reason: z.string().optional().describe('Reason for shutdown request'),
};

export function makeRequestShutdownHandler(state: StateFacade, identity: AgentIdentity) {
  return async (args: z.infer<z.ZodObject<typeof requestShutdownSchema>>) => {
    if (!identity.isLead) {
      return { content: [{ type: 'text' as const, text: 'request_shutdown is only available to the team lead' }], isError: true };
    }

    const tm = state.getTeammateByName(identity.teamName, args.teammate);
    if (!tm) {
      return { content: [{ type: 'text' as const, text: `Unknown teammate: ${args.teammate}` }], isError: true };
    }

    state.insertMessage({
      team_name: identity.teamName,
      from_agent: 'lead',
      to_agent: args.teammate,
      kind: 'shutdown_request',
      body: JSON.stringify({ reason: args.reason }),
      created_at: Date.now(),
    });

    return { content: [{ type: 'text' as const, text: `Shutdown request sent to ${args.teammate}` }] };
  };
}
