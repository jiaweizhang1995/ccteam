import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import type { Plugin, PluginFrontmatter, PluginHandlerKind } from './types.js';

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

const VALID_HANDLERS: PluginHandlerKind[] = [
  'builtin', 'prompt-prepend', 'shell', 'claude-skill', 'codex-plugin',
];

/**
 * Parse YAML-ish frontmatter. Keeps scope small to avoid a YAML dep —
 * supports key:value, quoted strings, and simple bools. Anything more
 * complex: use JSON value (e.g. `tools: ["a","b"]`).
 */
function parseFrontmatter(text: string): Partial<PluginFrontmatter> {
  const out: Record<string, unknown> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.replace(/-/g, '_');
    let value: unknown = m[2]!.trim();
    if (typeof value === 'string') {
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      } else if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (/^-?\d+$/.test(value)) value = parseInt(value, 10);
    }
    out[key] = value;
  }
  return out as Partial<PluginFrontmatter>;
}

function parsePluginFile(filePath: string, source: string): Plugin | null {
  let raw: string;
  try { raw = readFileSync(filePath, 'utf8'); } catch { return null; }
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return null;
  const fm = parseFrontmatter(m[1]!);
  if (!fm.name || !fm.command || !fm.handler) return null;
  if (!VALID_HANDLERS.includes(fm.handler)) return null;
  const body = (m[2] ?? '').trim();
  return {
    name: fm.name,
    command: fm.command.startsWith('/') ? fm.command : `/${fm.command}`,
    description: fm.description ?? '',
    handler: fm.handler,
    builtinKey: fm.builtinKey,
    shellTemplate: fm.shellTemplate,
    claudeSkill: fm.claudeSkill,
    codexPlugin: fm.codexPlugin,
    completionPromise: fm.completionPromise,
    source,
    body,
    filePath,
  };
}

function walkMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: string[];
    try { entries = readdirSync(current); } catch { continue; }
    for (const entry of entries) {
      const full = join(current, entry);
      let stats;
      try { stats = statSync(full); } catch { continue; }
      if (stats.isDirectory()) stack.push(full);
      else if (entry.endsWith('.md')) out.push(full);
    }
  }
  return out;
}

/** Load plugins from a directory, each .md file is a plugin */
export function loadPluginsFromDir(dir: string, source: string): Plugin[] {
  return walkMdFiles(dir)
    .map((f) => parsePluginFile(f, source))
    .filter((p): p is Plugin => p !== null);
}

/**
 * Best-effort bridge: discover Claude Code skills at ~/.claude/skills.
 * Each skill has a SKILL.md — we expose it as `/skill-<basename-of-dir>`.
 */
