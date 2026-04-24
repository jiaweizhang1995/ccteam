import { spawn } from "node:child_process";
import type {
  AgentBackend,
  AgentEvent,
  AgentTurnResult,
  ChatMessage,
  ToolSpec,
} from "./types.js";
import { parseCodexLine } from "./codex-cli-parser.js";
import { PLAN_MODE_SYSTEM_SUFFIX, BRAINSTORM_MODE_SYSTEM_SUFFIX } from "./plan-mode.js";

export interface CodexCliConfig {
  cliBin?: string; // default: "codex"
  /** @deprecated codex does not accept a full mcp-config file via CLI flag. Use mcpOverrides. */
  mcpConfigPath?: string;
  /** Extra args passed to codex, e.g. `-c mcp_servers.agent_teams.command=...` pairs. */
  mcpOverrides?: string[];
  model?: string;
}

export class CodexCliBackend implements AgentBackend {
  readonly id: string;
  readonly label: string;
  readonly model: string;

  private cliBin: string;
  private mcpOverrides: string[];

  constructor(id: string, config: CodexCliConfig = {}) {
    this.id = id;
    this.cliBin = config.cliBin ?? "codex";
    // No default model — codex uses whatever model is configured in ~/.codex/config.toml.
    // Explicit model required for accounts that can't access the default upstream model.
    this.model = config.model ?? "";
    this.label = config.model ? `codex-cli (${config.model})` : "codex-cli";
    this.mcpOverrides = config.mcpOverrides ?? [];
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
    const { systemPrompt, messages, signal, onEvent, planMode, brainstormMode } = opts;

    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const prompt = lastUserMsg
      ? typeof lastUserMsg.content === "string"
        ? lastUserMsg.content
        : lastUserMsg.content
            .filter((c) => c.type === "text")
            .map((c) => (c.type === "text" ? c.text : ""))
            .join("")
      : "";

    // brainstormMode needs tool access for read-only investigation, so we
    // keep the sandbox bypass. planMode (strict "no tools at all") explicitly
    // drops it.
    const args = ["exec", "--json", "--skip-git-repo-check"];
    if (!planMode || brainstormMode) {
      // --dangerously-bypass-approvals-and-sandbox equivalent of the `codex --yolo` shell
      // alias — required so codex's tool layer doesn't silently cancel MCP calls when
      // spawned as a subprocess (no TTY, no interactive approval path).
      args.push("--dangerously-bypass-approvals-and-sandbox");
    }
    if (planMode || brainstormMode) {
      args.push("-c", 'model_reasoning_effort="high"');
    }

    // brainstormMode wins over planMode if both are set (see types.ts).
    const effectiveSystem = brainstormMode
      ? (systemPrompt ? systemPrompt + BRAINSTORM_MODE_SYSTEM_SUFFIX : BRAINSTORM_MODE_SYSTEM_SUFFIX.trimStart())
      : planMode
        ? (systemPrompt ? systemPrompt + PLAN_MODE_SYSTEM_SUFFIX : PLAN_MODE_SYSTEM_SUFFIX.trimStart())
        : systemPrompt;

    // codex has no --instructions flag; system prompt is appended to the user prompt
    // via a clearly-delimited block so the model can distinguish it
    const fullPrompt = effectiveSystem
      ? `${prompt}\n\n<system>\n${effectiveSystem}\n</system>`
      : prompt;
    // MCP overrides first (before positional prompt) so codex sees them as flags.
    args.splice(args.length, 0, ...this.mcpOverrides);
    if (this.model) args.push("-m", this.model);
    args.push(fullPrompt);

    let resultText = "";
    let stopReason = "stop";
    const toolCalls: AgentTurnResult["tool_calls"] = [];
    let hasError = false;
    let errorMsg: string | undefined;
    // threadId available for future session resumption via `codex exec resume`
    let _threadId: string | undefined;
    let sawDone = false;

    return new Promise((resolve, reject) => {
      const proc = spawn(this.cliBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      signal.addEventListener("abort", () => proc.kill("SIGTERM"));

      let buffer = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const result = parseCodexLine(line);

          resultText += result.text;
          toolCalls.push(...result.toolCalls);

          for (const event of result.events) {
            onEvent(event);
            if (event.type === "error") {
              hasError = true;
              errorMsg = event.message;
            }
            if (event.type === "done") sawDone = true;
          }

          if (result.stopReason) stopReason = result.stopReason;
          if (result.threadId) _threadId = result.threadId;
        }
      });

      proc.on("close", (code) => {
        if (signal.aborted) stopReason = "abort";
        // Only emit done here if parser didn't already (protects against early process exit
        // without a turn.completed event).
        if (!sawDone) onEvent({ type: "done", stop_reason: stopReason });
        resolve({
          stop_reason: hasError ? "error" : stopReason,
          text: resultText,
          tool_calls: toolCalls,
          ...(hasError
            ? { error: errorMsg }
            : code !== 0 && !signal.aborted
              ? { error: `codex CLI exited with code ${code}` }
              : {}),
        });
      });

      proc.on("error", reject);
    });
  }

  async shutdown(): Promise<void> {}
}
