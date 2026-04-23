/**
 * Live smoke test: our CodexCliBackend driving real `codex exec --json`
 * against the user's configured provider (hi_code at hi-code.cc).
 *
 *   pnpm tsx tests/smoke/codex-cli-live.ts
 */
import { CodexCliBackend } from '../../src/providers/codex-cli.js';
import type { AgentEvent } from '../../src/providers/types.js';

// Match user's ~/.codex/config.toml default (gpt-5.4 via hi_code provider)
const backend = new CodexCliBackend('smoke', { model: 'gpt-5.4' });

const events: AgentEvent[] = [];
const ctrl = new AbortController();

console.log('--- Codex CLI live smoke ---');
console.log(`provider: ${backend.label}\n`);

const result = await backend.run({
  systemPrompt: 'Be terse.',
  messages: [{ role: 'user', content: 'respond with exactly: SMOKE_OK' }],
  tools: [],
  signal: ctrl.signal,
  onEvent: (e) => {
    events.push(e);
    if (e.type === 'text_delta') process.stdout.write(e.text);
    else if (e.type === 'tool_call') console.log(`\n[tool_call] ${e.name} ${JSON.stringify(e.input).slice(0, 80)}`);
    else if (e.type === 'tool_result') console.log(`\n[tool_result] ${e.content.slice(0, 80)}`);
    else if (e.type === 'done') console.log(`\n[done] ${e.stop_reason}`);
    else if (e.type === 'error') console.log(`\n[error] ${e.message}`);
  },
});

console.log('\n---');
console.log(`stop_reason=${result.stop_reason}`);
console.log(`text_len=${result.text.length}`);
console.log(`tool_calls=${result.tool_calls.length}`);
console.log(`events=${events.length}`);
if (result.error) {
  console.error(`ERROR: ${result.error}`);
  process.exit(1);
}
if (!result.text.includes('SMOKE_OK')) {
  console.error('FAIL: expected SMOKE_OK in response');
  process.exit(1);
}
console.log('\nPASS — codex-cli provider works end-to-end against user endpoint');
await backend.shutdown();
