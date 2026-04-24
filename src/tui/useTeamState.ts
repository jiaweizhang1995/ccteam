import { useState, useEffect, useCallback } from 'react';
import type { StateNotifier } from '../state/notifier.js';
import type { Task, Teammate } from '../types/index.js';
import type { AppState, DisplayEvent, TeammateState, TaskItem, FocusTarget } from './types.js';

function taskItemFromRow(t: Task): TaskItem {
  let blockedBy: string[] = [];
  if (t.depends_on) {
    try { blockedBy = JSON.parse(t.depends_on); } catch { /* ignore */ }
  }
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    assignedTo: t.assigned_to,
    blockedBy,
  };
}

function teammateStateFromRow(tm: Teammate): TeammateState {
  return {
    id: tm.id,
    name: tm.name,
    provider: tm.provider,
    status: tm.status,
    currentTaskId: null,
    recentEvents: [],
  };
}

/**
 * `message_received` payloads wrap the actual body in a JSON string so we
 * can parse out the `text` field for a readable preview. If the body isn't
 * valid JSON or doesn't have a text field, fall back to the raw string.
 */
function extractMessageText(raw: unknown): string {
  const s = String(raw ?? '');
  if (!s) return '';
  if (s.startsWith('{')) {
    try {
      const obj = JSON.parse(s) as { text?: string; plan?: string; body?: string };
      return obj.text ?? obj.plan ?? obj.body ?? s;
    } catch {
      return s;
    }
  }
  return s;
}

function eventText(kind: string, payload: Record<string, unknown>): string {
  switch (kind) {
    case 'text_delta': return String(payload.text ?? payload.delta ?? '');
    case 'tool_call': return `[tool] ${payload.name}`;
    case 'tool_result': return `[result] ${String(payload.content ?? '').slice(0, 80)}`;
    case 'message_received': {
      const preview = extractMessageText(payload.body).slice(0, 200);
      return preview
        ? `[←${payload.from}] ${preview}`
        : `[←${payload.from}]`;
    }
    case 'message_sent': {
      // Prefer the `text` body preview if send_message wrote one into the
      // event payload (recent ccteam versions do this — see mcp-server/
      // tools/send_message.ts). Older events only have `to`.
      const preview = String(payload.text ?? '').slice(0, 200);
      return preview
        ? `[→${payload.to}] ${preview}`
        : `[→${payload.to}]`;
    }
    case 'task_created': return `[created] ${payload.title ?? payload.taskId}`;
    case 'task_claimed': return `[claimed] ${payload.title ?? payload.taskId}`;
    case 'task_completed': return `[completed] ${payload.title ?? payload.taskId}`;
    case 'plan_submitted': return '[plan submitted]';
    case 'plan_decided': return `[plan ${payload.decision}] ${payload.teammate ?? ''}`.trim();
    case 'teammate_spawned': return `[spawned] ${payload.name}`;
    case 'error': return `[error] ${payload.message}`;
    case 'done': return '[done]';
    default: return `[${kind}]`;
  }
}

function appendEvent(
  events: DisplayEvent[],
  id: string,
  kind: string,
  payload: Record<string, unknown>,
  maxLines = 200,
): DisplayEvent[] {
  const text = eventText(kind, payload);
  if (!text) return events;
  const next = [...events, { id, kind, text, ts: Date.now() }];
  return next.length > maxLines ? next.slice(next.length - maxLines) : next;
}

export interface UseTeamStateOpts {
  teamName: string;
  initialTeammates: Teammate[];
  initialTasks: Task[];
  notifier: StateNotifier;
}

let globalEventId = 0;

