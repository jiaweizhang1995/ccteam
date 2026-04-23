import { z } from 'zod';
import type { StateFacade } from '../state-facade.js';
import type { AgentIdentity } from '../identity.js';
import type { Task } from '../../types/index.js';

export const listTasksSchema = {
  filter: z.enum(['pending', 'in_progress', 'completed', 'all']).optional()
    .describe('Filter by status (default: all)'),
};

export function makeListTasksHandler(state: StateFacade, identity: AgentIdentity) {
  return async (args: z.infer<z.ZodObject<typeof listTasksSchema>>) => {
    let tasks: Task[];
    if (args.filter && args.filter !== 'all') {
      tasks = state.listTasksByStatus(identity.teamName, args.filter);
    } else {
      tasks = state.listTasks(identity.teamName);
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
  };
}
