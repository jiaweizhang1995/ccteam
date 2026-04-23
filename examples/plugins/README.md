# ccteam plugins — examples

Each `.md` file in this directory is a plugin. To install globally, copy into:

```
~/.ccteam/plugins/
```

Or per-project:

```
.ccteam/plugins/
```

Then start the TUI (`ccteam tui`) — the plugin appears in the `/` autocomplete dropdown.

## Anatomy

```markdown
---
name: <display name>
command: /<slash-command>
description: <short blurb shown in autocomplete>
handler: prompt-prepend | shell | claude-skill | codex-plugin | builtin
# fields specific to each handler type
---

<markdown body used by prompt-prepend, or docs for others>
```

## Handlers

| handler | what it does |
|---|---|
| `prompt-prepend` | Prepends `body` to the user's next message before sending to the agent. Ideal for persona/style injection. |
| `shell` | Runs `shellTemplate` in `/bin/sh`; output streams back into the TUI. Supports `{{args}}` substitution. |
| `claude-skill` | Proxies to a Claude Code skill by name (invokes `claude -p` subprocess). |
| `codex-plugin` | Proxies to a codex plugin by name (invokes `codex exec` subprocess). |
| `builtin` | Calls a registered TS function by `builtinKey`. Used by `/plan` and `/ralph-loop`. |

## Auto-discovery

ccteam automatically surfaces:
- **Claude Code skills** from `~/.claude/skills/*/SKILL.md` as `/skill-<name>`
- **Codex plugins** from `~/.codex/plugins/` as `/codex-<name>`

So the whole Claude/Codex ecosystem is already wired. Type `/` in the TUI to see everything.
