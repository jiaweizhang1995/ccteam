# Hooks

Hooks are shell scripts that agent-teams executes at key lifecycle events. They mirror Claude Code's hooks contract exactly: exit code 2 vetoes the event and the agent receives stderr as feedback.

---

## Configuring hooks

In your config file (`~/.agent-teams/config.json` or `.agent-teams/config.json` in your project):

```jsonc
{
  "hooks": {
    "TeammateIdle":  "$HOME/.agent-teams/hooks/idle.sh",
    "TaskCreated":   "$HOME/.agent-teams/hooks/task-created.sh",
    "TaskCompleted": null
  }
}
```

Set a hook to `null` (or omit it) to disable it.

---

## Hook events

### TeammateIdle

Fires when a teammate has no pending tool-calls and no claimed tasks — it is waiting for work or a message.

**Environment variables passed:**

| Variable | Value |
|----------|-------|
| `AGENT_TEAMS_TEAM` | Team name |
| `AGENT_TEAMS_TEAMMATE` | Teammate name |
| `AGENT_TEAMS_TEAMMATE_ID` | Teammate UUID |
| `AGENT_TEAMS_PROVIDER` | Provider id (e.g. `claude-oauth`) |

**Payload (JSON on stdin):**

```json
{
  "event": "TeammateIdle",
  "team": "my-team",
  "teammate": "ui-engineer",
  "provider": "claude-oauth",
  "idleSince": 1712345678000
}
```

**Veto semantics:** exit code 2 will reassign a pending task to this teammate (if one is available). Exit code 0 or 1 is a no-op (1 = hook error, logged but not vetoed).

---

### TaskCreated

Fires immediately after a task is inserted into the shared task list (by any agent).

**Payload (JSON on stdin):**

```json
{
  "event": "TaskCreated",
  "team": "my-team",
  "task": {
    "id": "uuid",
    "title": "Review authentication module",
    "description": "...",
    "createdBy": "lead",
    "dependsOn": []
  }
}
```

**Veto semantics:** exit code 2 deletes the task and returns the stderr message to the creating agent as a rejection reason. The agent may retry with a revised task.

---

### TaskCompleted

Fires when a teammate calls `complete_task` via the MCP server.

**Payload (JSON on stdin):**

```json
{
  "event": "TaskCompleted",
  "team": "my-team",
  "task": {
    "id": "uuid",
    "title": "Review authentication module",
    "completedBy": "security-reviewer",
    "result": "Found 2 issues: ..."
  }
}
```

**Veto semantics:** exit code 2 marks the task back to `in_progress` and sends stderr to the completing teammate as feedback. The teammate is expected to address the feedback and re-complete.

---

## Exit code contract

| Exit code | Meaning |
|-----------|---------|
| `0` | Hook ran successfully, allow the event |
| `1` | Hook error — logged, event still allowed |
| `2` | Veto — stderr returned to the agent as feedback |
| other | Treated as `1` |

This is identical to Claude Code's hooks contract.

---

## Example hook: idle reassignment

`~/.agent-teams/hooks/idle.sh`:

```bash
#!/bin/bash
# Read the JSON payload from stdin
payload=$(cat)
teammate=$(echo "$payload" | jq -r '.teammate')

echo "Teammate $teammate is idle" >&2

# Exit 0 — allow idle (do nothing)
exit 0
```

---

## Example hook: task review gate

`~/.agent-teams/hooks/task-created.sh`:

```bash
#!/bin/bash
payload=$(cat)
title=$(echo "$payload" | jq -r '.task.title')

# Reject tasks with no description
description=$(echo "$payload" | jq -r '.task.description // empty')
if [ -z "$description" ]; then
  echo "Task '$title' must have a description. Please add one." >&2
  exit 2
fi

exit 0
```

---

## Hook timeout

Hooks time out after 30 seconds. If a hook times out, the event is allowed (same as exit code 0). The timeout is not currently configurable.

---

## Hook security

Hook scripts execute with the same permissions as the `agent-teams` process. The payload is passed on stdin — do not pass it as a shell argument to avoid injection.
