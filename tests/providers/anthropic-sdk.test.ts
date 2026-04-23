import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicSdkBackend } from "../../src/providers/anthropic-sdk.js";
import type { AgentEvent, ChatMessage, ToolSpec } from "../../src/providers/types.js";

// We mock the Anthropic SDK module
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn(),
  };
});

import Anthropic from "@anthropic-ai/sdk";

const TOOL: ToolSpec = {
  name: "calculator",
  description: "Perform calculations",
  schema: {
    type: "object",
    properties: { expr: { type: "string" } },
    required: ["expr"],
  },
};

function makeStreamEvents(rawEvents: object[]) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i >= rawEvents.length) return { done: true, value: undefined };
          return { done: false, value: rawEvents[i++] };
        },
      };
    },
    abort: vi.fn(),
  };
}

describe("AnthropicSdkBackend", () => {
  let mockStream: ReturnType<typeof makeStreamEvents>;
  let mockMessages: { stream: ReturnType<typeof vi.fn> };
  let backend: AnthropicSdkBackend;

  beforeEach(() => {
    mockStream = makeStreamEvents([]);
    mockMessages = { stream: vi.fn().mockReturnValue(mockStream) };
    (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      messages: mockMessages,
    }));
    backend = new AnthropicSdkBackend("test", { apiKey: "key", model: "claude-opus-4-7" });
  });

  it("has correct id, model, label", () => {
    expect(backend.id).toBe("test");
    expect(backend.model).toBe("claude-opus-4-7");
    expect(backend.label).toContain("Claude");
  });

  it("emits text_delta events for text content", async () => {
    mockStream = makeStreamEvents([
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: " world" } },
      { type: "message_delta", delta: { stop_reason: "end_turn" } },
    ]);
    mockMessages.stream.mockReturnValue(mockStream);

    const events: AgentEvent[] = [];
    const messages: ChatMessage[] = [{ role: "user", content: "hi" }];

    const result = await backend.run({
      systemPrompt: "You are helpful",
      messages,
      tools: [],
      signal: AbortSignal.timeout(5000),
      onEvent: (e) => events.push(e),
    });

    const textEvents = events.filter((e) => e.type === "text_delta");
    expect(textEvents).toHaveLength(2);
    expect(result.text).toBe("Hello world");
    expect(result.stop_reason).toBe("end_turn");
  });

  it("emits tool_call event and includes it in result.tool_calls", async () => {
    mockStream = makeStreamEvents([
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "tc_1", name: "calculator" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"expr":' },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '"2+2"}' },
      },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "tool_use" } },
    ]);
    mockMessages.stream.mockReturnValue(mockStream);

    const events: AgentEvent[] = [];
    const result = await backend.run({
      systemPrompt: "",
      messages: [{ role: "user", content: "calculate" }],
      tools: [TOOL],
      signal: AbortSignal.timeout(5000),
      onEvent: (e) => events.push(e),
    });

    const toolEvents = events.filter((e) => e.type === "tool_call");
    expect(toolEvents).toHaveLength(1);
    const tc = toolEvents[0] as Extract<AgentEvent, { type: "tool_call" }>;
    expect(tc.id).toBe("tc_1");
    expect(tc.name).toBe("calculator");
    expect(tc.input).toEqual({ expr: "2+2" });
    expect(result.tool_calls).toHaveLength(1);
    expect(result.stop_reason).toBe("tool_use");
  });

  it("emits done event at end", async () => {
    mockStream = makeStreamEvents([
      { type: "message_delta", delta: { stop_reason: "end_turn" } },
    ]);
    mockMessages.stream.mockReturnValue(mockStream);

    const events: AgentEvent[] = [];
    await backend.run({
      systemPrompt: "",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      signal: AbortSignal.timeout(5000),
      onEvent: (e) => events.push(e),
    });

    expect(events.at(-1)?.type).toBe("done");
  });

  it("emits error event and returns error result on SDK throw", async () => {
    mockMessages.stream.mockImplementation(() => {
      throw new Error("API error");
    });

    const events: AgentEvent[] = [];
    const result = await backend.run({
      systemPrompt: "",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      signal: AbortSignal.timeout(5000),
      onEvent: (e) => events.push(e),
    });

    expect(result.stop_reason).toBe("error");
    expect(result.error).toContain("API error");
    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("calls shutdown without error", async () => {
    await expect(backend.shutdown()).resolves.toBeUndefined();
  });
});
