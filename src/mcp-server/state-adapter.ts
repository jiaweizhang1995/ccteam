/**
 * Adapts the State class to the StateFacade interface used by MCP tools.
 */
import type { StateFacade } from './state-facade.js';
import type { Teammate, Task, Message } from '../types/index.js';
import type { State } from '../state/index.js';

export class StateAdapter implements StateFacade {
  constructor(private readonly state: State, private readonly teamName: string) {}

  listTeammates(_teamName: string): Teammate[] {
    return this.state.listTeammates(this.teamName);
  }

  getTeammateByName(_teamName: string, name: string): Teammate | undefined {
    return this.state.getTeammateByName(this.teamName, name);
  }

  listActiveTeammates(_teamName: string): Teammate[] {
    return this.state.listActiveTeammates(this.teamName);
  }

  listTasks(_teamName: string): Task[] {
    return this.state.listTasks(this.teamName);
  }

  listTasksByStatus(_teamName: string, status: Task['status']): Task[] {
    return this.state.listTasks(this.teamName).filter((t) => t.status === status);
  }

  getTask(id: string): Task | undefined {
    return this.state.getTask(id);
  }

  createTask(task: Task): void {
    this.state.createTask(task);
  }

  claimTask(taskId: string, teamName: string, claimerName: string): Promise<boolean> {
    return this.state.claimTask(taskId, teamName, claimerName);
  }

  completeTask(taskId: string, result: string): void {
    this.state.completeTask(taskId, result);
  }

  insertMessage(msg: Omit<Message, 'id' | 'delivered_at'>): number {
    return this.state.insertMessage(msg);
  }

  getMessages(teamName: string, filter?: { fromAgent?: string; toAgent?: string; kind?: Message['kind'] }): Message[] {
    return this.state.getMessages(teamName, filter);
  }
}
