// Shared types for TUI components — no runtime imports, safe to author before orchestrator lands.

export type AgentStatus = 'spawning' | 'active' | 'idle' | 'shutdown';

export interface TeammateState {
  id: string;
  name: string;
  provider: string;
  status: AgentStatus;
  currentTaskId: string | null;
  recentEvents: DisplayEvent[];
}

export interface TaskItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  assignedTo: string | null;
  blockedBy: string[];
}

export interface DisplayEvent {
  id: number;
  kind: string;
  text: string;
  ts: number;
}

export type FocusTarget = 'lead' | number; // number = teammate index

export interface AppState {
  teamName: string;
  leadEvents: DisplayEvent[];
  teammates: TeammateState[];
  tasks: TaskItem[];
  focus: FocusTarget;
  showTaskList: boolean;
  inputValue: string;
}
