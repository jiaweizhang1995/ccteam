# Team MCP Tools

Every agent — regardless of provider — connects to the local Team MCP Server at spawn time. The server exposes the following tools via the MCP stdio protocol.

Provider-specific tool-calling mechanics (Anthropic vs OpenAI function-calling) are handled transparently. From an agent's perspective, these tools are just available.

The MCP server socket lives at `~/.agent-teams/teams/{team-name}/mcp.sock`.

---

## Tools reference

### send_message

Send a direct message to another agent (lead or teammate).

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `to` | string | Recipient name (`"lead"` or teammate name) |
| `body` | string | Message content |

**Returns:** `{ messageId: string }`

---

### broadcast

Send a message to all active teammates simultaneously.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `body` | string | Message content |

**Returns:** `{ messageId: string, recipients: string[] }`

Counts against each recipient's rate limit (30 messages/min per teammate). If a teammate is over-limit, the broadcast still delivers but logs a warning.

---

### list_teammates

Return the current team roster with status.

**Parameters:** none

**Returns:**

```json
[
  {
    "name": "ui-engineer",
    "id": "uuid",
    "provider": "claude-oauth",
    "status": "active",
    "currentTask": "uuid-or-null"
  }
]
```

**Status values:** `spawning` | `active` | `idle` | `shutdown`

---

### create_task

Add a task to the shared task list.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `title` | string | Short task title |
| `description` | string (optional) | Full task description |
| `depends_on` | string[] (optional) | Array of task IDs this task depends on |
| `assigned_to` | string (optional) | Teammate name to pre-assign (skips claim step) |

**Returns:** `{ taskId: string }`

Fires the `TaskCreated` hook. If the hook exits 2, this call returns an error with the hook's stderr as the `reason` field.

---

### list_tasks

Return the task list, optionally filtered.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `filter` | string (optional) | `"pending"` \| `"in_progress"` \| `"completed"` \| `"mine"` |

`"mine"` filters to tasks claimed by the calling agent.

**Returns:**

```json
[
  {
    "id": "uuid",
    "title": "Review auth module",
    "status": "pending",
    "assignedTo": null,
    "dependsOn": [],
    "blockedBy": [],
    "result": null
  }
]
```

`blockedBy` is derived at query time: the list of `depends_on` task IDs that are not yet completed.

---

### claim_task

Atomically claim a pending task. Uses a file-lock CAS pattern to prevent concurrent claims.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `task_id` | string | ID of the task to claim |

**Returns:** `{ ok: true }` or `{ ok: false, reason: "already_claimed" | "not_found" | "blocked" }`

`"blocked"` means at least one dependency task is not yet completed.

---

### complete_task

Mark a claimed task as completed with a result.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `task_id` | string | ID of the task to complete |
| `result` | string | Result summary (markdown or JSON) |

**Returns:** `{ ok: true }` or `{ ok: false, reason: "not_owner" | "not_found" }`

Fires the `TaskCompleted` hook. If the hook exits 2, the task is reset to `in_progress` and this call returns `{ ok: false, reason: "hook_veto", feedback: "<hook stderr>" }`.

Completing a task unblocks any tasks that listed it in `depends_on`.

---

### submit_plan

For teammates operating in plan-approval mode: submit a plan for the lead to review before executing.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `plan` | string | The plan text (markdown) |

**Returns:** `{ status: "approved" | "rejected", feedback?: string }`

This call blocks until the lead calls `decide_plan`. The teammate should not proceed until receiving `"approved"`.

---

### decide_plan

Lead-only. Approve or reject a plan submitted by a teammate.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `teammate` | string | Teammate name that submitted the plan |
| `decision` | `"approve"` \| `"reject"` | The decision |
| `feedback` | string (optional) | Feedback to send back if rejecting |

**Returns:** `{ ok: true }`

---

### request_shutdown

Lead-only. Request a teammate to shut down gracefully.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `teammate` | string | Teammate name to shut down |

**Returns:** `{ ok: true }`

The teammate receives a shutdown notification in its mailbox. It may complete its current turn before shutting down. If it does not shut down within 30 seconds, the orchestrator SIGKILLs the worker process.

---

## Rate limits

- `send_message` and `broadcast`: 30 messages per minute per teammate. Excess messages return an error; the agent should back off.
- `create_task`: no limit, but `TaskCreated` hook veto can block excessive creation.

---

## Config snippet

At spawn time, each teammate receives an MCP config JSON pointing at the team server:

```json
{
  "mcpServers": {
    "agent-teams": {
      "command": "agent-teams",
      "args": ["mcp-server", "--team", "<team-name>", "--agent", "<teammate-name>"],
      "env": {}
    }
  }
}
```

For `claude-cli` and `codex-cli` providers, this is passed via `--mcp-config`. For SDK providers, the MCP client is connected in-process.
