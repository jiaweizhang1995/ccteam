import OpenAI from "openai";
import type {
  AgentBackend,
  AgentEvent,
  AgentTurnResult,
  ChatMessage,
  ToolSpec,
} from "./types.js";
import { toolSpecsToOpenAI } from "./tools.js";
import { PLAN_MODE_SYSTEM_SUFFIX, BRAINSTORM_MODE_SYSTEM_SUFFIX } from "./plan-mode.js";

export interface OpenAICompatConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
}

function chatMessageToOpenAI(
  msg: ChatMessage
): OpenAI.Chat.ChatCompletionMessageParam {
  const role = msg.role as "user" | "assistant" | "system";
  if (typeof msg.content === "string") {
    return { role, content: msg.content } as OpenAI.Chat.ChatCompletionMessageParam;
  }

  // Handle structured content: flatten tool results into separate tool messages
  // and text/tool_use into assistant messages with tool_calls
  if (role === "assistant") {
    const textParts: string[] = [];
    const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];

    for (const part of msg.content) {
      if (part.type === "text") {
        textParts.push(part.text);
      } else if (part.type === "tool_use") {
        toolCalls.push({
          id: part.id,
          type: "function",
          function: {
            name: part.name,
            arguments: JSON.stringify(part.input),
          },
        });
      }
    }

    const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
      role: "assistant",
      content: textParts.join("") || null,
    };
    if (toolCalls.length > 0) {
      assistantMsg.tool_calls = toolCalls;
    }
    return assistantMsg;
  }

  // For user messages with structured content, look for tool_result parts
  const parts = msg.content;
  const toolResults = parts.filter((p) => p.type === "tool_result");
  if (toolResults.length > 0) {
    // Return the first tool result as a tool message (caller should split multi-result)
    const first = toolResults[0];
    if (first && first.type === "tool_result") {
      return {
        role: "tool",
        tool_call_id: first.tool_use_id,
        content: first.content,
      } as OpenAI.Chat.ChatCompletionToolMessageParam;
    }
  }

  // Flatten to text
  const text = parts
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
  return { role, content: text } as OpenAI.Chat.ChatCompletionMessageParam;
}

function expandMessages(
  messages: ChatMessage[]
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  for (const msg of messages) {
    if (
      msg.role === "user" &&
      Array.isArray(msg.content) &&
      msg.content.some((p) => p.type === "tool_result")
    ) {
      // Expand tool results into individual tool messages
      for (const part of msg.content) {
        if (part.type === "tool_result") {
          result.push({
            role: "tool",
            tool_call_id: part.tool_use_id,
            content: part.content,
          } as OpenAI.Chat.ChatCompletionToolMessageParam);
        }
      }
    } else {
      result.push(chatMessageToOpenAI(msg));
    }
  }

  return result;
}

export class OpenAICompatBackend implements AgentBackend {
  readonly id: string;
  readonly label: string;
  readonly model: string;

  private client: OpenAI;
  private maxTokens: number;

  constructor(id: string, config: OpenAICompatConfig) {
    this.id = id;
    this.model = config.model;
    this.label = `OpenAI-compat (${config.model})`;
    this.maxTokens = config.maxTokens ?? 8192;

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async run(opts: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolSpec[];
    signal: AbortSignal;
    onEvent(e: AgentEvent): void;
    planMode?: boolean;
    brainstormMode?: boolean;
  }): Promise<AgentTurnResult> {
    const { systemPrompt, messages, tools, signal, onEvent, planMode, brainstormMode } = opts;
    // SDK providers have no read-only tool filtering yet — both modes drop
    // tools entirely. CLI-subprocess backends (codex-cli, claude-cli) are
    // where brainstorm actually gets useful research capabilities.
    const effectiveTools = (planMode || brainstormMode) ? [] : tools;
    const effectiveSystem = brainstormMode
      ? systemPrompt + BRAINSTORM_MODE_SYSTEM_SUFFIX
      : planMode
        ? systemPrompt + PLAN_MODE_SYSTEM_SUFFIX
        : systemPrompt;
    const openaiTools = toolSpecsToOpenAI(effectiveTools);

    let resultText = "";
    let stopReason = "stop";
    const toolCalls: AgentTurnResult["tool_calls"] = [];

    const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: effectiveSystem },
      ...expandMessages(messages),
    ];

    try {
      const stream = this.client.beta.chat.completions.stream(
        {
          model: this.model,
          max_tokens: this.maxTokens,
          messages: apiMessages,
          tools: openaiTools as OpenAI.Chat.ChatCompletionTool[],
          stream: true,
        },
        { signal }
      );

      // Accumulate tool call fragments indexed by tool call index
      const pendingToolCalls = new Map<
        number,
        { id: string; name: string; argumentsJson: string }
      >();

      for await (const chunk of stream) {
        if (signal.aborted) break;

        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        if (delta.content) {
          resultText += delta.content;
          onEvent({ type: "text_delta", text: delta.content });
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!pendingToolCalls.has(idx)) {
              pendingToolCalls.set(idx, { id: tc.id ?? "", name: tc.function?.name ?? "", argumentsJson: "" });
            }
            const pending = pendingToolCalls.get(idx)!;
            if (tc.id) pending.id = tc.id;
            if (tc.function?.name) pending.name = tc.function.name;
            if (tc.function?.arguments) pending.argumentsJson += tc.function.arguments;
          }
        }

        if (choice.finish_reason) {
          stopReason = choice.finish_reason;
        }
      }

      // Emit completed tool calls
      for (const [, tc] of pendingToolCalls) {
        let parsedInput: Record<string, unknown> = {};
        try {
          parsedInput = JSON.parse(tc.argumentsJson) as Record<string, unknown>;
        } catch {
          // malformed JSON — leave empty
        }
        toolCalls.push({ id: tc.id, name: tc.name, input: parsedInput });
        onEvent({ type: "tool_call", id: tc.id, name: tc.name, input: parsedInput });
      }
    } catch (err: unknown) {
      if (signal.aborted) {
        stopReason = "abort";
      } else {
        const message = err instanceof Error ? err.message : String(err);
        onEvent({ type: "error", message });
        return {
          stop_reason: "error",
          text: resultText,
          tool_calls: toolCalls,
          error: message,
        };
      }
    }

    onEvent({ type: "done", stop_reason: stopReason });
    return { stop_reason: stopReason, text: resultText, tool_calls: toolCalls };
  }

  async shutdown(): Promise<void> {
    // OpenAI SDK client — no persistent connections
  }
}
