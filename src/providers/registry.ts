import type { AgentBackend } from "./types.js";

export type BackendFactory = (id: string, config: Record<string, unknown>) => AgentBackend;

const _registry = new Map<string, BackendFactory>();

export function registerBackend(type: string, factory: BackendFactory): void {
  _registry.set(type, factory);
}

export function getBackendFactory(type: string): BackendFactory | undefined {
  return _registry.get(type);
}

export function listRegisteredTypes(): string[] {
  return Array.from(_registry.keys());
}
