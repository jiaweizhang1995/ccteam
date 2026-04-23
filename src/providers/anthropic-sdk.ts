import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentBackend,
  AgentEvent,
  AgentTurnResult,
  ChatMessage,
  ToolSpec,
} from "./types.js";
import { toolSpecsToAnthropic } from "./tools.js";
import { PLAN_MODE_SYSTEM_SUFFIX } from "./plan-mode.js";

export interface AnthropicSdkConfig {
  apiKey?: string;
  authToken?: string; // for OAuth
  model: string;
  maxTokens?: number;
}

export class AnthropicSdkBackend implements AgentBackend {
  readonly id: string;
  readonly label: string;
  readonly model: string;

  private client: Anthropic;
  private maxTokens: number;

  constructor(id: string, config: AnthropicSdkConfig) {
    this.id = id;
    this.model = config.model;
    this.label = `Claude (${config.model})`;
    this.maxTokens = config.maxTokens ?? 8192;

    const clientOpts: ConstructorParameters<typeof Anthropic>[0] = {};
    if (config.authToken) {
      clientOpts.authToken = config.authToken;
    } else if (config.apiKey) {
      clientOpts.apiKey = config.apiKey;
    }
    this.client = new Anthropic(clientOpts);
  }

  async run(opts: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolSpec[];
    signal: AbortSignal;
    onEvent(e: AgentEvent): void;
    planMode?: boolean;
  }): Promise<AgentTurnResult> {
    const { systemPrompt, messages, tools, signal, onEvent, planMode } = opts;
    const effectiveTools = planMode ? [] : tools;
    const effectiveSystem = planMode
      ? systemPrompt + PLAN_MODE_SYSTEM_SUFFIX
      : systemPrompt;
    const anthropicTools = toolSpecsToAnthropic(effectiveTools);

    let resultText = "";
    let stopReason = "end_turn";
    const toolCalls: AgentTurnResult["tool_calls"] = [];

    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: effectiveSystem,
        messages: messages as Anthropic.MessageParam[],
        tools: anthropicTools as Anthropic.Tool[],
      });

      // Handle abort
      signal.addEventListener("abort", () => {
        stream.abort();
      });

      // Keyed by block index so parallel tool_use blocks don't overwrite each other
      const pendingByIndex = new Map<number, { id: string; name: string; inputJson: string }>();

      for await (const event of stream) {
        if (signal.aborted) break;

        if (event.type === "content_block_start") {
          if (event.content_block.type === "tool_use") {
            pendingByIndex.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              inputJson: "",
            });
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            resultText += delta.text;
            onEvent({ type: "text_delta", text: delta.text });
          } else if (delta.type === "input_json_delta") {
            const tc = pendingByIndex.get(event.index);
            if (tc) tc.inputJson += delta.partial_json;
          }
        } else if (event.type === "content_block_stop") {
          const tc = pendingByIndex.get(event.index);
          if (tc) {
            let parsedInput: Record<string, unknown> = {};
            try {
              parsedInput = JSON.parse(tc.inputJson) as Record<string, unknown>;
            } catch {
              // empty input
            }
            toolCalls.push({ id: tc.id, name: tc.name, input: parsedInput });
            onEvent({ type: "tool_call", id: tc.id, name: tc.name, input: parsedInput });
            pendingByIndex.delete(event.index);
          }
        } else if (event.type === "message_delta") {
          if (event.delta.stop_reason) {
            stopReason = event.delta.stop_reason;
          }
        }
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
    // SDK client has no persistent connections to close
  }
}
