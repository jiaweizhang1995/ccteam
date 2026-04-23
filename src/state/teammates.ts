import type Database from 'better-sqlite3';
import type { Teammate } from '../types/index.js';

export function createTeammate(db: Database.Database, teammate: Teammate): void {
  db.prepare(`
    INSERT INTO teammates (id, team_name, name, agent_type, provider, model, system_prompt, pid, pane_id, status, tools_allowlist)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    teammate.id, teammate.team_name, teammate.name, teammate.agent_type,
    teammate.provider, teammate.model, teammate.system_prompt, teammate.pid,
    teammate.pane_id, teammate.status, teammate.tools_allowlist
  );
}

export function getTeammate(db: Database.Database, id: string): Teammate | undefined {
  return db.prepare('SELECT * FROM teammates WHERE id = ?').get(id) as Teammate | undefined;
}

export function getTeammateByName(db: Database.Database, teamName: string, name: string): Teammate | undefined {
  return db.prepare('SELECT * FROM teammates WHERE team_name = ? AND name = ?').get(teamName, name) as Teammate | undefined;
}

export function listTeammates(db: Database.Database, teamName: string): Teammate[] {
  return db.prepare('SELECT * FROM teammates WHERE team_name = ?').all(teamName) as Teammate[];
}

export function listActiveTeammates(db: Database.Database, teamName: string): Teammate[] {
  return db.prepare(`
    SELECT * FROM teammates WHERE team_name = ? AND status NOT IN ('shutdown')
  `).all(teamName) as Teammate[];
}

export function updateTeammateStatus(db: Database.Database, id: string, status: Teammate['status']): void {
  db.prepare('UPDATE teammates SET status = ? WHERE id = ?').run(status, id);
}

export function updateTeammatePid(db: Database.Database, id: string, pid: number): void {
  db.prepare('UPDATE teammates SET pid = ? WHERE id = ?').run(pid, id);
}

export function updateTeammatePaneId(db: Database.Database, id: string, paneId: string): void {
  db.prepare('UPDATE teammates SET pane_id = ? WHERE id = ?').run(paneId, id);
}

export function deleteTeammate(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM teammates WHERE id = ?').run(id);
}
