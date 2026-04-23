import { z } from 'zod';
import type { StateFacade } from '../state-facade.js';
import type { AgentIdentity } from '../identity.js';

export const decidePlanSchema = {
  teammate: z.string().describe('Teammate name whose plan is being decided'),
  decision: z.enum(['approve', 'reject']).describe('Approve or reject the plan'),
  feedback: z.string().optional().describe('Feedback to send to the teammate (required on reject)'),
};

export function makeDecidePlanHandler(state: StateFacade, identity: AgentIdentity) {
  return async (args: z.infer<z.ZodObject<typeof decidePlanSchema>>) => {
    if (!identity.isLead) {
      return { content: [{ type: 'text' as const, text: 'decide_plan is only available to the team lead' }], isError: true };
    }

    state.insertMessage({
      team_name: identity.teamName,
      from_agent: 'lead',
      to_agent: args.teammate,
      kind: 'plan_decision',
      body: JSON.stringify({ decision: args.decision, feedback: args.feedback }),
      created_at: Date.now(),
    });

    return { content: [{ type: 'text' as const, text: `Plan ${args.decision}d for ${args.teammate}` }] };
  };
}
