export interface Team {
  name: string;
  created_at: number;
  lead_session_id: string;
  lead_provider: string;
  permission_mode: string;
  working_dir: string;
  status: 'active' | 'cleaned';
}

export interface Teammate {
  id: string;
  team_name: string;
  name: string;
  agent_type: string | null;
  provider: string;
  model: string | null;
  system_prompt: string | null;
  pid: number | null;
  pane_id: string | null;
  status: 'spawning' | 'active' | 'idle' | 'shutdown';
  tools_allowlist: string | null;
}

export interface Task {
  id: string;
  team_name: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  assigned_to: string | null;
  claim_lock_owner: string | null;
  claim_lock_expires: number | null;
  depends_on: string | null;
  result: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: number;
  team_name: string;
  from_agent: string;
  to_agent: string | null;
  kind: 'message' | 'plan_request' | 'plan_decision' | 'shutdown_request' | 'idle_notify' | 'spawn_request' | 'spawn_response';
  body: string;
  created_at: number;
  delivered_at: number | null;
}

export interface Event {
  id: number;
  team_name: string;
  agent: string;
  kind: string;
  payload: string;
  created_at: number;
}

export type NotifierEvent =
  | { type: 'message'; message: Message }
  | { type: 'task_updated'; task: Task }
  | { type: 'event_appended'; event: Event };
