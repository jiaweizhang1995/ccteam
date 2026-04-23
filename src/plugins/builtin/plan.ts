import type { Plugin, BuiltinHandler } from '../types.js';

/**
 * Builtin /plan plugin. The actual plan-mode execution lives in
 * TeamLead.runPlanMode — this plugin's handler is a no-op that just emits a
 * marker event. The TUI short-circuits `/plan` before dispatch because it
 * needs access to setPlanState in the React tree.
 *
 * We still register the plugin so it appears in autocomplete and the
 * dispatcher validates the command name.
 */
export const PLAN_PLUGIN: Plugin = {
  name: 'plan',
  command: '/plan',
  description: 'Generate an execution plan, confirm agent count, then spawn teammates',
  handler: 'builtin',
  builtinKey: 'plan',
  body: '',
  source: 'builtin',
};

export const planBuiltin: BuiltinHandler = async (ctx) => {
  // The TUI intercepts /plan before dispatch because plan-mode needs React
  // state access via setPlanState. Reaching this handler means exec mode is
  // used, or TUI skipped interception — emit a helpful message.
  ctx.emit('plugin_output', {
    stream: 'stdout',
    text: '[/plan] plan mode is driven by the TUI directly. Use `ccteam tui` then type /plan <goal>.',
  });
};
