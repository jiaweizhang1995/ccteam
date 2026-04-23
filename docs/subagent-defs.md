# Subagent Definitions

Subagent definitions let you pre-configure reusable teammate roles — system prompt, provider, model, and tools allowlist — in markdown files with YAML frontmatter. The team lead can spawn teammates by role name, inheriting the full definition.

This feature is designed for parity with Claude Code's subagent definitions.

---

## File format

```markdown
---
name: security-reviewer
provider: claude-api
model: claude-opus-4-7
tools:
  - read_file
  - grep
  - list_directory
  - send_message
  - claim_task
  - complete_task
---

You are a security-focused code reviewer. Your job is to identify vulnerabilities, secrets exposure, and deviations from secure coding practices.

Focus areas:
- OWASP Top 10
- Hardcoded credentials and API keys
- SQL injection, XSS, command injection
- Insecure deserialization
- Missing input validation at system boundaries

For each finding, report: file path, line number, severity (critical/high/medium/low), and a concrete remediation suggestion.
```

Everything after the closing `---` is the system prompt. The frontmatter fields are all optional — omit any to inherit the team's defaults.

---

## Frontmatter fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Required. Unique name for this agent type. Used by the lead to spawn teammates. |
| `provider` | string | Provider id from config (e.g. `claude-api`). Defaults to `defaults.teammate`. |
| `model` | string | Model override for this agent type. Defaults to the provider's default model. |
| `tools` | string[] | Allowlist of tool names this teammate can call. If omitted, uses the team's default allowlist. |
| `description` | string | One-line description shown in `agent-teams list` and the TUI. |
| `planApproval` | boolean | If `true`, teammate must submit a plan via `submit_plan` before executing. Default: `false`. |

The system prompt always has the team MCP tools injected — `send_message`, `broadcast`, `list_teammates`, `create_task`, `list_tasks`, `claim_task`, `complete_task`, `submit_plan` — regardless of the `tools` allowlist. The allowlist governs additional tools (file access, bash, etc.).

---

## Scope precedence

Definitions are loaded from multiple locations. Higher scope overrides lower scope when names conflict.

| Scope | Location | Priority |
|-------|----------|----------|
| CLI | `--subagent-def path/to/def.md` flag | Highest |
| Project | `.agent-teams/agents/<name>.md` | High |
| User | `~/.agent-teams/agents/<name>.md` | Low |
| Plugin | Installed via npm package `agent-teams-plugin-*` | Lowest |

This mirrors Claude Code's scope hierarchy.

---

## Using definitions

Reference by name when spawning a team run:

```bash
agent-teams run "review src/ for security" --subagent security-reviewer
```

Or define team composition in your project config:

```jsonc
{
  "team": {
    "teammates": [
      { "name": "security-reviewer" },
      { "name": "security-reviewer", "as": "security-reviewer-2" },
      { "name": "doc-writer" }
    ]
  }
}
```

The lead can also spawn teammates dynamically during a run by calling `create_teammate` (not a direct user config — done via the lead's reasoning). The lead receives the available agent types in its system prompt.

---

## Example definitions

### doc-writer.md

```markdown
---
name: doc-writer
provider: claude-api
model: claude-sonnet-4-6
tools:
  - read_file
  - write_file
  - list_directory
---

You are a technical writer. Your job is to write clear, accurate documentation for code you are given.

Write in plain language. Use code examples. Structure docs as: overview, prerequisites, usage, reference, troubleshooting.
```

### ollama-coder.md

```markdown
---
name: ollama-coder
provider: ollama-qwen
tools:
  - read_file
  - write_file
  - run_bash
  - grep
---

You are a code implementation specialist. You write clean, tested TypeScript/JavaScript.

Always write tests alongside implementation. Prefer simple solutions. No unnecessary abstractions.
```

---

## Discovering available definitions

```bash
agent-teams providers  # shows configured providers
ls ~/.agent-teams/agents/
ls .agent-teams/agents/
```

The TUI task list panel also shows the agent type tag on each teammate's pane header.

---

## Plugin-scoped definitions

An npm package can ship agent definitions by including an `agent-teams-agents/` directory at its root and declaring it in `package.json`:

```jsonc
{
  "name": "agent-teams-plugin-security",
  "agentTeamsAgents": "agent-teams-agents/"
}
```

Installed packages are scanned at startup. Plugin-scope definitions have the lowest priority and are overridden by any user/project/CLI definition with the same name.
