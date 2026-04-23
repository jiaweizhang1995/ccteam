export type HookEventName = 'TeammateIdle' | 'TaskCreated' | 'TaskCompleted';

export interface TeammateIdlePayload {
  team: string;
  teammate: string;
  last_activity_ts: number;
}

export interface TaskCreatedPayload {
  team: string;
  task: {
    id: string;
    title: string;
    description?: string;
    created_by: string;
  };
}

export interface TaskCompletedPayload {
  team: string;
  task: {
    id: string;
    title: string;
    result?: string;
    assigned_to?: string;
  };
}

export type HookPayload = TeammateIdlePayload | TaskCreatedPayload | TaskCompletedPayload;

export interface HookResult {
  allowed: boolean;
  feedback?: string;
  exitCode: number;
}
