import type { Plugin, BuiltinHandler } from '../types.js';

/**
 * Builtin /go plugin. Commits the current brainstorm plan:
 *
 *   /go
 *     → take the most recent plan produced during /brainstorm
 *     → exit brainstorm state
 *     → spawn teammates and create tasks (executeFromPlan)
 *
 * The actual executeFromPlan dispatch lives in the TUI driver (run.ts) —
 * this plugin just signals the driver via `executeBrainstormPlan`. Running
 * /go outside brainstorm mode is a soft error: we just print a hint.
 */
export const GO_PLUGIN: Plugin = {
  name: 'go',
  command: '/go',
  description:
    'Commit the current /brainstorm plan: exit plan mode, spawn teammates, execute',
  handler: 'builtin',
  builtinKey: 'go',
  body: '',
  source: 'builtin',
};

export const goBuiltin: BuiltinHandler = async (ctx) => {
  if (!ctx.executeBrainstormPlan) {
    ctx.emit('plugin_output', {
      stream: 'stderr',
      text: '[/go] requires interactive TUI. Use `ccteam tui "..."` then /brainstorm <goal>, refine, then /go.',
    });
    return;
  }

  ctx.emit('brainstorm_go_requested', {});
  ctx.executeBrainstormPlan();
};
