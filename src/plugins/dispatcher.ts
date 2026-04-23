import { spawn } from 'node:child_process';
import type { Plugin, PluginContext } from './types.js';
import type { PluginRegistry } from './registry.js';

export interface DispatchResult {
  ok: boolean;
  error?: string;
}

/**
 * Parse a slash command line into (command, args).
 * Accepts:  "/plan build a todo CLI"  →  { command: "/plan", args: "build a todo CLI" }
 *           "/ralph-loop"              →  { command: "/ralph-loop", args: "" }
 */
export function parseSlashCommand(line: string): { command: string; args: string } | null {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith('/')) return null;
  const m = trimmed.match(/^(\/[A-Za-z][A-Za-z0-9_:-]*)(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  return { command: m[1]!, args: (m[2] ?? '').trim() };
}

export async function dispatchSlashCommand(
  line: string,
  registry: PluginRegistry,
  baseCtx: Omit<PluginContext, 'args'>,
): Promise<DispatchResult> {
  const parsed = parseSlashCommand(line);
  if (!parsed) return { ok: false, error: 'not a slash command' };

  const plugin = registry.get(parsed.command);
  if (!plugin) return { ok: false, error: `unknown command: ${parsed.command}` };

  const ctx: PluginContext = { ...baseCtx, args: parsed.args };

  try {
    await runHandler(plugin, ctx, registry);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function runHandler(
  plugin: Plugin,
  ctx: PluginContext,
  registry: PluginRegistry,
): Promise<void> {
  switch (plugin.handler) {
    case 'builtin': {
      if (!plugin.builtinKey) throw new Error(`plugin ${plugin.command}: builtin handler missing builtinKey`);
      const fn = registry.getBuiltin(plugin.builtinKey);
      if (!fn) throw new Error(`builtin handler not found: ${plugin.builtinKey}`);
      await fn(ctx);
      return;
    }

    case 'prompt-prepend': {
      // Compose a new user prompt: plugin body + user args
      const composed = `${plugin.body}\n\n${ctx.args}`.trim();
      if (plugin.completionPromise) {
        ctx.setCompletionPromise?.(plugin.completionPromise);
      }
      ctx.setPendingPrompt(composed);
      ctx.emit('plugin_invoked', { command: plugin.command, kind: 'prompt-prepend' });
      return;
    }

    case 'shell': {
      if (!plugin.shellTemplate) throw new Error(`plugin ${plugin.command}: shell handler missing shellTemplate`);
      const cmd = plugin.shellTemplate.replace(/\{\{args\}\}/g, shellEscape(ctx.args));
      await runShell(cmd, ctx);
      return;
    }

    case 'claude-skill': {
      if (!plugin.claudeSkill) throw new Error(`plugin ${plugin.command}: claude-skill handler missing claudeSkill name`);
      // Invoke via `claude -p` non-interactively; skill name passed in prompt.
      const cmd = `claude -p ${shellEscape(`use the ${plugin.claudeSkill} skill with input: ${ctx.args}`)} --output-format json`;
      await runShell(cmd, ctx);
      return;
    }

    case 'codex-plugin': {
      if (!plugin.codexPlugin) throw new Error(`plugin ${plugin.command}: codex-plugin handler missing codexPlugin name`);
      const cmd = `codex exec --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox ${shellEscape(`Invoke codex plugin "${plugin.codexPlugin}" with: ${ctx.args}`)}`;
      await runShell(cmd, ctx);
      return;
    }

    default: {
      const _exhaustive: never = plugin.handler;
      throw new Error(`unhandled plugin handler: ${String(_exhaustive)}`);
    }
  }
}

function shellEscape(s: string): string {
  if (!s) return '""';
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function runShell(cmd: string, ctx: PluginContext): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('/bin/sh', ['-c', cmd], { cwd: ctx.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => {
      const s = d.toString();
      stdout += s;
      ctx.emit('plugin_output', { stream: 'stdout', text: s });
    });
    proc.stderr.on('data', (d: Buffer) => {
      const s = d.toString();
      stderr += s;
      ctx.emit('plugin_output', { stream: 'stderr', text: s });
    });
    proc.on('close', (code) => {
      ctx.emit('plugin_exit', { code, stdoutLen: stdout.length, stderrLen: stderr.length });
      if (code === 0) resolve();
      else reject(new Error(`shell exit ${code}: ${stderr.slice(0, 200)}`));
    });
    proc.on('error', reject);
  });
}
