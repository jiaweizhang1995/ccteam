/**
 * Live smoke: anthropic-oauth backend using stored Claude Code token.
 * Run: pnpm tsx tests/smoke/oauth-live.ts
 */
import { createBackend } from '../../src/providers/factory.js';
import type { AgentEvent } from '../../src/providers/types.js';

const backend = createBackend('smoke', { type: 'anthropic-oauth', model: 'claude-opus-4-7' });
const events: AgentEvent[] = [];
const ctrl = new AbortController();

console.log(`--- OAuth smoke ---\nbackend: ${backend.label}\n`);

const result = await backend.run({
  systemPrompt: 'Be terse.',
  messages: [{ role: 'user', content: 'respond with exactly: OAUTH_OK' }],
  tools: [],
  signal: ctrl.signal,
  onEvent: (e) => {
    events.push(e);
    if (e.type === 'text_delta') process.stdout.write(e.text);
    else if (e.type === 'done') console.log(`\n[done] ${e.stop_reason}`);
    else if (e.type === 'error') console.log(`\n[error] ${e.message}`);
  },
});

console.log(`\n---\nstop_reason=${result.stop_reason} text=${JSON.stringify(result.text)} events=${events.length}`);
if (result.error) { console.error('FAIL:', result.error); process.exit(1); }
if (!result.text.includes('OAUTH_OK')) { console.error('FAIL: OAUTH_OK missing'); process.exit(1); }
console.log('PASS');
await backend.shutdown();
