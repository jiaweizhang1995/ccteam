import { z } from 'zod';
import type { StateFacade } from '../state-facade.js';
import type { AgentIdentity } from '../identity.js';
import { checkRateLimit } from '../rate-limiter.js';

export const sendMessageSchema = {
  to: z.string().describe('Recipient teammate name, or "lead"'),
  body: z.string().describe('Message content'),
};

export function makeSendMessageHandler(state: StateFacade, identity: AgentIdentity) {
  return async (args: z.infer<z.ZodObject<typeof sendMessageSchema>>) => {
    if (!checkRateLimit(identity.agentId)) {
      return { content: [{ type: 'text' as const, text: 'Rate limit exceeded: max 30 messages/min' }], isError: true };
    }

    if (args.to !== 'lead') {
      const recipient = state.getTeammateByName(identity.teamName, args.to);
      if (!recipient) {
        return { content: [{ type: 'text' as const, text: `Unknown teammate: ${args.to}` }], isError: true };
      }
    }

    state.insertMessage({
      team_name: identity.teamName,
      from_agent: identity.agentName,
      to_agent: args.to,
      kind: 'message',
      body: JSON.stringify({ text: args.body }),
      created_at: Date.now(),
    });

    return { content: [{ type: 'text' as const, text: `Message sent to ${args.to}` }] };
  };
}
