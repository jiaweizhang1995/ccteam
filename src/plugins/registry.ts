import type { Plugin, BuiltinHandler, SlashMatch } from './types.js';

/**
 * In-memory plugin registry. Built at TUI startup.
 *
 * Resolution order: builtins always win over disk plugins on command-name
 * collision (so users can't accidentally override `/plan` or `/ralph-loop`).
 */
export class PluginRegistry {
  private byCommand = new Map<string, Plugin>();
  private builtinHandlers = new Map<string, BuiltinHandler>();

  /**
   * Register a plugin. Later calls with the same command name are ignored
   * (first-wins). Register builtins first, disk plugins second.
   */
  register(plugin: Plugin): void {
    if (!this.byCommand.has(plugin.command)) {
      this.byCommand.set(plugin.command, plugin);
    }
  }

  registerAll(plugins: Plugin[]): void {
    for (const p of plugins) this.register(p);
  }

  /** Register a builtin handler fn. Must match plugin.builtinKey. */
  registerBuiltin(key: string, handler: BuiltinHandler): void {
    this.builtinHandlers.set(key, handler);
  }

  getBuiltin(key: string): BuiltinHandler | undefined {
    return this.builtinHandlers.get(key);
  }

  get(command: string): Plugin | undefined {
    return this.byCommand.get(command);
  }

  list(): Plugin[] {
    return [...this.byCommand.values()].sort((a, b) => a.command.localeCompare(b.command));
  }

  /**
   * Prefix-match plugins whose command starts with `input`. Empty input
   * returns all. Used by TUI autocomplete.
   */
  match(input: string): SlashMatch[] {
    const q = input.trim();
    const out: SlashMatch[] = [];
    for (const plugin of this.byCommand.values()) {
      if (!q || plugin.command.startsWith(q)) {
        out.push({ plugin, matchLen: q.length });
      } else if (plugin.command.toLowerCase().includes(q.toLowerCase())) {
        // Soft match — lower priority
        out.push({ plugin, matchLen: 0 });
      }
    }
    out.sort((a, b) => {
      if (b.matchLen !== a.matchLen) return b.matchLen - a.matchLen;
      return a.plugin.command.localeCompare(b.plugin.command);
    });
    return out;
  }
}

let _registry: PluginRegistry | null = null;

export function getRegistry(): PluginRegistry {
  if (!_registry) _registry = new PluginRegistry();
  return _registry;
}

export function resetRegistry(): void {
  _registry = null;
}
