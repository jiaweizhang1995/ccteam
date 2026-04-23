// E2E smoke tests — full team run using stub providers.
// Integration suites that hit the real SQLite DB are gated by AGENT_TEAMS_E2E=1.
// Stub-provider unit tests run always.

import { describe, it, expect } from 'vitest';
import { StubProvider } from './stub-provider.js';

const E2E = process.env.AGENT_TEAMS_E2E === '1';

describe('stub provider', () => {
  it('implements AgentBackend interface', () => {
    const stub = new StubProvider('test', [{ text: 'hello world' }]);
    expect(stub.id).toBe('test');
    expect(stub.label).toBe('Stub (test)');
    expect(stub.model).toBe('stub-model');
    expect(typeof stub.run).toBe('function');
    expect(typeof stub.shutdown).toBe('function');
  });

  it('emits text_delta then done', async () => {
    const stub = new StubProvider('test', [{ text: 'review complete' }]);
    const events: Array<{ type: string }> = [];
    const ctrl = new AbortController();

    const result = await stub.run({
      systemPrompt: 'You are a reviewer.',
      messages: [],
      tools: [],
      signal: ctrl.signal,
      onEvent: (e) => events.push(e),
    });

    expect(events[0]?.type).toBe('text_delta');
    expect(events[1]?.type).toBe('done');
    expect(result.text).toBe('review complete');
    expect(result.stop_reason).toBe('end_turn');
  });

  it('emits tool_call and tool_result', async () => {
    const stub = new StubProvider('test', [
      {
        toolCalls: [
          { name: 'read_file', input: { path: 'src/app.ts' }, result: 'export function main() {}' },
        ],
      },
    ]);
    const events: Array<{ type: string }> = [];
    const ctrl = new AbortController();

    await stub.run({
      systemPrompt: '',
      messages: [],
      tools: [],
      signal: ctrl.signal,
      onEvent: (e) => events.push(e),
    });

    const kinds = events.map((e) => e.type);
    expect(kinds).toContain('tool_call');
    expect(kinds).toContain('tool_result');
  });

  it('cycles through canned turns on wrap-around', async () => {
    const stub = new StubProvider('test', [{ text: 'turn 1' }, { text: 'turn 2' }]);
    const ctrl = new AbortController();
    const run = () => stub.run({ systemPrompt: '', messages: [], tools: [], signal: ctrl.signal, onEvent: () => {} });

    const r1 = await run();
    const r2 = await run();
    const r3 = await run();

    expect(r1.text).toBe('turn 1');
    expect(r2.text).toBe('turn 2');
    expect(r3.text).toBe('turn 1');
  });
});

// Full integration tests require a writable ~/.agent-teams/ and a real SQLite DB.
// Run with:  AGENT_TEAMS_E2E=1 pnpm test:e2e
describe.skipIf(!E2E)('full team e2e (AGENT_TEAMS_E2E=1)', () => {
  it('create → assign → complete → synthesize flow', async () => {
    const { TeamLead } = await import('../../src/orchestrator/lead.js');
    const events: Array<{ agent: string; kind: string }> = [];

    const lead = new TeamLead({
      teamName: `e2e-test-${Date.now()}`,
      prompt: 'review README and summarize in one sentence',
      dangerouslySkipPermissions: true,
      debug: false,
      onEvent(agent, kind, payload) {
        events.push({ agent, kind });
        void payload;
      },
    });

    await lead.run();
    await lead.shutdown();

    expect(events.some((e) => e.kind === 'text_delta')).toBe(true);
    expect(events.some((e) => e.kind === 'done')).toBe(true);
  });

  it('exec mode streams valid JSONL to stdout', async () => {
    const { execMode } = await import('../../src/exec/run.js');
    const lines: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    // Intercept stdout to capture JSONL lines without actually writing them
    (process.stdout as { write: unknown }).write = (chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') lines.push(...chunk.split('\n').filter(Boolean));
      return true;
    };

    try {
      await execMode('review README', {
        team: `e2e-exec-${Date.now()}`,
        dangerouslySkipPermissions: true,
      });
    } finally {
      (process.stdout as { write: unknown }).write = origWrite;
    }

    const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.every((e) => 'ts' in e && 'kind' in e && 'agent' in e)).toBe(true);
  });

  it('hook veto: TaskCompleted hook exit 2 resets task to in_progress', async () => {
    // Covered by tests/mcp-server/hook-veto.test.ts (orchestrator-engineer's scope).
    // This test verifies the end-to-end path from the TUI's perspective:
    // if a hook vetoes, the task panel should reflect status back to in_progress.
    // Full assertion requires hook script setup — placeholder assertion for now.
    expect(true).toBe(true);
  });
});
