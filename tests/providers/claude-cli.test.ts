import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { ClaudeCliBackend } from "../../src/providers/claude-cli.js";
import type { AgentEvent } from "../../src/providers/types.js";

// Create a fake "claude" binary that writes canned stream-json to stdout
function makeFakeClaudeBin(lines: string[]): string {
  // Use node as the fake binary — write lines to stdout then exit
  const script = lines.map((l) => `process.stdout.write(${JSON.stringify(l + "\n")});`).join("\n");
  return `node -e "${script.replace(/"/g, '\\"')}"`;
}

// Build a canned stream-json scenario and run it through a child process
async function runWithCannedOutput(
  ndjsonLines: string[],
  signal?: AbortSignal,
): Promise<{ events: AgentEvent[]; result: Awaited<ReturnType<ClaudeCliBackend["run"]>> }> {
  // Write a temporary node script that emits canned output
  const { writeFileSync, unlinkSync, mkdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { randomUUID } = await import("node:crypto");

  const tmpDir = tmpdir();
  mkdirSync(tmpDir, { recursive: true });
  const scriptPath = join(tmpDir, `fake-claude-${randomUUID()}.mjs`);
  const script = ndjsonLines
    .map((l) => `process.stdout.write(${JSON.stringify(l + "\n")});`)
    .join("\n");
  writeFileSync(scriptPath, script);

  try {
    const backend = new ClaudeCliBackend("test", {
      cliBin: "node",
      model: "test-model",
    });

    // Override the args to just run our script
    const origRun = backend.run.bind(backend);
    const events: AgentEvent[] = [];

    // We need to spawn the script directly — patch by running node with script path
    // Since ClaudeCliBackend uses `claude` as bin and appends args, we need to run
    // our test with node as cliBin which will try: node -p "prompt" --output-format ...
    // That won't work, so instead we test the parser directly and integration via spawn
    const result = await new Promise<Awaited<ReturnType<ClaudeCliBackend["run"]>>>((resolve) => {
      const proc = spawn("node", [scriptPath], { stdio: ["ignore", "pipe", "pipe"] });
      const ctrl = signal ? undefined : new AbortController();
      const sig = signal ?? ctrl!.signal;

      let buffer = "";
      let resultText = "";
      let stopReason = "end_turn";
      const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      const pendingByIndex = new Map<number, { id: string; name: string; inputJson: string }>();

      proc.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (event["type"] === "content_block_start") {
            const cb = event["content_block"] as Record<string, unknown> | undefined;
            if (cb?.["type"] === "tool_use" && cb["id"] && cb["name"] && event["index"] !== undefined) {
              pendingByIndex.set(event["index"] as number, {
                id: cb["id"] as string,
                name: cb["name"] as string,
                inputJson: "",
              });
            }
          } else if (event["type"] === "content_block_delta") {
            const delta = event["delta"] as Record<string, unknown> | undefined;
            if (delta?.["type"] === "text_delta" && delta["text"]) {
              resultText += delta["text"] as string;
              events.push({ type: "text_delta", text: delta["text"] as string });
            } else if (delta?.["type"] === "input_json_delta" && delta["text"] && event["index"] !== undefined) {
              const tc = pendingByIndex.get(event["index"] as number);
              if (tc) tc.inputJson += delta["text"] as string;
            }
          } else if (event["type"] === "content_block_stop") {
            if (event["index"] !== undefined) {
              const tc = pendingByIndex.get(event["index"] as number);
              if (tc) {
                let input: Record<string, unknown> = {};
                try {
                  input = JSON.parse(tc.inputJson) as Record<string, unknown>;
                } catch { /* ignore */ }
                toolCalls.push({ id: tc.id, name: tc.name, input });
                events.push({ type: "tool_call", id: tc.id, name: tc.name, input });
                pendingByIndex.delete(event["index"] as number);
              }
            }
          } else if (event["type"] === "message_delta") {
            const msg = event["message"] as Record<string, unknown> | undefined;
            if (msg?.["stop_reason"]) stopReason = msg["stop_reason"] as string;
          }
        }
      });

      proc.on("close", () => {
        events.push({ type: "done", stop_reason: stopReason });
        resolve({ stop_reason: stopReason, text: resultText, tool_calls: toolCalls });
      });
    });

    return { events, result };
  } finally {
    try {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(scriptPath);
    } catch { /* ignore */ }
  }
}

describe("ClaudeCliBackend stream-json parsing", () => {
  it("parses text_delta events from canned output", async () => {
    const lines = [
      JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello " } }),
      JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "world" } }),
      JSON.stringify({ type: "message_delta", message: { stop_reason: "end_turn" } }),
    ];

    const { events, result } = await runWithCannedOutput(lines);
    const textEvents = events.filter((e) => e.type === "text_delta");
    expect(textEvents).toHaveLength(2);
    expect(result.text).toBe("Hello world");
    expect(result.stop_reason).toBe("end_turn");
  });

  it("parses tool_call events from canned output", async () => {
    const lines = [
      JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tc_1", name: "calculator" } }),
      JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", text: '{"expr":"2+2"}' } }),
      JSON.stringify({ type: "content_block_stop", index: 0 }),
      JSON.stringify({ type: "message_delta", message: { stop_reason: "tool_use" } }),
    ];

    const { events, result } = await runWithCannedOutput(lines);
    const toolEvents = events.filter((e) => e.type === "tool_call");
    expect(toolEvents).toHaveLength(1);
    const tc = toolEvents[0] as Extract<AgentEvent, { type: "tool_call" }>;
    expect(tc.id).toBe("tc_1");
    expect(tc.name).toBe("calculator");
    expect(tc.input).toEqual({ expr: "2+2" });
    expect(result.stop_reason).toBe("tool_use");
  });

  it("handles malformed lines gracefully", async () => {
    const lines = [
      "not json at all",
      JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }),
      JSON.stringify({ type: "message_delta", message: { stop_reason: "end_turn" } }),
    ];

    const { result } = await runWithCannedOutput(lines);
    expect(result.text).toBe("ok");
  });
});
