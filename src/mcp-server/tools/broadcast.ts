import { z } from 'zod';
import type { StateFacade } from '../state-facade.js';
import type { AgentIdentity } from '../identity.js';
import { checkRateLimit } from '../rate-limiter.js';

export const broadcastSchema = {
  body: z.string().describe('Message to send to all active teammates'),
};

export function makeBroadcastHandler(state: StateFacade, identity: AgentIdentity) {
  return async (args: z.infer<z.ZodObject<typeof broadcastSchema>>) => {
    const recipients = state.listActiveTeammates(identity.teamName)
      .filter((t) => t.name !== identity.agentName)
      .map((t) => t.name);

    for (const name of recipients) {
      if (!checkRateLimit(identity.agentId)) {
        return { content: [{ type: 'text' as const, text: 'Rate limit exceeded during broadcast' }], isError: true };
      }
      state.insertMessage({
        team_name: identity.teamName,
        from_agent: identity.agentName,
        to_agent: name,
        kind: 'message',
        body: JSON.stringify({ text: args.body }),
        created_at: Date.now(),
      });
    }

    return { content: [{ type: 'text' as const, text: `Broadcast sent to ${recipients.length} teammate(s)` }] };
  };
}
