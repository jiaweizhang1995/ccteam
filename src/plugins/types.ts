/**
 * Plugin / slash-command system for ccteam.
 *
 * Sources (priority desc — first match wins on name collision):
 *   1. Builtin TypeScript plugins (src/plugins/builtin/*)
 *   2. Project plugins (.ccteam/plugins/**\/*.md)
 *   3. User plugins (~/.ccteam/plugins/**\/*.md)
 *   4. Claude Code skills bridge (~/.claude/skills/**\/SKILL.md)
 *   5. Codex plugins bridge (~/.codex/plugins/** — depends on codex layout)
 *
 * Each plugin exposes a slash command (e.g. `/plan`, `/ralph-loop`).
 * Typing `/` in the TUI opens an autocomplete dropdown that prefix-matches
 * all registered commands.
 */

export type PluginHandlerKind =
  | 'builtin' // Call a registered JS function by key
  | 'prompt-prepend' // Prepend the plugin body as system prompt to next agent turn
  | 'shell' // Spawn a shell command with {{args}} template
  | 'claude-skill' // Proxy to a Claude Code skill by name (runs `claude` subprocess)
  | 'codex-plugin'; // Proxy to a codex plugin by name (runs `codex` subprocess)

export interface PluginFrontmatter {
  name: string;
  command: string; // e.g. "/plan" or "/ralph-loop"
  description: string;
  handler: PluginHandlerKind;
  /** For handler=builtin: key into the builtin handler registry */
  builtinKey?: string;
  /** For handler=shell: command template, supports {{args}} substitution */
  shellTemplate?: string;
  /** For handler=claude-skill: target skill name (e.g. "statusline-setup") */
  claudeSkill?: string;
  /** For handler=codex-plugin: target codex plugin name */
  codexPlugin?: string;
  /** Optional ralph-loop style completion promise (literal string to match in output) */
  completionPromise?: string;
  /** Optional source tag for diagnostics */
  source?: string;
}

export interface Plugin extends PluginFrontmatter {
  /** Raw markdown body (without frontmatter) — used by prompt-prepend + shown to user */
  body: string;
  /** Absolute path to the source file (if discovered from disk) */
  filePath?: string;
}

/** Context passed to builtin plugin handlers */
export interface PluginContext {
  args: string;
  teamName: string;
  cwd: string;
  /** Emit a TUI event (text_delta, tool_call, etc.) */
  emit(kind: string, payload: Record<string, unknown>): void;
  /** Set pending prompt text to feed to the agent on next turn */
  setPendingPrompt(prompt: string): void;
  /** Register a completion-promise watcher (ralph-loop semantics) */
  setCompletionPromise?(promise: string): void;
  /**
   * Activate ralph-loop runtime on TeamLead (optional — only provided when
   * a live lead is running, e.g. from the TUI driver in run.ts).
   */
  activateRalphLoop?(promise: string, maxIterations?: number): void;
}

export type BuiltinHandler = (ctx: PluginContext) => Promise<void>;

/** A match result from prefix-search used for TUI autocomplete */
export interface SlashMatch {
  plugin: Plugin;
  /** How many chars from user input matched (higher = better prefix match) */
  matchLen: number;
}
