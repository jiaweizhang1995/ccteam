# Exec Mode

`agent-teams exec` is the non-interactive mode. It streams JSONL events to stdout and exits when the team is done. Designed for CI pipelines, agent-in-agent workflows, and debugging.

---

## Basic usage

```bash
agent-teams exec "review src/ for security issues"
```

```bash
agent-teams exec "review src/ for security issues" | jq .
```

```bash
agent-teams exec --debug "build a REST API" 2>/dev/null | jq 'select(.kind == "text")'
```

---

## JSONL event schema

Every line is a JSON object:

```jsonc
{
  "ts":      1712345678000,   // Unix ms timestamp
  "team":    "my-team",       // team name
  "agent":   "ui-engineer",   // agent name, or "lead"
  "kind":    "text",          // event kind (see below)
  "payload": { ... }          // kind-specific payload
}
```

### Event kinds

| Kind | Emitted by | Description |
|------|-----------|-------------|
| `text` | any agent | Streaming text output delta |
| `text_done` | any agent | Full turn text completed |
| `tool_call` | any agent | Agent invoked a tool |
| `tool_result` | any agent | Tool returned a result |
| `message_sent` | any agent | Agent called `send_message` or `broadcast` |
| `message_received` | any agent | Agent received a message |
| `task_claimed` | teammate | Teammate claimed a task |
| `task_completed` | teammate | Teammate completed a task |
| `task_created` | any agent | Agent created a new task |
| `hook_fired` | orchestrator | A hook script was executed |
| `hook_vetoed` | orchestrator | A hook exited 2, event was vetoed |
| `teammate_spawned` | orchestrator | A new teammate worker started |
| `teammate_idle` | orchestrator | A teammate entered idle state |
| `teammate_shutdown` | orchestrator | A teammate shut down |
| `plan_submitted` | teammate | Teammate submitted a plan for approval |
| `plan_decided` | lead | Lead approved or rejected a plan |
| `turn_start` | any agent | Agent started a new turn |
| `turn_done` | any agent | Agent completed a turn |
| `error` | orchestrator | An error occurred |
| `team_done` | orchestrator | All work complete, team shutting down |

---

## Payload shapes

### text

```json
{ "delta": "Hello, I'll start by reviewing..." }
```

### tool_call

```json
{
  "toolName": "read_file",
  "toolCallId": "toolu_01...",
  "input": { "path": "src/auth.ts" }
}
```

### tool_result

```json
{
  "toolCallId": "toolu_01...",
  "output": "export function login(...) { ... }",
  "isError": false
}
```

### task_claimed

```json
{
  "taskId": "uuid",
  "title": "Review auth module"
}
```

### task_completed

```json
{
  "taskId": "uuid",
  "title": "Review auth module",
  "result": "Found 2 issues: ..."
}
```

### error

```json
{
  "message": "Teammate worker crashed",
  "code": "WORKER_CRASH",
  "teammate": "security-reviewer"
}
```

### team_done

```json
{
  "summary": "Completed 4 tasks. Lead synthesis: ...",
  "tasksCompleted": 4,
  "elapsedMs": 45231
}
```

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Team completed successfully |
| `1` | Team completed with errors (at least one `error` event in the stream) |
| `2` | CLI/config error before the team started |

---

## Debug mode

`--debug` additionally streams SDK request/response bodies. Secrets (`api_key`, `Authorization` headers, OAuth tokens) are redacted before output.

```bash
agent-teams exec --debug "review README" 2>/dev/null | jq 'select(.kind == "sdk_request")'
```

Debug-only event kinds:

| Kind | Description |
|------|-------------|
| `sdk_request` | Raw request body sent to the provider API (secrets redacted) |
| `sdk_response` | Raw response body from the provider API |
| `mcp_call` | MCP tool call to the team server |
| `mcp_result` | MCP tool call result |

---

## Driving exec from another agent

exec mode is designed to be called by a parent agent as a subprocess:

```python
import subprocess, json

result = subprocess.run(
    ["agent-teams", "exec", "review src/ for security issues"],
    capture_output=True, text=True
)

for line in result.stdout.strip().split("\n"):
    event = json.loads(line)
    if event["kind"] == "team_done":
        print(event["payload"]["summary"])
```

Or with `codex exec`:

```bash
codex exec "run agent-teams exec 'review src/' and summarize the findings"
```

The parent agent can parse the JSONL stream and react to specific events — e.g., monitor `task_completed` events to track progress in real time.

---

## Filtering the event stream with jq

Show only text output from all agents:

```bash
agent-teams exec "..." | jq 'select(.kind == "text") | "\(.agent): \(.payload.delta)"' -r
```

Show task lifecycle:

```bash
agent-teams exec "..." | jq 'select(.kind | startswith("task_"))'
```

Show only errors:

```bash
agent-teams exec "..." | jq 'select(.kind == "error")'
```

Wait for team_done and extract summary:

```bash
agent-teams exec "..." | jq 'select(.kind == "team_done") | .payload.summary' -r
```