export function useTeamState({
  teamName,
  initialTeammates,
  initialTasks,
  notifier,
}: UseTeamStateOpts) {
  const [appState, setAppState] = useState<AppState>(() => ({
    teamName,
    leadEvents: [],
    teammates: initialTeammates.map(teammateStateFromRow),
    tasks: initialTasks.map(taskItemFromRow),
    focus: 'lead' as FocusTarget,
    showTaskList: false,
    inputValue: '',
  }));

  // Called by TeamLead.onEvent — immediate streaming before DB write.
  // Namespaces the id with `s-` (stream) so it cannot collide with ids
  // minted from the notifier path (`e-<dbRowId>`).
  const onLeadEvent = useCallback((agent: string, kind: string, payload: Record<string, unknown>) => {
    const id = `s-${++globalEventId}`;
    setAppState((s) => {
      if (agent === 'lead') {
        return { ...s, leadEvents: appendEvent(s.leadEvents, id, kind, payload) };
      }
      // Teammate event arriving via onEvent (before notifier poll picks it up)
      return {
        ...s,
        teammates: s.teammates.map((tm) =>
          tm.name === agent
            ? { ...tm, recentEvents: appendEvent(tm.recentEvents, id, kind, payload) }
            : tm,
        ),
      };
    });
  }, []);

  // Wire notifier events
  useEffect(() => {
    const onTaskUpdated = (e: { type: 'task_updated'; task: Task }) => {
      const item = taskItemFromRow(e.task);
      setAppState((s) => {
        const exists = s.tasks.some((t) => t.id === item.id);
        const tasks = exists
          ? s.tasks.map((t) => (t.id === item.id ? item : t))
          : [...s.tasks, item];
        // Reflect task assignment as teammate's currentTaskId
        const teammates = s.teammates.map((tm) => ({
          ...tm,
          currentTaskId:
            e.task.assigned_to === tm.name && e.task.status === 'in_progress'
              ? e.task.id
              : tm.currentTaskId === e.task.id && e.task.status !== 'in_progress'
              ? null
              : tm.currentTaskId,
        }));
        return { ...s, tasks, teammates };
      });
    };

    const onEventAppended = (e: { type: 'event_appended'; event: { id: number; agent: string; kind: string; payload: string } }) => {
      const { id: dbId, agent, kind } = e.event;
      // Namespace DB-sourced ids with `e-` so they can't collide with
      // the stream path's `s-N` ids. Previously both paths used bare
      // numeric ids and collided at low values (e.g. both emit id=1 on
      // the same tick → React key-conflict warning).
      const id = `e-${dbId}`;
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(e.event.payload) as Record<string, unknown>; } catch { /* ignore */ }

      setAppState((s) => {
        if (agent === 'lead') {
          return { ...s, leadEvents: appendEvent(s.leadEvents, id, kind, payload) };
        }

        // On teammate_spawned, add to roster if not present
        if (kind === 'teammate_spawned' && typeof payload.name === 'string') {
          const exists = s.teammates.some((tm) => tm.name === payload.name);
          if (!exists) {
            const newTm: TeammateState = {
              id: String(payload.id ?? payload.name),
              name: payload.name,
              provider: String(payload.provider ?? 'unknown'),
              status: 'spawning',
              currentTaskId: null,
              recentEvents: [],
            };
            return { ...s, teammates: [...s.teammates, newTm] };
          }
        }

        // On teammate_shutdown, update status
        if (kind === 'teammate_shutdown' && typeof payload.name === 'string') {
          return {
            ...s,
            teammates: s.teammates.map((tm) =>
              tm.name === payload.name ? { ...tm, status: 'shutdown' as const } : tm,
            ),
          };
        }

        // On teammate_idle, update status
        if (kind === 'teammate_idle' && typeof payload.name === 'string') {
          return {
            ...s,
            teammates: s.teammates.map((tm) =>
              tm.name === payload.name ? { ...tm, status: 'idle' as const } : tm,
            ),
          };
        }

        // Append event to the correct teammate pane
        return {
          ...s,
          teammates: s.teammates.map((tm) =>
            tm.name === agent
              ? {
                  ...tm,
                  status: kind === 'done' ? 'idle' as const : tm.status === 'spawning' ? 'active' as const : tm.status,
                  recentEvents: appendEvent(tm.recentEvents, id, kind, payload),
                }
              : tm,
          ),
        };
      });
    };

    notifier.on('task_updated', onTaskUpdated);
    notifier.on('event_appended', onEventAppended as Parameters<typeof notifier.on>[1]);

    return () => {
      notifier.off('task_updated', onTaskUpdated);
      notifier.off('event_appended', onEventAppended as Parameters<typeof notifier.on>[1]);
    };
  }, [notifier]);

  const setFocus = useCallback((focus: FocusTarget) => {
    setAppState((s) => ({ ...s, focus }));
  }, []);

  const toggleTaskList = useCallback(() => {
    setAppState((s) => ({ ...s, showTaskList: !s.showTaskList }));
  }, []);

  const setInputValue = useCallback((inputValue: string) => {
    setAppState((s) => ({ ...s, inputValue }));
  }, []);

  return { appState, setFocus, toggleTaskList, setInputValue, onLeadEvent };
}
