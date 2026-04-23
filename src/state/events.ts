import type Database from 'better-sqlite3';
import type { Event } from '../types/index.js';

export function appendEvent(
  db: Database.Database,
  event: Omit<Event, 'id'>
): number {
  const result = db.prepare(`
    INSERT INTO events (team_name, agent, kind, payload, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(event.team_name, event.agent, event.kind, event.payload, event.created_at);
  return result.lastInsertRowid as number;
}

export function getEventsFromOffset(
  db: Database.Database,
  teamName: string,
  fromId: number
): Event[] {
  return db.prepare(`
    SELECT * FROM events WHERE team_name = ? AND id > ? ORDER BY id ASC
  `).all(teamName, fromId) as Event[];
}

export function getRecentEvents(
  db: Database.Database,
  teamName: string,
  limit: number = 100
): Event[] {
  return db.prepare(`
    SELECT * FROM events WHERE team_name = ? ORDER BY id DESC LIMIT ?
  `).all(teamName, limit) as Event[];
}

export function getEventsByAgent(
  db: Database.Database,
  teamName: string,
  agent: string,
  fromId: number = 0
): Event[] {
  return db.prepare(`
    SELECT * FROM events WHERE team_name = ? AND agent = ? AND id > ? ORDER BY id ASC
  `).all(teamName, agent, fromId) as Event[];
}
