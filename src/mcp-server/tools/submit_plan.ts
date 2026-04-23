import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { StateFacade } from '../state-facade.js';
import type { AgentIdentity } from '../identity.js';

export const submitPlanSchema = {
  plan: z.string().describe('Plan markdown or description to submit for lead approval'),
};

const POLL_INTERVAL_MS = 500;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function makeSubmitPlanHandler(state: StateFacade, identity: AgentIdentity) {
  return async (args: z.infer<z.ZodObject<typeof submitPlanSchema>>) => {
    const requestId = uuidv4();

    state.insertMessage({
      team_name: identity.teamName,
      from_agent: identity.agentName,
      to_agent: 'lead',
      kind: 'plan_request',
      body: JSON.stringify({ plan: args.plan, request_id: requestId }),
      created_at: Date.now(),
    });

    const deadline = Date.now() + TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));

      const messages = state.getMessages(identity.teamName, {
        fromAgent: 'lead',
        toAgent: identity.agentName,
        kind: 'plan_decision',
      });

      for (const msg of messages) {
        const body = JSON.parse(msg.body) as { request_id?: string; decision?: string; feedback?: string };
        if (body.request_id !== requestId) continue;

        if (body.decision === 'approve') {
          return { content: [{ type: 'text' as const, text: 'Plan approved by lead' }] };
        } else {
          const reason = body.feedback ?? 'no feedback provided';
          return {
            content: [{ type: 'text' as const, text: `Plan rejected by lead: ${reason}` }],
            isError: true,
          };
        }
      }
    }

    return {
      content: [{ type: 'text' as const, text: 'Plan approval timed out after 5 minutes' }],
      isError: true,
    };
  };
}
