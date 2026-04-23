import { describe, it, expect } from "vitest";
import { parseCodexLine } from "../../src/providers/codex-cli-parser.js";
import type { AgentEvent } from "../../src/providers/types.js";

// All fixtures use real event shapes from codex-cli 0.122.0 (verified live)

describe("parseCodexLine — real codex exec --json format", () => {
  it("returns empty result for blank lines", () => {
    const empty = { events: [], toolCalls: [], text: "", stopReason: undefined, threadId: undefined };
    expect(parseCodexLine("")).toEqual(empty);
    expect(parseCodexLine("   ")).toEqual(empty);
  });

  it("returns empty result for invalid JSON", () => {
    const result = parseCodexLine("not json");
    expect(result.events).toHaveLength(0);
    expect(result.toolCalls).toHaveLength(0);
  });

  it("ignores thread.started but captures threadId", () => {
    const result = parseCodexLine(JSON.stringify({
      type: "thread.started",
      thread_id: "019dbadb-bed0-7b13-b179-27fc49efd8d4",
    }));
    expect(result.events).toHaveLength(0);
    expect(result.threadId).toBe("019dbadb-bed0-7b13-b179-27fc49efd8d4");
  });

  it("ignores turn.started", () => {
    const result = parseCodexLine(JSON.stringify({ type: "turn.started" }));
    expect(result.events).toHaveLength(0);
  });

  it("ignores item.started (in-progress intermediate)", () => {
    const result = parseCodexLine(JSON.stringify({
      type: "item.started",
      item: { id: "item_1", type: "command_execution", command: "echo hi", aggregated_output: "", exit_code: null, status: "in_progress" },
    }));
    expect(result.events).toHaveLength(0);
  });

  it("parses item.completed agent_message → text_delta", () => {
    // Real shape from: codex exec --json "respond with just OK"
    const result = parseCodexLine(JSON.stringify({
      type: "item.completed",
      item: { id: "item_0", type: "agent_message", text: "OK" },
    }));
    expect(result.text).toBe("OK");
    expect(result.events).toContainEqual({ type: "text_delta", text: "OK" });
    expect(result.toolCalls).toHaveLength(0);
  });

  it("parses item.completed command_execution → tool_call + tool_result", () => {
    // Real shape from: codex exec --json "use bash to echo hi"
    const result = parseCodexLine(JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_1",
        type: "command_execution",
        command: "/bin/zsh -lc 'echo hello_tool_test'",
        aggregated_output: "hello_tool_test\n",
        exit_code: 0,
        status: "completed",
      },
    }));
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toEqual({
      id: "item_1",
      name: "command_execution",
      input: { command: "/bin/zsh -lc 'echo hello_tool_test'" },
    });
    const tcEvent = result.events.find((e) => e.type === "tool_call") as Extract<AgentEvent, { type: "tool_call" }> | undefined;
    expect(tcEvent?.name).toBe("command_execution");
    expect(tcEvent?.input).toEqual({ command: "/bin/zsh -lc 'echo hello_tool_test'" });
    const trEvent = result.events.find((e) => e.type === "tool_result") as Extract<AgentEvent, { type: "tool_result" }> | undefined;
    expect(trEvent?.tool_use_id).toBe("item_1");
    expect(trEvent?.content).toBe("hello_tool_test\n");
    expect(trEvent?.is_error).toBe(false);
  });

  it("marks command_execution tool_result as error when exit_code != 0", () => {
    const result = parseCodexLine(JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_2",
        type: "command_execution",
        command: "/bin/bash -c 'exit 1'",
        aggregated_output: "error output",
        exit_code: 1,
        status: "completed",
      },
    }));
    const trEvent = result.events.find((e) => e.type === "tool_result") as Extract<AgentEvent, { type: "tool_result" }> | undefined;
    expect(trEvent?.is_error).toBe(true);
  });

  it("parses item.completed file_change → tool_call + tool_result", () => {
    // Real shape from: codex exec --json "write a python file /tmp/test.py"
    const result = parseCodexLine(JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_1",
        type: "file_change",
        changes: [{ path: "/tmp/test_codex_probe.py", kind: "add" }],
        status: "completed",
      },
    }));
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.name).toBe("file_change");
    expect(result.toolCalls[0]?.input).toEqual({ changes: [{ path: "/tmp/test_codex_probe.py", kind: "add" }] });
    const trEvent = result.events.find((e) => e.type === "tool_result") as Extract<AgentEvent, { type: "tool_result" }> | undefined;
    expect(trEvent?.content).toBe("add: /tmp/test_codex_probe.py");
    expect(trEvent?.is_error).toBe(false);
  });

  it("parses turn.completed → done with stop_reason=stop", () => {
    // Real shape from end of any codex exec --json run
    const result = parseCodexLine(JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 25122, cached_input_tokens: 3456, output_tokens: 23 },
    }));
    expect(result.stopReason).toBe("stop");
    const doneEvent = result.events.find((e) => e.type === "done") as Extract<AgentEvent, { type: "done" }> | undefined;
    expect(doneEvent?.stop_reason).toBe("stop");
  });

  it("parses error event", () => {
    const result = parseCodexLine(JSON.stringify({ type: "error", message: "something went wrong" }));
    const errEvent = result.events[0] as Extract<AgentEvent, { type: "error" }> | undefined;
    expect(errEvent?.type).toBe("error");
    expect(errEvent?.message).toBe("something went wrong");
  });

  it("ignores unknown item types in item.completed", () => {
    const result = parseCodexLine(JSON.stringify({
      type: "item.completed",
      item: { id: "item_x", type: "future_unknown_item_type" },
    }));
    expect(result.events).toHaveLength(0);
  });

  it("ignores unknown top-level event types", () => {
    const result = parseCodexLine(JSON.stringify({ type: "session.heartbeat", ts: 12345 }));
    expect(result.events).toHaveLength(0);
  });

  describe("full turn sequence integration", () => {
    it("parses a simple text-only turn correctly", () => {
      // Mirrors real output of: codex exec --json "respond with just OK, nothing else"
      const lines = [
        '{"type":"thread.started","thread_id":"019dbadb-bed0-7b13-b179-27fc49efd8d4"}',
        '{"type":"turn.started"}',
        '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"OK"}}',
        '{"type":"turn.completed","usage":{"input_tokens":25124,"cached_input_tokens":3456,"output_tokens":30}}',
      ];

      let text = "";
      let stopReason: string | undefined;
      const allEvents: AgentEvent[] = [];

      for (const line of lines) {
        const r = parseCodexLine(line);
        text += r.text;
        if (r.stopReason) stopReason = r.stopReason;
        allEvents.push(...r.events);
      }

      expect(text).toBe("OK");
      expect(stopReason).toBe("stop");
      expect(allEvents.some((e) => e.type === "text_delta")).toBe(true);
      expect(allEvents.at(-1)?.type).toBe("done");
    });

    it("parses a tool-use turn (command_execution) correctly", () => {
      // Mirrors real output of: codex exec --json "use bash to run: echo hello_tool_test"
      const lines = [
        '{"type":"thread.started","thread_id":"019dbadd-f814-7610-bed9-df2f93e49f03"}',
        '{"type":"turn.started"}',
        '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Running echo."}}',
        '{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"/bin/zsh -lc \'echo hello_tool_test\'","aggregated_output":"","exit_code":null,"status":"in_progress"}}',
        '{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"/bin/zsh -lc \'echo hello_tool_test\'","aggregated_output":"hello_tool_test\\n","exit_code":0,"status":"completed"}}',
        '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"Output: hello_tool_test"}}',
        '{"type":"turn.completed","usage":{"input_tokens":50417,"cached_input_tokens":28544,"output_tokens":137}}',
      ];

      let text = "";
      let stopReason: string | undefined;
      const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      const allEvents: AgentEvent[] = [];

      for (const line of lines) {
        const r = parseCodexLine(line);
        text += r.text;
        toolCalls.push(...r.toolCalls);
        if (r.stopReason) stopReason = r.stopReason;
        allEvents.push(...r.events);
      }

      expect(text).toBe("Running echo.Output: hello_tool_test");
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]?.name).toBe("command_execution");
      expect(stopReason).toBe("stop");
      expect(allEvents.some((e) => e.type === "tool_call")).toBe(true);
      expect(allEvents.some((e) => e.type === "tool_result")).toBe(true);
      expect(allEvents.at(-1)?.type).toBe("done");
    });

    it("parses a file_change turn correctly", () => {
      // Mirrors real output of: codex exec --json "write a python file /tmp/test_codex_probe.py"
      const lines = [
        '{"type":"thread.started","thread_id":"019dbadf-48ce-7bb3-9859-030e53f6ff2d"}',
        '{"type":"turn.started"}',
        '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Creating the file."}}',
        '{"type":"item.started","item":{"id":"item_1","type":"file_change","changes":[{"path":"/tmp/test_codex_probe.py","kind":"add"}],"status":"in_progress"}}',
        '{"type":"item.completed","item":{"id":"item_1","type":"file_change","changes":[{"path":"/tmp/test_codex_probe.py","kind":"add"}],"status":"completed"}}',
        '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"File written."}}',
        '{"type":"turn.completed","usage":{"input_tokens":75932,"cached_input_tokens":52992,"output_tokens":276}}',
      ];

      let text = "";
      const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      const allEvents: AgentEvent[] = [];

      for (const line of lines) {
        const r = parseCodexLine(line);
        text += r.text;
        toolCalls.push(...r.toolCalls);
        allEvents.push(...r.events);
      }

      expect(text).toBe("Creating the file.File written.");
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]?.name).toBe("file_change");
      expect(allEvents.at(-1)?.type).toBe("done");
    });
  });
});
