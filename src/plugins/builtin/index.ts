import { PLAN_PLUGIN, planBuiltin } from './plan.js';
import { RALPH_LOOP_PLUGIN, ralphLoopBuiltin } from './ralph-loop.js';
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
}

export { PLAN_PLUGIN, planBuiltin, RALPH_LOOP_PLUGIN, ralphLoopBuiltin };
