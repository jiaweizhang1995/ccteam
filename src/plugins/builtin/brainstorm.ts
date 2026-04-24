import type { Plugin, BuiltinHandler } from '../types.js';

/**
 * Builtin /brainstorm plugin. Starts a multi-turn plan-refinement session:
 *
 *   /brainstorm <goal>
 *     → lead enters plan mode (tools disabled) and generates a first-pass plan
 *     → user sends refinements via normal TUI input; each message re-runs the
 *       lead with the accumulated conversation
 *     → /go commits the latest plan and spawns teammates (executeFromPlan)
 *     → /cancel (or Esc) aborts without executing
 *
 * This plugin itself is a marker that delegates the real work to the TUI
 * driver (run.ts) via the `startBrainstorm` PluginContext callback — same
 * pattern as `/plan` (the TUI owns the streaming + state lifecycle).
 */
export const BRAINSTORM_PLUGIN: Plugin = {
  name: 'brainstorm',
  command: '/brainstorm',
  description:
    'Multi-turn plan refinement: /brainstorm <goal> then iterate, /go to execute',
  handler: 'builtin',
  builtinKey: 'brainstorm',
  body: '',
  source: 'builtin',
};

export const brainstormBuiltin: BuiltinHandler = async (ctx) => {
  const goal = ctx.args.trim();
  if (!goal) {
    ctx.emit('plugin_output', {
      stream: 'stderr',
      text: '[/brainstorm] usage: /brainstorm <goal>. Then refine with normal messages, and commit with /go.',
    });
    return;
  }

  if (!ctx.startBrainstorm) {
    // Non-TUI driver (e.g. exec mode) — brainstorm is an interactive feature.
    ctx.emit('plugin_output', {
      stream: 'stderr',
      text: '[/brainstorm] requires interactive TUI. Use `ccteam tui "..."` then /brainstorm <goal>.',
    });
    return;
  }

  ctx.emit('brainstorm_started', { goal });
  ctx.startBrainstorm(goal);
};
