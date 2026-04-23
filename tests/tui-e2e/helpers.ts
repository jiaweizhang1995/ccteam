import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { openDb } from '../../src/state/db.js';
import * as teammates from '../../src/state/teammates.js';
import * as teams from '../../src/state/teams.js';
import * as events from '../../src/state/events.js';
import { StateNotifier } from '../../src/state/notifier.js';
import type { Teammate, Team } from '../../src/types/index.js';

// ─── tmux harness ─────────────────────────────────────────────────────────────

export interface TuiHandle {
  sid: string;
  send: (keys: string) => void;
  sendKeys: (keys: string) => void;
  capture: () => string;
  kill: () => void;
}

export function spawnTui(
  prompt: string,
  team: string,
  opts?: { w?: number; h?: number },
): TuiHandle {
  const sid = `ccteam-test-${Date.now()}`;
  const w = opts?.w ?? 180;
  const h = opts?.h ?? 50;
  const safePrompt = prompt.replace(/'/g, "'\\''");
  const safeTeam = team.replace(/'/g, "'\\''");

  execSync(
    `tmux new-session -d -s ${sid} -x ${w} -y ${h} 'npx tsx src/cli.ts tui ${JSON.stringify(safePrompt)} --team ${safeTeam} 2>/tmp/${sid}.log || true'`,
    { cwd: '/Users/jimmymacmini/Desktop/claude-code-project/ccteam' },
  );

  return {
    sid,
    send: (keys: string) =>
      execSync(`tmux send-keys -t ${sid} '${keys.replace(/'/g, "'\\''")}'`),
    sendKeys: (keys: string) =>
      execSync(`tmux send-keys -t ${sid} ${keys}`),
    capture: () =>
      execSync(`tmux capture-pane -t ${sid} -p`).toString(),
    kill: () => {
      try { execSync(`tmux kill-session -t ${sid} 2>/dev/null`); } catch { /* already dead */ }
    },
  };
}

// ─── Stub state provider ──────────────────────────────────────────────────────

export interface StubState {
  db: Database.Database;
  notifier: StateNotifier;
  teamName: string;
  dbPath: string;
  close: () => void;
}

let stubCounter = 0;

export function createStubState(teamName?: string): StubState {
  const name = teamName ?? `stub-team-${++stubCounter}`;
  const dir = join(tmpdir(), `ccteam-stub-${Date.now()}-${stubCounter}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, 'state.db');

  const db = openDb(dbPath);

  const team: Team = {
    name,
    created_at: Date.now(),
    lead_session_id: 'stub-lead',
    lead_provider: 'stub',
    permission_mode: 'auto',
    working_dir: dir,
    status: 'active',
  };
  teams.createTeam(db, team);

  const notifier = new StateNotifier(db, name);
  notifier.start();

  return {
    db,
    notifier,
    teamName: name,
    dbPath,
    close: () => {
      notifier.stop();
      db.close();
    },
  };
}

// ─── Stub teammate helpers ─────────────────────────────────────────────────────

export function addStubTeammate(
  state: StubState,
  opts: { name: string; status?: Teammate['status']; provider?: string },
): Teammate {
  const tm: Teammate = {
    id: `tm-${opts.name}-${Date.now()}`,
    team_name: state.teamName,
    name: opts.name,
    agent_type: 'subagent',
    provider: opts.provider ?? 'stub',
    model: null,
    system_prompt: null,
    pid: null,
    pane_id: null,
    status: opts.status ?? 'idle',
    tools_allowlist: null,
  };
  teammates.createTeammate(state.db, tm);
  return tm;
}

export function emitStubEvent(
  state: StubState,
  agent: string,
  kind: string,
  payload: Record<string, unknown> = {},
): void {
  events.appendEvent(state.db, {
    team_name: state.teamName,
    agent,
    kind,
    payload: JSON.stringify(payload),
    created_at: Date.now(),
  });
}

// ─── Guard: skip whole suite if not in E2E mode ───────────────────────────────

export function requireE2E(): void {
  if (!process.env.AGENT_TEAMS_TUI_E2E) {
    // Vitest doesn't have `pending()` — throw a skip signal via describe.skip pattern.
    // Tests call this in beforeAll; if not set they just pass as skipped via the
    // outer describe.skipIf guard. This helper is here for manual guard use.
  }
}

export const IS_E2E = Boolean(process.env.AGENT_TEAMS_TUI_E2E);

// ─── Wait helper ─────────────────────────────────────────────────────────────

export async function waitFor(
  condition: () => boolean,
  opts: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const timeout = opts.timeout ?? 5000;
  const interval = opts.interval ?? 100;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}

export async function waitForCapture(
  handle: TuiHandle,
  substring: string,
  opts: { timeout?: number } = {},
): Promise<string> {
  const timeout = opts.timeout ?? 5000;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const frame = handle.capture();
    if (frame.includes(substring)) return frame;
    await new Promise((r) => setTimeout(r, 150));
  }
  const last = handle.capture();
  throw new Error(
    `waitForCapture: "${substring}" not found within ${timeout}ms.\nLast frame:\n${last}`,
  );
}
