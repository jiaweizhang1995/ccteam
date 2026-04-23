import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAICompatBackend } from "../../src/providers/openai-compat-sdk.js";
import type { AgentEvent, ChatMessage, ToolSpec } from "../../src/providers/types.js";

vi.mock("openai", () => {
  const streamMock = vi.fn();
  const OpenAI = vi.fn().mockImplementation(() => ({
    beta: { chat: { completions: { stream: streamMock } } },
  }));
  (OpenAI as unknown as { _streamMock: typeof streamMock })._streamMock = streamMock;
  return { default: OpenAI };
});

import OpenAI from "openai";

function makeAsyncIterable(chunks: object[]) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: chunks[i++] };
        },
      };
    },
  };
}

function getStreamMock() {
  return (OpenAI as unknown as { _streamMock: ReturnType<typeof vi.fn> })._streamMock;
}

const TOOL: ToolSpec = {
  name: "search",
  description: "Search the web",
  schema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
};

describe("OpenAICompatBackend", () => {
  let backend: OpenAICompatBackend;

  beforeEach(() => {
    backend = new OpenAICompatBackend("test", {
      apiKey: "sk-test",
      model: "gpt-4o",
      baseUrl: "http://localhost:11434/v1",
    });
  });

  it("has correct id, model, label", () => {
    expect(backend.id).toBe("test");
    expect(backend.model).toBe("gpt-4o");
    expect(backend.label).toContain("OpenAI-compat");
  });

  it("emits text_delta events for streamed content", async () => {
    const chunks = [
      { choices: [{ delta: { content: "Hello" }, finish_reason: null }] },
      { choices: [{ delta: { content: " there" }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ];
    getStreamMock().mockReturnValue(makeAsyncIterable(chunks));

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
    expect(result.text).toBe("Hello there");
    expect(result.stop_reason).toBe("stop");
  });

  it("emits tool_call events for function calls", async () => {
    const chunks = [
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "call_abc",
              function: { name: "search", arguments: '{"query":' },
            }],
          },
          finish_reason: null,
        }],
      },
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: '"cats"}' },
            }],
          },
          finish_reason: null,
        }],
      },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ];
    getStreamMock().mockReturnValue(makeAsyncIterable(chunks));

    const events: AgentEvent[] = [];
    const result = await backend.run({
      systemPrompt: "",
      messages: [{ role: "user", content: "search" }],
      tools: [TOOL],
      signal: AbortSignal.timeout(5000),
      onEvent: (e) => events.push(e),
    });

    const toolEvents = events.filter((e) => e.type === "tool_call");
    expect(toolEvents).toHaveLength(1);
    const tc = toolEvents[0] as Extract<AgentEvent, { type: "tool_call" }>;
    expect(tc.id).toBe("call_abc");
    expect(tc.name).toBe("search");
    expect(tc.input).toEqual({ query: "cats" });
    expect(result.tool_calls).toHaveLength(1);
    expect(result.stop_reason).toBe("tool_calls");
  });

  it("emits done event at end", async () => {
    getStreamMock().mockReturnValue(makeAsyncIterable([
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]));

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

  it("returns error result when stream throws", async () => {
    getStreamMock().mockImplementation(() => {
      throw new Error("Network error");
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
    expect(result.error).toContain("Network error");
  });

  it("calls shutdown without error", async () => {
    await expect(backend.shutdown()).resolves.toBeUndefined();
  });
});
