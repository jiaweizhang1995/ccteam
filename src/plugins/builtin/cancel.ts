import type { Plugin, BuiltinHandler } from '../types.js';

/**
 * `/cancel` — stops any active ralph-loop by clearing the promise on
 * TeamLead, and aborts any active brainstorm session. Also useful as a
 * general "stop current operation" command.
 */
export const CANCEL_PLUGIN: Plugin = {
  name: 'cancel',
  command: '/cancel',
  description: 'Cancel the active ralph-loop, brainstorm, or pending operation',
  handler: 'builtin',
  builtinKey: 'cancel',
  body: '',
  source: 'builtin',
};

export const cancelBuiltin: BuiltinHandler = async (ctx) => {
  // Clear ralph-loop on the live TeamLead if the driver wired the hook.
  ctx.activateRalphLoop?.(null);
  // Exit brainstorm (if the driver wired the hook and one is active).
  ctx.exitBrainstorm?.();
  ctx.emit('cancel_requested', { at: Date.now() });
  ctx.emit('plugin_output', {
    stream: 'stdout',
    text: '[/cancel] cleared active ralph-loop / brainstorm (if any).',
  });
};
