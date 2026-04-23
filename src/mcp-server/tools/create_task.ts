import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { StateFacade } from '../state-facade.js';
import type { AgentIdentity } from '../identity.js';
import { fireHook } from '../../hooks/registry.js';

export const createTaskSchema = {
  title: z.string().describe('Short task title'),
  description: z.string().optional().describe('Detailed task description'),
  depends_on: z.array(z.string()).optional().describe('Task IDs this task depends on'),
};

export function makeCreateTaskHandler(state: StateFacade, identity: AgentIdentity) {
  return async (args: z.infer<z.ZodObject<typeof createTaskSchema>>) => {
    const id = uuidv4();
    const now = Date.now();

    const hookResult = await fireHook('TaskCreated', {
      team: identity.teamName,
      task: { id, title: args.title, description: args.description, created_by: identity.agentName },
    });

    if (!hookResult.allowed) {
      return {
        content: [{ type: 'text' as const, text: `Task creation vetoed by hook: ${hookResult.feedback ?? 'no feedback'}` }],
        isError: true,
      };
    }

    const task = {
      id,
      team_name: identity.teamName,
      title: args.title,
      description: args.description ?? null,
      status: 'pending' as const,
      assigned_to: null,
      claim_lock_owner: null,
      claim_lock_expires: null,
      depends_on: args.depends_on ? JSON.stringify(args.depends_on) : null,
      result: null,
      created_by: identity.agentName,
      created_at: now,
      updated_at: now,
    };

    state.createTask(task);

    return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
  };
}
