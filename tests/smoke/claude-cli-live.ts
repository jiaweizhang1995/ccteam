/**
 * Live smoke test: ClaudeCliBackend driving real `claude -p --output-format json`
 * against the user's local Claude Code OAuth session (macOS keychain auth).
 *
 *   npx tsx tests/smoke/claude-cli-live.ts
 */
import { ClaudeCliBackend } from '../../src/providers/claude-cli.js';
import type { AgentEvent } from '../../src/providers/types.js';

const backend = new ClaudeCliBackend('smoke', {});

const events: AgentEvent[] = [];
const ctrl = new AbortController();

console.log('--- Claude CLI live smoke ---');
console.log(`provider: ${backend.label}\n`);

const result = await backend.run({
  systemPrompt: '',
  messages: [{ role: 'user', content: 'respond with exactly: CLAUDE_CLI_OK' }],
  tools: [],
  signal: ctrl.signal,
  onEvent: (e) => {
    events.push(e);
    if (e.type === 'text_delta') process.stdout.write(e.text);
    else if (e.type === 'done') console.log(`\n[done] ${e.stop_reason}`);
    else if (e.type === 'error') console.log(`\n[error] ${e.message}`);
  },
});

console.log('\n---');
console.log(`stop_reason=${result.stop_reason}  text_len=${result.text.length}  events=${events.length}`);

if (result.error) {
  console.error(`ERROR: ${result.error}`);
  process.exit(1);
}
if (!result.text.includes('CLAUDE_CLI_OK')) {
  console.error(`FAIL: expected CLAUDE_CLI_OK in response, got: ${JSON.stringify(result.text)}`);
  process.exit(1);
}
console.log('\nPASS — claude-cli provider works end-to-end via OAuth session');
await backend.shutdown();
