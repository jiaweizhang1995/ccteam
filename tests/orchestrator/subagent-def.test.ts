import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSubagentDefs } from '../../src/orchestrator/subagent-defs.js';

describe('subagent-defs loader', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'agent-teams-test-'));
    mkdirSync(join(projectDir, '.agent-teams', 'agents'), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('loads a basic subagent def without frontmatter', () => {
    writeFileSync(
      join(projectDir, '.agent-teams', 'agents', 'security-reviewer.md'),
      'You are a security reviewer. Review code for vulnerabilities.',
    );

    const defs = loadSubagentDefs(projectDir);
    const def = defs.get('security-reviewer');
    expect(def).toBeDefined();
    expect(def?.name).toBe('security-reviewer');
    expect(def?.systemPrompt).toContain('security reviewer');
  });

  it('parses frontmatter fields: description, model, tools', () => {
    writeFileSync(
      join(projectDir, '.agent-teams', 'agents', 'coder.md'),
      [
        '---',
        'description: "Expert coder"',
        'model: claude-sonnet-4-6',
        'tools: [bash, read_file]',
        '---',
        '',
        'You are an expert coder. Write clean, tested code.',
      ].join('\n'),
    );

    const defs = loadSubagentDefs(projectDir);
    const def = defs.get('coder');
    expect(def?.description).toBe('Expert coder');
    expect(def?.model).toBe('claude-sonnet-4-6');
    expect(def?.tools).toEqual(['bash', 'read_file']);
    expect(def?.systemPrompt).toContain('expert coder');
  });

  it('returns empty map when no agents dir exists', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'empty-'));
    const defs = loadSubagentDefs(emptyDir);
    expect(defs.size).toBe(0);
    rmSync(emptyDir, { recursive: true, force: true });
  });

  it('project-scope overrides user-scope', () => {
    const userAgentsDir = join(tmpdir(), '.agent-teams-test', 'agents');
    mkdirSync(userAgentsDir, { recursive: true });
    writeFileSync(join(userAgentsDir, 'reviewer.md'), 'User-scope reviewer.');
    writeFileSync(join(projectDir, '.agent-teams', 'agents', 'reviewer.md'), 'Project-scope reviewer.');

    const defs = loadSubagentDefs(projectDir);
    const def = defs.get('reviewer');
    expect(def?.systemPrompt).toContain('Project-scope');
    rmSync(join(tmpdir(), '.agent-teams-test'), { recursive: true, force: true });
  });
});
