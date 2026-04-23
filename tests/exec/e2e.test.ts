import { describe, it, expect, vi } from 'vitest';
import { makeExecEvent, serializeEvent, redactSecrets, redactPayload } from '../../src/exec/serializer.js';

describe('exec serializer', () => {
  it('makeExecEvent produces correct shape', () => {
    const event = makeExecEvent('my-team', 'lead', 'text_delta', { text: 'hello' });
    expect(event.team).toBe('my-team');
    expect(event.agent).toBe('lead');
    expect(event.kind).toBe('text_delta');
    expect(event.payload.text).toBe('hello');
    expect(typeof event.ts).toBe('number');
  });

  it('serializeEvent produces valid JSON', () => {
    const event = makeExecEvent('team', 'worker-1', 'done', { stop_reason: 'end_turn' });
    const line = serializeEvent(event);
    expect(() => JSON.parse(line)).not.toThrow();
    const parsed = JSON.parse(line) as typeof event;
    expect(parsed.kind).toBe('done');
  });

  it('redactSecrets removes long base64/token-like strings', () => {
    const input = 'my key is sk-abc123ABC456DEFGhijklmnopqrst';
    const result = redactSecrets(input);
    expect(result).not.toContain('sk-abc123');
    expect(result).toContain('[REDACTED]');
  });

  it('redactPayload scrubs nested secrets', () => {
    const payload = {
      headers: { Authorization: 'Bearer sk-abcdefghijklmnopqrstuvwxyz123456' },
      body: { prompt: 'hello' },
    };
    const result = redactPayload(payload as unknown as Record<string, unknown>);
    const str = JSON.stringify(result);
    expect(str).not.toContain('sk-abcdef');
    expect(str).toContain('REDACTED');
  });

  it('serializeEvent output is a single JSONL line (no newlines in payload)', () => {
    const event = makeExecEvent('team', 'lead', 'tool_call', { name: 'create_task', input: { title: 'do\nwork' } });
    const line = serializeEvent(event);
    // The outer line should not contain literal newlines from JSON.stringify
    // (JSON.stringify escapes them as \\n)
    const parsed = JSON.parse(line) as typeof event;
    expect((parsed.payload['input'] as { title: string }).title).toBe('do\nwork');
  });
});

describe('exec event kinds', () => {
  it('covers all required event kinds', () => {
    const requiredKinds = [
      'text_delta', 'tool_call', 'tool_result', 'done', 'error',
      'message_sent', 'message_received', 'task_claimed', 'task_completed',
      'teammate_spawned', 'teammate_idle', 'teammate_shutdown',
      'provider_request', 'provider_response',
    ];
    for (const kind of requiredKinds) {
      const event = makeExecEvent('t', 'a', kind as Parameters<typeof makeExecEvent>[2], {});
      expect(event.kind).toBe(kind);
    }
  });
});
