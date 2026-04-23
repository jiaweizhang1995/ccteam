import { z } from 'zod';
import type { StateFacade } from '../state-facade.js';
import type { AgentIdentity } from '../identity.js';
import { fireHook } from '../../hooks/registry.js';

export const completeTaskSchema = {
  task_id: z.string().describe('ID of the task to complete'),
  result: z.string().describe('Result or summary of the completed work'),
};

export function makeCompleteTaskHandler(state: StateFacade, identity: AgentIdentity) {
  return async (args: z.infer<z.ZodObject<typeof completeTaskSchema>>) => {
    const task = state.getTask(args.task_id);
    if (!task) {
      return { content: [{ type: 'text' as const, text: `Task not found: ${args.task_id}` }], isError: true };
    }

    const hookResult = await fireHook('TaskCompleted', {
      team: identity.teamName,
      task: {
        id: task.id,
        title: task.title,
        result: args.result,
        assigned_to: task.assigned_to ?? undefined,
      },
    });

    if (!hookResult.allowed) {
      return {
        content: [{ type: 'text' as const, text: `Task completion blocked by hook: ${hookResult.feedback ?? 'no feedback'}` }],
        isError: true,
      };
    }

    state.completeTask(args.task_id, args.result);
    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} completed` }] };
  };
}
