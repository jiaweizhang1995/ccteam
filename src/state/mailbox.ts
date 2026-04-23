import type Database from 'better-sqlite3';
import type { Message } from '../types/index.js';

export function insertMessage(
  db: Database.Database,
  msg: Omit<Message, 'id' | 'delivered_at'>
): number {
  const result = db.prepare(`
    INSERT INTO messages (team_name, from_agent, to_agent, kind, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(msg.team_name, msg.from_agent, msg.to_agent ?? null, msg.kind, msg.body, msg.created_at);
  return result.lastInsertRowid as number;
}

export function fetchUndelivered(
  db: Database.Database,
  teamName: string,
  recipientName: string
): Message[] {
  return db.prepare(`
    SELECT m.* FROM messages m
     WHERE m.team_name = ?
       AND (m.to_agent = ? OR m.to_agent IS NULL)
       AND NOT EXISTS (
         SELECT 1 FROM message_deliveries d
          WHERE d.message_id = m.id AND d.recipient_name = ?
       )
     ORDER BY m.created_at ASC
  `).all(teamName, recipientName, recipientName) as Message[];
}

export function markDelivered(db: Database.Database, messageId: number, recipientName: string): void {
  db.prepare(`
    INSERT OR IGNORE INTO message_deliveries (message_id, recipient_name, delivered_at)
    VALUES (?, ?, ?)
  `).run(messageId, recipientName, Date.now());
}

export function markManyDelivered(
  db: Database.Database,
  deliveries: Array<{ messageId: number; recipientName: string }>
): void {
  if (deliveries.length === 0) return;
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO message_deliveries (message_id, recipient_name, delivered_at)
    VALUES (?, ?, ?)
  `);
  const tx = db.transaction((rows: typeof deliveries) => {
    for (const { messageId, recipientName } of rows) stmt.run(messageId, recipientName, now);
  });
  tx(deliveries);
}

export function getMessages(
  db: Database.Database,
  teamName: string,
  filter?: { fromAgent?: string; toAgent?: string; kind?: Message['kind'] }
): Message[] {
  let query = 'SELECT * FROM messages WHERE team_name = ?';
  const params: unknown[] = [teamName];

  if (filter?.fromAgent) { query += ' AND from_agent = ?'; params.push(filter.fromAgent); }
  if (filter?.toAgent) { query += ' AND to_agent = ?'; params.push(filter.toAgent); }
  if (filter?.kind) { query += ' AND kind = ?'; params.push(filter.kind); }

  query += ' ORDER BY created_at ASC';
  return db.prepare(query).all(...params) as Message[];
}

export function broadcast(
  db: Database.Database,
  msg: Omit<Message, 'id' | 'to_agent' | 'delivered_at'>
): number {
  const result = db.prepare(`
    INSERT INTO messages (team_name, from_agent, to_agent, kind, body, created_at)
    VALUES (?, ?, NULL, ?, ?, ?)
  `).run(msg.team_name, msg.from_agent, msg.kind, msg.body, msg.created_at);
  return result.lastInsertRowid as number;
}
