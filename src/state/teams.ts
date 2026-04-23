import type Database from 'better-sqlite3';
import type { Team } from '../types/index.js';

export function createTeam(db: Database.Database, team: Team): void {
  db.prepare(`
    INSERT INTO teams (name, created_at, lead_session_id, lead_provider, permission_mode, working_dir, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(team.name, team.created_at, team.lead_session_id, team.lead_provider, team.permission_mode, team.working_dir, team.status);
}

export function getTeam(db: Database.Database, name: string): Team | undefined {
  return db.prepare('SELECT * FROM teams WHERE name = ?').get(name) as Team | undefined;
}

export function listTeams(db: Database.Database): Team[] {
  return db.prepare('SELECT * FROM teams ORDER BY created_at DESC').all() as Team[];
}

export function updateTeamStatus(db: Database.Database, name: string, status: Team['status']): void {
  db.prepare('UPDATE teams SET status = ? WHERE name = ?').run(status, name);
}

export function deleteTeam(db: Database.Database, name: string): void {
  db.prepare('DELETE FROM teams WHERE name = ?').run(name);
}
