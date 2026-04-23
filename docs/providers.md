# Provider Setup

agent-teams supports five provider types. Mix and match per role — the team lead and each teammate can use different providers.

---

## Provider types

| Type | Auth | Best for |
|------|------|----------|
| `anthropic-oauth` | Browser PKCE flow | Claude.ai users, no API key needed |
| `anthropic-sdk` | `ANTHROPIC_API_KEY` | API key users, deterministic billing |
| `openai-compat-sdk` | `OPENAI_API_KEY` + optional `OPENAI_BASE_URL` | OpenAI, Groq, Together, Ollama, Codex, vLLM, any OAI-compat endpoint |
| `claude-cli` | Inherits from `claude` binary | Subprocess wrap — uses your existing `claude` install |
| `codex-cli` | Inherits from `codex` binary | Subprocess wrap — uses your existing `codex` install |

---

## anthropic-oauth

No API key needed. The first login opens a browser for the Anthropic OAuth PKCE flow. Tokens are stored at `~/.agent-teams/auth/claude.json` (0600 perms) and auto-refreshed before expiry.

```jsonc
{
  "providers": {
    "claude-oauth": { "type": "anthropic-oauth" }
  }
}
```

Login:

```bash
agent-teams auth login claude
```

Logout:

```bash
agent-teams auth logout claude
```

---

## anthropic-sdk

Uses `@anthropic-ai/sdk` with a static API key. Supports all Claude models.

```jsonc
{
  "providers": {
    "claude-api": {
      "type": "anthropic-sdk",
      "model": "claude-opus-4-7"
    }
  }
}
```

Set the key in your environment:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or reference it in the config:

```jsonc
{ "apiKey": "$ANTHROPIC_API_KEY" }
```

**Supported models:** any model available via the Anthropic API — `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`, etc.

---

## openai-compat-sdk

Uses the `openai` npm SDK. Works with any OpenAI-compatible endpoint.

```jsonc
{
  "providers": {
    "openai-gpt5": {
      "type": "openai-compat-sdk",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "$OPENAI_API_KEY",
      "model": "gpt-5"
    }
  }
}
```

### Tested endpoints

**OpenAI (default)**

```jsonc
{ "type": "openai-compat-sdk", "baseUrl": "https://api.openai.com/v1", "apiKey": "$OPENAI_API_KEY", "model": "gpt-5" }
```

**Groq**

```jsonc
{ "type": "openai-compat-sdk", "baseUrl": "https://api.groq.com/openai/v1", "apiKey": "$GROQ_API_KEY", "model": "llama-3.3-70b-versatile" }
```

**Together AI**

```jsonc
{ "type": "openai-compat-sdk", "baseUrl": "https://api.together.xyz/v1", "apiKey": "$TOGETHER_API_KEY", "model": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo" }
```

**Ollama (local)**

```jsonc
{ "type": "openai-compat-sdk", "baseUrl": "http://localhost:11434/v1", "apiKey": "ollama", "model": "qwen2.5-coder:32b" }
```

Start Ollama first: `ollama serve` and pull the model: `ollama pull qwen2.5-coder:32b`.

**Codex API (local)**

```jsonc
{ "type": "openai-compat-sdk", "baseUrl": "http://localhost:1455/v1", "apiKey": "none", "model": "gpt-oss-codex" }
```

**vLLM**

```jsonc
{ "type": "openai-compat-sdk", "baseUrl": "http://localhost:8000/v1", "apiKey": "none", "model": "your-model-id" }
```

---

## claude-cli

Wraps the `claude` binary as a subprocess. Parses `claude -p "..." --output-format=stream-json`. The teammate inherits whatever auth `claude` is already configured with — useful if you have Claude Code installed.

```jsonc
{
  "providers": {
    "claude-cli": { "type": "claude-cli" }
  }
}
```

Requires `claude` on `$PATH`. Verify: `claude --version`.

The teammate's MCP config is injected at spawn time so team tools are available via `--mcp-config`.

---

## codex-cli

Wraps the `codex` binary as a subprocess. Parses `codex exec --json "..."`. Inherits whatever auth `codex` is configured with.

```jsonc
{
  "providers": {
    "codex-cli": { "type": "codex-cli" }
  }
}
```

Requires `codex` on `$PATH`. Verify: `codex --version`.

On startup, agent-teams version-checks `codex --version` to detect stream-format changes (the codex JSON event stream parser lives in `src/providers/codex-cli-parser.ts`).

---

## Mixing providers

Any combination is valid. Example: Claude OAuth lead drives a team of three Ollama teammates:

```jsonc
{
  "providers": {
    "claude-oauth":  { "type": "anthropic-oauth" },
    "ollama-qwen":   { "type": "openai-compat-sdk", "baseUrl": "http://localhost:11434/v1", "apiKey": "ollama", "model": "qwen2.5-coder:32b" }
  },
  "defaults": {
    "lead": "claude-oauth",
    "teammate": "ollama-qwen"
  }
}
```

Override per-teammate via subagent definition frontmatter — see [subagent-defs.md](subagent-defs.md).

---

## Tool-call translation

The `openai-compat-sdk` provider translates between Anthropic-flavored tool schemas and OpenAI function-calling schemas automatically. The MCP team tools are exposed identically to every provider — the translation is transparent.

Source: `src/providers/tools.ts`.
