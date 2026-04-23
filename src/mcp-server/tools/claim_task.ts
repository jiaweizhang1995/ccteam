import { z } from 'zod';
import type { StateFacade } from '../state-facade.js';
import type { AgentIdentity } from '../identity.js';

export const claimTaskSchema = {
  task_id: z.string().describe('ID of the task to claim'),
};

export function makeClaimTaskHandler(state: StateFacade, identity: AgentIdentity) {
  return async (args: z.infer<z.ZodObject<typeof claimTaskSchema>>) => {
    const task = state.getTask(args.task_id);
    if (!task) {
      return { content: [{ type: 'text' as const, text: `Task not found: ${args.task_id}` }], isError: true };
    }
    if (task.status !== 'pending') {
      return { content: [{ type: 'text' as const, text: `Task ${args.task_id} is not pending (status: ${task.status})` }], isError: true };
    }

    const claimed = await state.claimTask(args.task_id, identity.teamName, identity.agentName);
    if (!claimed) {
      return { content: [{ type: 'text' as const, text: `Failed to claim task ${args.task_id} — already claimed by another agent` }], isError: true };
    }

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} claimed successfully` }] };
  };
}
