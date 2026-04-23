import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface SubagentDef {
  name: string;
  description?: string;
  model?: string;
  tools?: string[];
  systemPrompt: string;
}

interface Frontmatter {
  description?: string;
  model?: string;
  tools?: string[];
}

function parseFrontmatter(content: string): { meta: Frontmatter; body: string } {
  if (!content.startsWith('---')) {
    return { meta: {}, body: content };
  }
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: content };

  const yamlBlock = content.slice(3, end).trim();
  const body = content.slice(end + 4).trim();
  const meta: Frontmatter = {};

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (key === 'description') meta.description = val.replace(/^["']|["']$/g, '');
    else if (key === 'model') meta.model = val.replace(/^["']|["']$/g, '');
    else if (key === 'tools') {
      meta.tools = val.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
  }

  return { meta, body };
}

function loadDefsFromDir(dir: string): SubagentDef[] {
  if (!existsSync(dir)) return [];
  const defs: SubagentDef[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const name = file.slice(0, -3);
    const content = readFileSync(join(dir, file), 'utf8');
    const { meta, body } = parseFrontmatter(content);
    defs.push({
      name,
      description: meta.description,
      model: meta.model,
      tools: meta.tools,
      systemPrompt: body,
    });
  }
  return defs;
}

/** Load subagent defs from project and user scopes (parity with Claude Code) */
export function loadSubagentDefs(projectDir: string): Map<string, SubagentDef> {
  const defs = new Map<string, SubagentDef>();

  const projectAgentsDir = join(projectDir, '.agent-teams', 'agents');
  const userAgentsDir = join(homedir(), '.agent-teams', 'agents');

  for (const def of [...loadDefsFromDir(userAgentsDir), ...loadDefsFromDir(projectAgentsDir)]) {
    defs.set(def.name, def);
  }

  return defs;
}
