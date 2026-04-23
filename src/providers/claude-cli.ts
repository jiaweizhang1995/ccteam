import { spawn } from "node:child_process";
import type {
  AgentBackend,
  AgentEvent,
  AgentTurnResult,
  ChatMessage,
  ToolSpec,
} from "./types.js";

export interface ClaudeCliConfig {
  cliBin?: string; // default: "claude"
  mcpConfigPath?: string;
  model?: string;
}

// Shape of the single JSON object emitted by `claude -p --output-format json`
interface ClaudeJsonResult {
  type: "result";
  subtype: "success" | "error";
  result: string;
  stop_reason?: string;
  is_error: boolean;
  duration_ms?: number;
}

export class ClaudeCliBackend implements AgentBackend {
  readonly id: string;
  readonly label: string;
  readonly model: string;

  private cliBin: string;
  private mcpConfigPath?: string;

  constructor(id: string, config: ClaudeCliConfig = {}) {
    this.id = id;
    this.cliBin = config.cliBin ?? "claude";
    this.model = config.model ?? "claude-opus-4-7";
    this.label = `claude-cli (${this.model})`;
    this.mcpConfigPath = config.mcpConfigPath;
  }

  async run(opts: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolSpec[];
    signal: AbortSignal;
    onEvent(e: AgentEvent): void;
  }): Promise<AgentTurnResult> {
    const { systemPrompt, messages, signal, onEvent } = opts;

    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const prompt = lastUserMsg
      ? typeof lastUserMsg.content === "string"
        ? lastUserMsg.content
        : lastUserMsg.content
            .filter((c) => c.type === "text")
            .map((c) => (c.type === "text" ? c.text : ""))
            .join("")
      : "";

    // `claude -p` uses --output-format json (single-shot result).
    // stream-json requires --verbose which floods output with hook/system events.
    const args = ["-p", prompt, "--output-format", "json"];
    if (systemPrompt) args.push("--system-prompt", systemPrompt);
    if (this.model) args.push("--model", this.model);
    if (this.mcpConfigPath) args.push("--mcp-config", this.mcpConfigPath);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.cliBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      signal.addEventListener("abort", () => proc.kill("SIGTERM"));

      let stdout = "";
      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });

      proc.on("close", (code) => {
        if (signal.aborted) {
          onEvent({ type: "done", stop_reason: "abort" });
          resolve({ stop_reason: "abort", text: "", tool_calls: [] });
          return;
        }

        let parsed: ClaudeJsonResult | null = null;
        try {
          parsed = JSON.parse(stdout.trim()) as ClaudeJsonResult;
        } catch {
          // stdout wasn't valid JSON (e.g. startup error)
        }

        if (parsed && !parsed.is_error && parsed.subtype === "success") {
          const text = parsed.result;
          const stopReason = parsed.stop_reason ?? "end_turn";
          onEvent({ type: "text_delta", text });
          onEvent({ type: "done", stop_reason: stopReason });
          resolve({ stop_reason: stopReason, text, tool_calls: [] });
        } else {
          const errMsg = parsed?.result ?? `claude CLI exited with code ${code}`;
          onEvent({ type: "error", message: errMsg });
          onEvent({ type: "done", stop_reason: "error" });
          resolve({ stop_reason: "error", text: "", tool_calls: [], error: errMsg });
        }
      });

      proc.on("error", reject);
    });
  }

  async shutdown(): Promise<void> {}
}
