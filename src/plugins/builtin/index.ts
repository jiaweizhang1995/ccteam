import { PLAN_PLUGIN, planBuiltin } from './plan.js';
import { RALPH_LOOP_PLUGIN, ralphLoopBuiltin } from './ralph-loop.js';
import { CANCEL_PLUGIN, cancelBuiltin } from './cancel.js';
import { BRAINSTORM_PLUGIN, brainstormBuiltin } from './brainstorm.js';
import { GO_PLUGIN, goBuiltin } from './go.js';
import type { PluginRegistry } from '../registry.js';

/**
 * Register all builtin plugins in one call. Builtins are registered first
 * so they win over any same-named disk plugins.
 */
export function registerBuiltins(registry: PluginRegistry): void {
  registry.register(PLAN_PLUGIN);
  registry.registerBuiltin('plan', planBuiltin);

  registry.register(RALPH_LOOP_PLUGIN);
  registry.registerBuiltin('ralph-loop', ralphLoopBuiltin);

  registry.register(CANCEL_PLUGIN);
  registry.registerBuiltin('cancel', cancelBuiltin);

  registry.register(BRAINSTORM_PLUGIN);
  registry.registerBuiltin('brainstorm', brainstormBuiltin);

  registry.register(GO_PLUGIN);
  registry.registerBuiltin('go', goBuiltin);
}

export {
  PLAN_PLUGIN, planBuiltin,
  RALPH_LOOP_PLUGIN, ralphLoopBuiltin,
  CANCEL_PLUGIN, cancelBuiltin,
  BRAINSTORM_PLUGIN, brainstormBuiltin,
  GO_PLUGIN, goBuiltin,
};
