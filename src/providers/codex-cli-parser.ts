import type { AgentEvent } from "./types.js";

/**
 * Parser for `codex exec --json` event stream (codex-cli 0.122.0+).
 *
 * Real output shape (verified against live CLI):
 *   {"type":"thread.started","thread_id":"..."}
 *   {"type":"turn.started"}
 *   {"type":"item.started","item":{"id":"item_1","type":"command_execution",...,"status":"in_progress"}}
 *   {"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"..."}}
 *   {"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"...","aggregated_output":"...","exit_code":0,"status":"completed"}}
 *   {"type":"item.completed","item":{"id":"item_1","type":"file_change","changes":[{"path":"...","kind":"add"}],"status":"completed"}}
 *   {"type":"turn.completed","usage":{"input_tokens":N,"cached_input_tokens":N,"output_tokens":N}}
 *
 * Note: codex does NOT stream text incrementally — agent_message items deliver the
 * full text in a single item.completed event. We emit one text_delta for the whole text.
 */

interface CodexThreadStarted {
  type: "thread.started";
  thread_id: string;
}

interface CodexTurnStarted {
  type: "turn.started";
}

interface CodexItemStarted {
  type: "item.started";
  item: CodexItem;
}

interface CodexItemCompleted {
  type: "item.completed";
  item: CodexItem;
}

interface CodexTurnCompleted {
  type: "turn.completed";
  usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number };
}

interface CodexError {
  type: "error";
  message?: string;
  error?: string;
}

type CodexAgentMessage = {
  id: string;
  type: "agent_message";
  text: string;
};

type CodexCommandExecution = {
  id: string;
  type: "command_execution";
  command: string;
  aggregated_output: string;
  exit_code: number | null;
  status: "in_progress" | "completed";
};

type CodexFileChange = {
  id: string;
  type: "file_change";
  changes: Array<{ path: string; kind: string }>;
  status: "in_progress" | "completed";
};

type CodexItem = CodexAgentMessage | CodexCommandExecution | CodexFileChange | { id: string; type: string };

type CodexRawEvent =
  | CodexThreadStarted
  | CodexTurnStarted
  | CodexItemStarted
  | CodexItemCompleted
  | CodexTurnCompleted
  | CodexError
  | { type: string };

export interface ParseResult {
  events: AgentEvent[];
  stopReason?: string;
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  text: string;
  threadId?: string;
}

export function parseCodexLine(line: string): ParseResult {
  const result: ParseResult = { events: [], toolCalls: [], text: "" };

  if (!line.trim()) return result;

  let raw: CodexRawEvent;
  try {
    raw = JSON.parse(line) as CodexRawEvent;
  } catch {
    return result;
  }

  switch (raw.type) {
    case "thread.started": {
      const e = raw as CodexThreadStarted;
      result.threadId = e.thread_id;
      // Don't emit an AgentEvent — thread_id is orchestrator metadata, not agent output
      break;
    }

    case "turn.started":
    case "item.started":
      // Intermediate progress events — ignore
      break;

    case "item.completed": {
      const e = raw as CodexItemCompleted;
      const item = e.item;

      switch (item.type) {
        case "agent_message": {
          const msg = item as CodexAgentMessage;
          if (msg.text) {
            result.text += msg.text;
            result.events.push({ type: "text_delta", text: msg.text });
          }
          break;
        }

        case "command_execution": {
          const cmd = item as CodexCommandExecution;
          // Map to tool_call / tool_result pair so orchestrators can observe shell actions
          const input: Record<string, unknown> = { command: cmd.command };
          result.toolCalls.push({ id: cmd.id, name: "command_execution", input });
          result.events.push({ type: "tool_call", id: cmd.id, name: "command_execution", input });
          result.events.push({
            type: "tool_result",
            tool_use_id: cmd.id,
            content: cmd.aggregated_output,
            is_error: typeof cmd.exit_code === "number" && cmd.exit_code !== 0,
          });
          break;
        }

        case "file_change": {
          const fc = item as CodexFileChange;
          const input: Record<string, unknown> = { changes: fc.changes };
          result.toolCalls.push({ id: fc.id, name: "file_change", input });
          result.events.push({ type: "tool_call", id: fc.id, name: "file_change", input });
          result.events.push({
            type: "tool_result",
            tool_use_id: fc.id,
            content: fc.changes.map((c) => `${c.kind}: ${c.path}`).join(", "),
            is_error: false,
          });
          break;
        }

        default:
          // Unknown item type — silently ignore
          break;
      }
      break;
    }

    case "turn.completed": {
      const e = raw as CodexTurnCompleted;
      const reason = "stop";
      result.stopReason = reason;
      result.events.push({ type: "done", stop_reason: reason });
      break;
    }

    case "error": {
      const e = raw as CodexError;
      const message = e.message ?? e.error ?? "unknown error";
      result.events.push({ type: "error", message });
      break;
    }

    default:
      // Unknown top-level event type — silently ignore
      break;
  }

  return result;
}
