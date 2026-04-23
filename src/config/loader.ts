import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ProviderConfig } from '../providers/factory.js';

export interface AgentTeamsConfig {
  providers: Map<string, ProviderConfig>;
  defaults: { lead: string; teammate: string };
  teammateMode: 'in-process' | 'tmux' | 'auto';
  hooks: { TeammateIdle?: string | null; TaskCreated?: string | null; TaskCompleted?: string | null };
}

interface RawConfig {
  providers?: Record<string, Record<string, unknown>>;
  defaults?: { lead?: string; teammate?: string };
  teammateMode?: string;
  hooks?: { TeammateIdle?: string | null; TaskCreated?: string | null; TaskCompleted?: string | null };
}

function parseConfig(raw: RawConfig): Partial<AgentTeamsConfig> {
  const providers = new Map<string, ProviderConfig>();
  for (const [id, cfg] of Object.entries(raw.providers ?? {})) {
    providers.set(id, cfg as unknown as ProviderConfig);
  }
  return {
    providers,
    defaults: {
      lead: raw.defaults?.lead ?? 'claude-oauth',
      teammate: raw.defaults?.teammate ?? 'claude-oauth',
    },
    teammateMode: (raw.teammateMode as AgentTeamsConfig['teammateMode']) ?? 'auto',
    hooks: raw.hooks ?? {},
  };
}

function readConfigFile(path: string): Partial<AgentTeamsConfig> {
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as RawConfig;
    return parseConfig(raw);
  } catch {
    return {};
  }
}

function mergeConfigs(...configs: Partial<AgentTeamsConfig>[]): AgentTeamsConfig {
  const merged: AgentTeamsConfig = {
    providers: new Map(),
    defaults: { lead: 'claude-oauth', teammate: 'claude-oauth' },
    teammateMode: 'auto',
    hooks: {},
  };

  for (const cfg of configs) {
    if (cfg.providers) {
      for (const [id, pc] of cfg.providers) {
        merged.providers.set(id, pc);
      }
    }
    if (cfg.defaults?.lead) merged.defaults.lead = cfg.defaults.lead;
    if (cfg.defaults?.teammate) merged.defaults.teammate = cfg.defaults.teammate;
    if (cfg.teammateMode) merged.teammateMode = cfg.teammateMode;
    if (cfg.hooks) merged.hooks = { ...merged.hooks, ...cfg.hooks };
  }

  return merged;
}

export function loadConfig(projectDir?: string): AgentTeamsConfig {
  const globalPath = join(homedir(), '.agent-teams', 'config.json');
  const projectPath = projectDir ? join(projectDir, '.agent-teams', 'config.json') : null;

  const global = readConfigFile(globalPath);
  const project = projectPath ? readConfigFile(projectPath) : {};

  // Project config overrides global; env vars override all
  const merged = mergeConfigs(global, project);

  // Env var overrides for provider lookup
  if (process.env['ANTHROPIC_API_KEY'] && !merged.providers.has('claude-api')) {
    merged.providers.set('claude-api', { type: 'anthropic-sdk', apiKey: process.env['ANTHROPIC_API_KEY'] });
  }
  if (process.env['OPENAI_API_KEY'] && !merged.providers.has('openai')) {
    merged.providers.set('openai', {
      type: 'openai-compat-sdk',
      apiKey: process.env['OPENAI_API_KEY'],
      baseUrl: process.env['OPENAI_BASE_URL'],
    });
  }

  return merged;
}
