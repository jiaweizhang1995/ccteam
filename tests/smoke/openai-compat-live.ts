/**
 * Live smoke test for OpenAI-compat provider against a real endpoint.
 * Not part of the regular test suite — run manually:
 *   pnpm tsx tests/smoke/openai-compat-live.ts
 *
 * Requires OPENAI_BASE_URL + OPENAI_API_KEY (loaded from .env.local).
 */
import { readFileSync } from 'node:fs';
import { OpenAICompatBackend } from '../../src/providers/openai-compat-sdk.js';
import type { AgentEvent, ToolSpec } from '../../src/providers/types.js';

// Load .env.local
try {
  const env = readFileSync('.env.local', 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && m[1] && m[2] !== undefined) process.env[m[1]] = m[2];
  }
} catch { /* ignore */ }

const baseUrl = process.env['OPENAI_BASE_URL'];
const apiKey = process.env['OPENAI_API_KEY'];
const model = process.argv[2] ?? 'gpt-5-mini';

if (!baseUrl || !apiKey) {
  console.error('Missing OPENAI_BASE_URL or OPENAI_API_KEY');
  process.exit(1);
}

console.log(`Testing ${model} at ${baseUrl}\n`);

const backend = new OpenAICompatBackend('smoke', { apiKey, baseUrl, model, maxTokens: 512 });

const tools: ToolSpec[] = [
  {
    name: 'get_weather',
    description: 'Get current weather for a city',
    schema: {
      type: 'object',
      properties: { city: { type: 'string', description: 'City name' } },
      required: ['city'],
    },
  },
];

const events: AgentEvent[] = [];

console.log('--- Test 1: simple text ---');
const r1 = await backend.run({
  systemPrompt: 'Be concise.',
  messages: [{ role: 'user', content: 'Say "hello from agent-teams" and nothing else.' }],
  tools: [],
  signal: new AbortController().signal,
  onEvent: (e) => { events.push(e); if (e.type === 'text_delta') process.stdout.write(e.text); },
});
console.log(`\nstop_reason=${r1.stop_reason} text_len=${r1.text.length} tool_calls=${r1.tool_calls.length}`);
if (r1.error) { console.error('ERROR:', r1.error); process.exit(1); }

console.log('\n--- Test 2: tool-call ---');
events.length = 0;
const r2 = await backend.run({
  systemPrompt: 'Use tools when appropriate.',
  messages: [{ role: 'user', content: 'What is the weather in Tokyo? Use get_weather.' }],
  tools,
  signal: new AbortController().signal,
  onEvent: (e) => {
    events.push(e);
    if (e.type === 'text_delta') process.stdout.write(e.text);
    if (e.type === 'tool_call') console.log(`\n[tool_call ${e.name}] ${JSON.stringify(e.input)}`);
  },
});
console.log(`\nstop_reason=${r2.stop_reason} tool_calls=${r2.tool_calls.length}`);
if (r2.error) { console.error('ERROR:', r2.error); process.exit(1); }

console.log('\n--- PASS ---');
console.log(`Model ${model} streams text + emits tool_calls correctly via OpenAI-compat at ${baseUrl}`);

await backend.shutdown();
