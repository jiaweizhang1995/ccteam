import type { AgentBackend } from "./types.js";
import { registerBackend, getBackendFactory } from "./registry.js";
import { AnthropicSdkBackend } from "./anthropic-sdk.js";
import { OpenAICompatBackend } from "./openai-compat-sdk.js";
import { ClaudeCliBackend } from "./claude-cli.js";
import { CodexCliBackend } from "./codex-cli.js";
import { getValidAccessToken } from "./oauth/anthropic.js";

export interface ProviderConfig {
  type:
    | "anthropic-sdk"
    | "anthropic-oauth"
    | "openai-compat-sdk"
    | "claude-cli"
    | "codex-cli";
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  mcpConfigPath?: string;
  mcpOverrides?: string[];
  cliBin?: string;
}

function asConfig(cfg: Record<string, unknown>): ProviderConfig {
  return cfg as unknown as ProviderConfig;
}

// Register all built-in backend types
registerBackend("anthropic-sdk", (id, cfg) => {
  const c = asConfig(cfg);
  return new AnthropicSdkBackend(id, {
    apiKey: c.apiKey ?? process.env["ANTHROPIC_API_KEY"],
    model: c.model ?? "claude-opus-4-7",
    maxTokens: c.maxTokens,
  });
});

registerBackend("anthropic-oauth", (id, cfg) => {
  const c = asConfig(cfg);
  // OAuth backend wraps AnthropicSdkBackend but injects auth token lazily
  return new LazyOAuthBackend(id, c.model ?? "claude-opus-4-7", c.maxTokens);
});

registerBackend("openai-compat-sdk", (id, cfg) => {
  const c = asConfig(cfg);
  return new OpenAICompatBackend(id, {
    apiKey: c.apiKey ?? process.env["OPENAI_API_KEY"] ?? "none",
    baseUrl: c.baseUrl ?? process.env["OPENAI_BASE_URL"],
    model: c.model ?? "gpt-4o",
    maxTokens: c.maxTokens,
  });
});

registerBackend("claude-cli", (id, cfg) => {
  const c = asConfig(cfg);
  return new ClaudeCliBackend(id, {
    cliBin: c.cliBin,
    mcpConfigPath: c.mcpConfigPath,
    model: c.model,
  });
});

registerBackend("codex-cli", (id, cfg) => {
  const c = asConfig(cfg);
  return new CodexCliBackend(id, {
    cliBin: c.cliBin,
    mcpOverrides: (c as { mcpOverrides?: string[] }).mcpOverrides,
    model: c.model,
  });
});

export function createBackend(id: string, config: ProviderConfig): AgentBackend {
  const factory = getBackendFactory(config.type);
  if (!factory) {
    throw new Error(`Unknown provider type: ${config.type}`);
  }
  return factory(id, config as unknown as Record<string, unknown>);
}

// OAuth backend that fetches a fresh token before each run
class LazyOAuthBackend implements AgentBackend {
  readonly id: string;
  readonly model: string;
  readonly label: string;
  private maxTokens?: number;

  constructor(id: string, model: string, maxTokens?: number) {
    this.id = id;
    this.model = model;
    this.label = `Claude OAuth (${model})`;
    this.maxTokens = maxTokens;
  }

  async run(
    opts: Parameters<AgentBackend["run"]>[0]
  ): ReturnType<AgentBackend["run"]> {
    const authToken = await getValidAccessToken();
    const inner = new AnthropicSdkBackend(this.id, {
      authToken,
      model: this.model,
      maxTokens: this.maxTokens,
    });
    return inner.run(opts);
  }

  async shutdown(): Promise<void> {}
}
