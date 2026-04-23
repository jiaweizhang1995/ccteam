import { EventEmitter } from 'node:events';
import type Database from 'better-sqlite3';
import type { NotifierEvent, Message, Task, Event } from '../types/index.js';

const POLL_INTERVAL_MS = 250;

export class StateNotifier extends EventEmitter {
  private db: Database.Database;
  private teamName: string;
  private timer: NodeJS.Timeout | null = null;
  private lastMessageId: number = 0;
  private lastTaskUpdatedAt: number = 0;
  private lastEventId: number = 0;

  constructor(db: Database.Database, teamName: string) {
    super();
    this.db = db;
    this.teamName = teamName;
    this.initCursors();
  }

  private initCursors(): void {
    const lastMsg = this.db.prepare(
      'SELECT MAX(id) as id FROM messages WHERE team_name = ?'
    ).get(this.teamName) as { id: number | null };
    this.lastMessageId = lastMsg?.id ?? 0;

    const lastTask = this.db.prepare(
      'SELECT MAX(updated_at) as ts FROM tasks WHERE team_name = ?'
    ).get(this.teamName) as { ts: number | null };
    this.lastTaskUpdatedAt = lastTask?.ts ?? 0;

    const lastEvent = this.db.prepare(
      'SELECT MAX(id) as id FROM events WHERE team_name = ?'
    ).get(this.teamName) as { id: number | null };
    this.lastEventId = lastEvent?.id ?? 0;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    // Allow process to exit even if notifier is running
    if (this.timer.unref) this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private poll(): void {
    try {
      this.pollMessages();
      this.pollTasks();
      this.pollEvents();
    } catch {
      // Ignore transient DB errors during poll
    }
  }

  private pollMessages(): void {
    const newMessages = this.db.prepare(`
      SELECT * FROM messages WHERE team_name = ? AND id > ? ORDER BY id ASC
    `).all(this.teamName, this.lastMessageId) as Message[];

    for (const msg of newMessages) {
      this.lastMessageId = msg.id;
      this.emit('message', { type: 'message', message: msg } satisfies NotifierEvent);
    }
  }

  private pollTasks(): void {
    const updatedTasks = this.db.prepare(`
      SELECT * FROM tasks WHERE team_name = ? AND updated_at > ? ORDER BY updated_at ASC
    `).all(this.teamName, this.lastTaskUpdatedAt) as Task[];

    for (const task of updatedTasks) {
      if (task.updated_at > this.lastTaskUpdatedAt) {
        this.lastTaskUpdatedAt = task.updated_at;
      }
      this.emit('task_updated', { type: 'task_updated', task } satisfies NotifierEvent);
    }
  }

  private pollEvents(): void {
    const newEvents = this.db.prepare(`
      SELECT * FROM events WHERE team_name = ? AND id > ? ORDER BY id ASC
    `).all(this.teamName, this.lastEventId) as Event[];

    for (const event of newEvents) {
      this.lastEventId = event.id;
      this.emit('event_appended', { type: 'event_appended', event } satisfies NotifierEvent);
    }
  }

  on(event: 'message', listener: (e: Extract<NotifierEvent, { type: 'message' }>) => void): this;
  on(event: 'task_updated', listener: (e: Extract<NotifierEvent, { type: 'task_updated' }>) => void): this;
  on(event: 'event_appended', listener: (e: Extract<NotifierEvent, { type: 'event_appended' }>) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (e: any) => void): this {
    return super.on(event, listener);
  }
}
