import type Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import lockfile from 'proper-lockfile';
import type { Task } from '../types/index.js';

const LOCK_STALE_MS = 10_000;
const LOCK_RETRY_RETRIES = 3;
const LOCK_RETRY_MINWAIT = 100;

function getLockDir(teamName: string): string {
  const dir = join(homedir(), '.agent-teams', 'teams', teamName);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getLockFile(teamName: string, taskId: string): string {
  const dir = getLockDir(teamName);
  const lockFilePath = join(dir, `task-${taskId}.lock`);
  // proper-lockfile requires the file to exist
  if (!existsSync(lockFilePath)) writeFileSync(lockFilePath, '');
  return lockFilePath;
}

export function createTask(db: Database.Database, task: Task): void {
  db.prepare(`
    INSERT INTO tasks (id, team_name, title, description, status, assigned_to, claim_lock_owner, claim_lock_expires, depends_on, result, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id, task.team_name, task.title, task.description, task.status,
    task.assigned_to, task.claim_lock_owner, task.claim_lock_expires,
    task.depends_on, task.result, task.created_by, task.created_at, task.updated_at
  );
}

export function getTask(db: Database.Database, id: string): Task | undefined {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
}

export function listTasks(db: Database.Database, teamName: string): Task[] {
  return db.prepare('SELECT * FROM tasks WHERE team_name = ? ORDER BY created_at ASC').all(teamName) as Task[];
}

export function listPendingTasks(db: Database.Database, teamName: string): Task[] {
  return db.prepare(`
    SELECT * FROM tasks WHERE team_name = ? AND status = 'pending' ORDER BY created_at ASC
  `).all(teamName) as Task[];
}

export function updateTask(db: Database.Database, id: string, updates: Partial<Pick<Task, 'status' | 'assigned_to' | 'result' | 'updated_at'>>): void {
  const now = Date.now();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.assigned_to !== undefined) { fields.push('assigned_to = ?'); values.push(updates.assigned_to); }
  if (updates.result !== undefined) { fields.push('result = ?'); values.push(updates.result); }
  fields.push('updated_at = ?');
  values.push(updates.updated_at ?? now);
  values.push(id);

  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export async function claimTask(
  db: Database.Database,
  taskId: string,
  teamName: string,
  claimerName: string
): Promise<boolean> {
  const lockFilePath = getLockFile(teamName, taskId);

  let release: (() => Promise<void>) | null = null;
  try {
    release = await lockfile.lock(lockFilePath, {
      stale: LOCK_STALE_MS,
      retries: { retries: LOCK_RETRY_RETRIES, minTimeout: LOCK_RETRY_MINWAIT },
    });

    const task = getTask(db, taskId);
    if (!task || task.status !== 'pending') return false;

    // Check all dependencies are completed
    if (task.depends_on) {
      const deps: string[] = JSON.parse(task.depends_on);
      for (const depId of deps) {
        const dep = getTask(db, depId);
        if (!dep || dep.status !== 'completed') return false;
      }
    }

    const now = Date.now();
    db.prepare(`
      UPDATE tasks
      SET status = 'in_progress', assigned_to = ?, claim_lock_owner = ?, claim_lock_expires = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(claimerName, claimerName, now + LOCK_STALE_MS, now, taskId);

    const updated = getTask(db, taskId);
    return updated?.assigned_to === claimerName;
  } catch {
    return false;
  } finally {
    if (release) await release();
  }
}

export function completeTask(db: Database.Database, taskId: string, result?: string): void {
  const now = Date.now();
  db.prepare(`
    UPDATE tasks SET status = 'completed', result = ?, updated_at = ? WHERE id = ?
  `).run(result ?? null, now, taskId);
}

export function getUnblockedPendingTasks(db: Database.Database, teamName: string): Task[] {
  const tasks = listPendingTasks(db, teamName);
  return tasks.filter(task => {
    if (!task.depends_on) return true;
    const deps: string[] = JSON.parse(task.depends_on);
    return deps.every(depId => {
      const dep = getTask(db, depId);
      return dep?.status === 'completed';
    });
  });
}
