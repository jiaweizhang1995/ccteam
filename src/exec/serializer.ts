import type { AgentEvent } from '../providers/types.js';

/** Canonical JSONL event shape emitted by exec mode */
export interface ExecEvent {
  ts: number;
  team: string;
  agent: string;
  kind: ExecEventKind;
  payload: Record<string, unknown>;
}

export type ExecEventKind =
  | 'text_delta'
  | 'tool_call'
  | 'tool_result'
  | 'done'
  | 'error'
  | 'message_sent'
  | 'message_received'
  | 'task_claimed'
  | 'task_completed'
  | 'teammate_spawned'
  | 'teammate_idle'
  | 'teammate_shutdown'
  | 'provider_request'
  | 'provider_response';

const SECRET_PATTERNS = [
  /\b(sk-[A-Za-z0-9_-]{20,})\b/g,
  /\b(anthropic-[A-Za-z0-9_-]{20,})\b/g,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, '[REDACTED]');
  }
  return out;
}

export function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(redactSecrets(JSON.stringify(payload))) as Record<string, unknown>;
}

export function agentEventToExecPayload(e: AgentEvent): Record<string, unknown> {
  return e as unknown as Record<string, unknown>;
}

export function makeExecEvent(
  team: string,
  agent: string,
  kind: ExecEventKind,
  payload: Record<string, unknown>,
): ExecEvent {
  return { ts: Date.now(), team, agent, kind, payload };
}

export function serializeEvent(event: ExecEvent): string {
  return JSON.stringify(event);
}
