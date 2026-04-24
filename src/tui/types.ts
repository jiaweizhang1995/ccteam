// Shared types for TUI components — no runtime imports, safe to author before orchestrator lands.

export type AgentStatus = 'spawning' | 'active' | 'idle' | 'shutdown';

export interface PlanResult {
  steps: string[];
  suggestedAgents: number | null;
  rawText: string;
}

export interface PlanState {
  active: boolean;
  text: string;
  parsed: PlanResult | null;
  awaitingConfirm: boolean;
}

/**
 * Multi-turn plan-refinement mode (a.k.a. brainstorm).
 *
 * Semantics:
 * - `active=true` from the moment `/brainstorm <goal>` runs until `/go` or
 *   `/cancel` is invoked.
 * - While active, tools are disabled (planMode on the backend) and normal
 *   user messages in the TUI input are routed to `lead.continueBrainstorm`
 *   instead of the usual `insertMessage` mailbox path.
 * - `latest` always holds the most recent parsed plan returned by the
 *   backend; `/go` reads from here to seed `executeFromPlan`.
 * - `streaming` is true while a plan-mode turn is mid-flight.
 */
export interface BrainstormState {
  active: boolean;
  streaming: boolean;
  latest: PlanResult | null;
}

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
  planState?: PlanState;
  brainstormState?: BrainstormState;
}
