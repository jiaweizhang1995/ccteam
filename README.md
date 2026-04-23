# ccteam

Multi-agent CLI. Lead + teammates share tasks, send messages, spawn each other. Works with `codex`, `claude`, OpenAI-compat, Anthropic API — mix and match.

Like Claude Code's Agent Teams, but provider-agnostic.

---

## English

### Install

```bash
git clone https://github.com/jiaweizhang1995/ccteam.git
cd ccteam
pnpm install
ln -sf "$PWD/bin/ccteam" ~/.local/bin/ccteam   # make sure ~/.local/bin is in PATH
```

Requires Node 20+, `pnpm`, and at least one of: `codex` CLI (logged in), `claude` CLI (logged in), or an API key.

### Config

`~/.agent-teams/config.json` (auto-created on first run):

```json
{
  "providers": {
    "codex":  { "type": "codex-cli", "model": "gpt-5.4" },
    "claude": { "type": "claude-cli", "model": "claude-opus-4-7" }
  },
  "defaults": { "lead": "codex", "teammate": "codex" }
}
```

Provider types: `codex-cli`, `claude-cli`, `anthropic-sdk`, `openai-compat-sdk`.

### Usage

```bash
# Run a team
ccteam "spawn alice and bob, create task 'greet', report roster" --team demo

# Interactive TUI
ccteam tui "investigate the codebase"

# Manage
ccteam list
ccteam cleanup <team>
ccteam reset          # wipe all state
```

### What lead can do

Via MCP tools: `spawn_teammate`, `list_teammates`, `create_task`, `list_tasks`, `claim_task`, `complete_task`, `send_message`, `broadcast`, `submit_plan`, `decide_plan`, `request_shutdown`.

### Slash commands / plugins

Type `/` in the TUI input to see all available commands. Prefix-match narrows the list:
- `/pl` → `/plan`
- `/ralp` → `/ralph-loop`

**Built-in:**
- `/plan <goal>` — generate execution plan, confirm agent count, spawn teammates + dispatch tasks
- `/ralph-loop <task>` — self-referential loop: repeat task until agent emits `<promise>DONE</promise>`

**Auto-discovered ecosystem:**
- Claude Code skills at `~/.claude/skills/*/SKILL.md` → `/skill-<name>`
- Codex plugins at `~/.codex/plugins/` → `/codex-<name>`

**Custom plugins** — drop `.md` files in `~/.ccteam/plugins/` (global) or `.ccteam/plugins/` (project-local). See `examples/plugins/` for templates. Handlers: `prompt-prepend`, `shell`, `claude-skill`, `codex-plugin`, `builtin`.

### How it works

```
ccteam exec "..."
  │
  └─ orchestrator (Node)
       ├─ spawns lead subprocess (e.g. codex exec)
       │    └─ connects to MCP bridge (stdio) for team tools
       │
       └─ lead calls spawn_teammate → orchestrator forks teammate-worker
            └─ worker spawns its own codex/claude subprocess + MCP bridge

All agents share one SQLite DB (tasks, messages, teammates).
```

---

## 中文

### 安装

```bash
git clone https://github.com/jiaweizhang1995/ccteam.git
cd ccteam
pnpm install
ln -sf "$PWD/bin/ccteam" ~/.local/bin/ccteam   # 确保 ~/.local/bin 在 PATH
```

需要 Node 20+、`pnpm`,以及至少一个: `codex` CLI (已登录)、`claude` CLI (已登录), 或 API key.

### 配置

`~/.agent-teams/config.json` (首次运行自动生成):

```json
{
  "providers": {
    "codex":  { "type": "codex-cli", "model": "gpt-5.4" },
    "claude": { "type": "claude-cli", "model": "claude-opus-4-7" }
  },
  "defaults": { "lead": "codex", "teammate": "codex" }
}
```

Provider 类型: `codex-cli`, `claude-cli`, `anthropic-sdk`, `openai-compat-sdk`.

### 用法

```bash
# 跑一个团队
ccteam "生成alice和bob两个teammate, 创建任务'greet', 报告roster" --team demo

# 交互式 TUI
ccteam tui "分析代码库"

# 管理
ccteam list
ccteam cleanup <team>
ccteam reset          # 清空所有状态
```

### Lead可以做什么

通过 MCP 工具: `spawn_teammate` (创建teammate)、`list_teammates` (列roster)、`create_task` (建任务)、`list_tasks` (列任务)、`claim_task` (抢任务)、`complete_task` (完成任务)、`send_message` (点对点消息)、`broadcast` (广播)、`submit_plan` (提交plan)、`decide_plan` (审批plan)、`request_shutdown` (请求关闭teammate).

### Slash 命令 / 插件

TUI 里输入 `/` 展开所有命令。继续输入前缀自动过滤:
- `/pl` → `/plan`
- `/ralp` → `/ralph-loop`

**内建:**
- `/plan <目标>` — 生成plan，确认agent数量，spawn teammate 并分发任务
- `/ralph-loop <任务>` — 自引用循环: 重复执行直到agent输出 `<promise>DONE</promise>`

**自动接入的生态:**
- Claude Code skills (`~/.claude/skills/*/SKILL.md`) → `/skill-<名称>`
- Codex plugins (`~/.codex/plugins/`) → `/codex-<名称>`

**自定义插件** — 把 `.md` 文件放到 `~/.ccteam/plugins/` (全局) 或 `.ccteam/plugins/` (项目). 模板看 `examples/plugins/`. Handler 类型: `prompt-prepend` / `shell` / `claude-skill` / `codex-plugin` / `builtin`.

### 工作原理

```
ccteam exec "..."
  │
  └─ orchestrator (Node进程)
       ├─ spawn lead子进程 (比如 codex exec)
       │    └─ 通过 stdio 连接 MCP bridge 拿team tools
       │
       └─ lead调用spawn_teammate → orchestrator fork teammate-worker
            └─ worker自己再spawn codex/claude子进程 + MCP bridge

所有agent共享一个SQLite DB (tasks, messages, teammates).
```

---

## License

MIT
