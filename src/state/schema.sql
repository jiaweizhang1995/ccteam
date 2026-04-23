CREATE TABLE IF NOT EXISTS teams (
  name TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  lead_session_id TEXT NOT NULL,
  lead_provider TEXT NOT NULL,
  permission_mode TEXT NOT NULL,
  working_dir TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teammates (
  id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL REFERENCES teams(name),
  name TEXT NOT NULL,
  agent_type TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  system_prompt TEXT,
  pid INTEGER,
  pane_id TEXT,
  status TEXT NOT NULL,
  tools_allowlist TEXT,
  UNIQUE(team_name, name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL REFERENCES teams(name),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  assigned_to TEXT,
  claim_lock_owner TEXT,
  claim_lock_expires INTEGER,
  depends_on TEXT,
  result TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_name TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_name TEXT NOT NULL,
  agent TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Per-recipient delivery tracking; replaces the delivered_at column on messages
-- for correct broadcast fan-out semantics (to_agent=NULL rows visible to each
-- recipient independently until they insert their own delivery record).
CREATE TABLE IF NOT EXISTS message_deliveries (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  delivered_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, recipient_name)
);

CREATE INDEX IF NOT EXISTS idx_deliveries_recipient ON message_deliveries(recipient_name, message_id);
