/**
 * Interface the MCP server uses to talk to the state layer.
 * Implemented by StateAdapter which wraps the real State class.
 * Kept minimal so tests can use a simple stub.
 */
import type { Teammate, Task, Message } from '../types/index.js';

export type { Teammate as TeammateRow, Task as TaskRow, Message as MessageRow };

export interface StateFacade {
  // Teammates
  listTeammates(teamName: string): Teammate[];
  getTeammateByName(teamName: string, name: string): Teammate | undefined;
  listActiveTeammates(teamName: string): Teammate[];

  // Tasks
  listTasks(teamName: string): Task[];
  listTasksByStatus(teamName: string, status: Task['status']): Task[];
  getTask(id: string): Task | undefined;
  createTask(task: Task): void;
  claimTask(taskId: string, teamName: string, claimerName: string): Promise<boolean>;
  completeTask(taskId: string, result: string): void;

  // Mailbox
  insertMessage(msg: Omit<Message, 'id' | 'delivered_at'>): number;
  getMessages(teamName: string, filter?: { fromAgent?: string; toAgent?: string; kind?: Message['kind'] }): Message[];
}
