import { getRegistry, resetRegistry } from './registry.js';
import { registerBuiltins } from './builtin/index.js';
import { loadAllPlugins } from './loader.js';

/**
 * One-call setup: resets the registry, registers builtins, loads disk
 * plugins, returns the populated registry.
 */
export function bootstrapPlugins(projectDir: string): ReturnType<typeof getRegistry> {
  resetRegistry();
  const registry = getRegistry();
  registerBuiltins(registry);
  registry.registerAll(loadAllPlugins(projectDir));
  return registry;
}