export function loadClaudeSkills(): Plugin[] {
  const base = join(homedir(), '.claude', 'skills');
  if (!existsSync(base)) return [];
  const out: Plugin[] = [];
  let entries: string[];
  try { entries = readdirSync(base); } catch { return []; }
  for (const entry of entries) {
    const skillPath = join(base, entry, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    let content: string;
    try { content = readFileSync(skillPath, 'utf8'); } catch { continue; }
    // Claude skill frontmatter has name + description at top
    const fm = parseFrontmatter((content.match(FRONTMATTER_RE)?.[1] ?? ''));
    const name = String(fm.name ?? entry);
    const description = String(fm.description ?? '');
    out.push({
      name,
      command: `/skill-${entry}`,
      description: description.slice(0, 120),
      handler: 'claude-skill',
      claudeSkill: name,
      body: content.match(FRONTMATTER_RE)?.[2]?.trim() ?? content,
      filePath: skillPath,
      source: 'claude-skills',
    });
  }
  return out;
}

/**
 * Discover Claude Code plugin slash commands. Modern plugins live in
 * `~/.claude/plugins/marketplaces/<marketplace>/[plugins/<plugin>/]commands/`
 * as either `.md` (with frontmatter) or `.toml` (with description + prompt).
 *
 * We expose each as `/claude-<filename-stem>` to avoid colliding with our
 * `/skill-<name>` bridge or builtins.
 */
export function loadClaudePluginCommands(): Plugin[] {
  const base = join(homedir(), '.claude', 'plugins', 'marketplaces');
  if (!existsSync(base)) return [];
  const out: Plugin[] = [];

  // Walk to find all 'commands' dirs nested anywhere under marketplaces
  const commandDirs: string[] = [];
  const stack = [base];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: string[];
    try { entries = readdirSync(cur); } catch { continue; }
    for (const entry of entries) {
      const full = join(cur, entry);
      let stats;
      try { stats = statSync(full); } catch { continue; }
      if (stats.isDirectory()) {
        if (entry === 'commands') commandDirs.push(full);
        else if (entry !== 'node_modules' && entry !== '.git') stack.push(full);
      }
    }
  }

  for (const dir of commandDirs) {
    let files: string[];
    try { files = readdirSync(dir); } catch { continue; }
    for (const file of files) {
      if (!file.endsWith('.md') && !file.endsWith('.toml')) continue;
      const full = join(dir, file);
      const stem = file.replace(/\.(md|toml)$/, '');
      let description = '';
      let body = '';
      try {
        const content = readFileSync(full, 'utf8');
        if (file.endsWith('.toml')) {
          // Simple TOML: key = "..." lines
          const descMatch = content.match(/^description\s*=\s*"((?:[^"\\]|\\.)*)"/m);
          const promptMatch = content.match(/^prompt\s*=\s*"((?:[^"\\]|\\.)*)"/m);
          if (descMatch) description = descMatch[1]!.replace(/\\n/g, '\n').replace(/\\"/g, '"');
          if (promptMatch) body = promptMatch[1]!.replace(/\\n/g, '\n').replace(/\\"/g, '"');
        } else {
          const fmMatch = content.match(FRONTMATTER_RE);
          if (fmMatch) {
            const fm = parseFrontmatter(fmMatch[1]!);
            description = String(fm.description ?? '');
            body = (fmMatch[2] ?? '').trim();
          } else {
            body = content.trim();
          }
        }
      } catch { continue; }
      out.push({
        name: stem,
        command: `/claude-${stem}`,
        description: description.slice(0, 120),
        handler: 'prompt-prepend',
        body,
        filePath: full,
        source: 'claude-plugin-commands',
      });
    }
  }
  return out;
}

/**
 * Best-effort bridge: discover Codex plugins at ~/.codex/plugins.
 * Layout varies by codex version; we look for any directory containing a
 * plugin.md or .plugin.md file.
 */
export function loadCodexPlugins(): Plugin[] {
  const base = join(homedir(), '.codex', 'plugins');
  if (!existsSync(base)) return [];
  const out: Plugin[] = [];
  const mdFiles = walkMdFiles(base).filter((f) => {
    const n = basename(f).toLowerCase();
    return n === 'plugin.md' || n === 'codex-plugin.md' || n === 'readme.md';
  });
  for (const filePath of mdFiles) {
    let raw: string;
    try { raw = readFileSync(filePath, 'utf8'); } catch { continue; }
    const fm = parseFrontmatter(raw.match(FRONTMATTER_RE)?.[1] ?? '');
    const dirName = basename(filePath.replace(/\/[^/]+$/, ''));
    const name = String(fm.name ?? dirName);
    out.push({
      name,
      command: `/codex-${dirName}`,
      description: String(fm.description ?? '').slice(0, 120),
      handler: 'codex-plugin',
      codexPlugin: name,
      body: raw.match(FRONTMATTER_RE)?.[2]?.trim() ?? raw,
      filePath,
      source: 'codex-plugins',
    });
  }
  return out;
}

/** Aggregate loader — called once at TUI boot. Priority order per merge() below. */
export function loadAllPlugins(projectDir: string): Plugin[] {
  const userDir = join(homedir(), '.ccteam', 'plugins');
  const projectCcDir = join(projectDir, '.ccteam', 'plugins');
  return [
    ...loadPluginsFromDir(projectCcDir, 'project'),
    ...loadPluginsFromDir(userDir, 'user'),
    ...loadClaudeSkills(),
    ...loadClaudePluginCommands(),
    ...loadCodexPlugins(),
  ];
}
