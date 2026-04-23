import type Database from 'better-sqlite3';
import { openDb } from './db.js';
import * as teams from './teams.js';
import * as teammates from './teammates.js';
import * as tasks from './tasks.js';
import * as mailbox from './mailbox.js';
import * as events from './events.js';
import { StateNotifier } from './notifier.js';
import type { Team, Teammate, Task, Message, Event } from '../types/index.js';

export { getDb, openDb, closeDb, getDbPath } from './db.js';
export * from './teams.js';
export * from './teammates.js';
export * from './tasks.js';
export * from './mailbox.js';
export * from './events.js';
export { StateNotifier } from './notifier.js';
export type { Team, Teammate, Task, Message, Event, NotifierEvent } from '../types/index.js';

export class State {
  readonly db: Database.Database;
  private _notifier: StateNotifier | null = null;

  constructor(dbPath: string) {
    this.db = openDb(dbPath);
  }

  get notifier(): StateNotifier {
    if (!this._notifier) throw new Error('Notifier not started — call state.startNotifier(teamName) first');
    return this._notifier;
  }

  startNotifier(teamName: string): StateNotifier {
    if (this._notifier) this._notifier.stop();
    this._notifier = new StateNotifier(this.db, teamName);
    this._notifier.start();
    return this._notifier;
  }

  stopNotifier(): void {
    this._notifier?.stop();
    this._notifier = null;
  }

  close(): void {
    this.stopNotifier();
    this.db.close();
  }

  // Teams
  createTeam(team: Team) { return teams.createTeam(this.db, team); }
  getTeam(name: string) { return teams.getTeam(this.db, name); }
  listTeams() { return teams.listTeams(this.db); }
  updateTeamStatus(name: string, status: Team['status']) { return teams.updateTeamStatus(this.db, name, status); }
  deleteTeam(name: string) { return teams.deleteTeam(this.db, name); }

  // Teammates
  createTeammate(teammate: Teammate) { return teammates.createTeammate(this.db, teammate); }
  getTeammate(id: string) { return teammates.getTeammate(this.db, id); }
  getTeammateByName(teamName: string, name: string) { return teammates.getTeammateByName(this.db, teamName, name); }
  listTeammates(teamName: string) { return teammates.listTeammates(this.db, teamName); }
  listActiveTeammates(teamName: string) { return teammates.listActiveTeammates(this.db, teamName); }
  updateTeammateStatus(id: string, status: Teammate['status']) { return teammates.updateTeammateStatus(this.db, id, status); }
  updateTeammatePid(id: string, pid: number) { return teammates.updateTeammatePid(this.db, id, pid); }
  updateTeammatePaneId(id: string, paneId: string) { return teammates.updateTeammatePaneId(this.db, id, paneId); }
  deleteTeammate(id: string) { return teammates.deleteTeammate(this.db, id); }

  // Tasks
  createTask(task: Task) { return tasks.createTask(this.db, task); }
  getTask(id: string) { return tasks.getTask(this.db, id); }
  listTasks(teamName: string) { return tasks.listTasks(this.db, teamName); }
  listPendingTasks(teamName: string) { return tasks.listPendingTasks(this.db, teamName); }
  getUnblockedPendingTasks(teamName: string) { return tasks.getUnblockedPendingTasks(this.db, teamName); }
  updateTask(id: string, updates: Partial<Pick<Task, 'status' | 'assigned_to' | 'result' | 'updated_at'>>) { return tasks.updateTask(this.db, id, updates); }
  claimTask(taskId: string, teamName: string, claimerName: string) { return tasks.claimTask(this.db, taskId, teamName, claimerName); }
  completeTask(taskId: string, result?: string) { return tasks.completeTask(this.db, taskId, result); }

  // Mailbox
  insertMessage(msg: Omit<Message, 'id' | 'delivered_at'>) { return mailbox.insertMessage(this.db, msg); }
  fetchUndelivered(teamName: string, recipientName: string) { return mailbox.fetchUndelivered(this.db, teamName, recipientName); }
  markDelivered(messageId: number, recipientName: string) { return mailbox.markDelivered(this.db, messageId, recipientName); }
  markManyDelivered(deliveries: Array<{ messageId: number; recipientName: string }>) { return mailbox.markManyDelivered(this.db, deliveries); }
  getMessages(teamName: string, filter?: { fromAgent?: string; toAgent?: string; kind?: Message['kind'] }) { return mailbox.getMessages(this.db, teamName, filter); }
  broadcast(msg: Omit<Message, 'id' | 'to_agent' | 'delivered_at'>) { return mailbox.broadcast(this.db, msg); }

  // Events
  appendEvent(event: Omit<Event, 'id'>) { return events.appendEvent(this.db, event); }
  getEventsFromOffset(teamName: string, fromId: number) { return events.getEventsFromOffset(this.db, teamName, fromId); }
  getRecentEvents(teamName: string, limit?: number) { return events.getRecentEvents(this.db, teamName, limit); }
  getEventsByAgent(teamName: string, agent: string, fromId?: number) { return events.getEventsByAgent(this.db, teamName, agent, fromId); }
}
