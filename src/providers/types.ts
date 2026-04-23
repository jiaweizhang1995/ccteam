export type ChatRole = "user" | "assistant" | "system";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type MessageContent = TextContent | ToolUseContent | ToolResultContent;

export interface ChatMessage {
  role: ChatRole;
  content: string | MessageContent[];
}

export interface ToolSpec {
  name: string;
  description: string;
  schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// AgentEvent union — streamed via onEvent callback
export interface TextDeltaEvent {
  type: "text_delta";
  text: string;
}

export interface ToolCallEvent {
  type: "tool_call";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultEvent {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

export interface DoneEvent {
  type: "done";
  stop_reason: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type AgentEvent =
  | TextDeltaEvent
  | ToolCallEvent
  | ToolResultEvent
  | DoneEvent
  | ErrorEvent;

export interface AgentTurnResult {
  stop_reason: string;
  text: string;
  tool_calls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  error?: string;
}

export interface AgentBackend {
  readonly id: string;
  readonly label: string;
  readonly model: string;

  run(opts: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolSpec[];
    signal: AbortSignal;
    onEvent(e: AgentEvent): void;
  }): Promise<AgentTurnResult>;

  shutdown(): Promise<void>;
}
