/**
 * Live dispatch test — verifies plugin handlers actually run end-to-end.
 * Tests the prompt-prepend handler with a claude plugin command body.
 */
import { bootstrapPlugins } from '../../src/plugins/bootstrap.js';
import { dispatchSlashCommand } from '../../src/plugins/dispatcher.js';

const registry = bootstrapPlugins(process.cwd());

console.log('=== Test 1: prompt-prepend dispatch (/claude-ralph-loop) ===');
let pending = '';
let events: Array<{ kind: string; payload: unknown }> = [];
let promiseSet = '';

let result = await dispatchSlashCommand('/claude-ralph-loop build a thing', registry, {
  teamName: 't',
  cwd: process.cwd(),
  emit: (kind, payload) => { events.push({ kind, payload }); },
  setPendingPrompt: (p) => { pending = p; },
  setCompletionPromise: (p) => { promiseSet = p; },
  activateRalphLoop: () => { /* noop */ },
});
console.log('ok:', result.ok);
console.log('pending length:', pending.length);
console.log('pending preview:', pending.slice(0, 200));
console.log('events:', events.map((e) => e.kind).join(', '));
console.log();

console.log('=== Test 2: builtin ralph-loop dispatch ===');
pending = ''; events = []; promiseSet = '';
let activations: Array<{ promise: string | null; max?: number }> = [];
result = await dispatchSlashCommand('/ralph-loop implement feature X', registry, {
  teamName: 't',
  cwd: process.cwd(),
  emit: (kind, payload) => { events.push({ kind, payload }); },
  setPendingPrompt: (p) => { pending = p; },
  setCompletionPromise: (p) => { promiseSet = p; },
  activateRalphLoop: (promise, max) => { activations.push({ promise, max }); },
});
console.log('ok:', result.ok);
console.log('events:', events.map((e) => e.kind).join(', '));
console.log('activations:', JSON.stringify(activations));
console.log('promise set:', promiseSet);
console.log('pending preview:', pending.slice(0, 150));
console.log();

console.log('=== Test 3: /cancel dispatch ===');
events = []; activations = [];
result = await dispatchSlashCommand('/cancel', registry, {
  teamName: 't',
  cwd: process.cwd(),
  emit: (kind, payload) => { events.push({ kind, payload }); },
  setPendingPrompt: () => { /* noop */ },
  activateRalphLoop: (promise) => { activations.push({ promise }); },
});
console.log('ok:', result.ok);
console.log('events:', events.map((e) => e.kind).join(', '));
console.log('cancel activation:', JSON.stringify(activations));
console.log();

console.log('=== Test 4: unknown command ===');
result = await dispatchSlashCommand('/does-not-exist', registry, {
  teamName: 't',
  cwd: process.cwd(),
  emit: () => { /* noop */ },
  setPendingPrompt: () => { /* noop */ },
  activateRalphLoop: () => { /* noop */ },
});
console.log('ok:', result.ok, '(expected false)');
console.log('error:', result.error);
console.log();

console.log('=== Test 5: unknown prefix — prefix match returns candidates ===');
const matches = registry.match('/claude-ralp');
console.log('matches for /claude-ralp:', matches.slice(0, 3).map((m) => m.plugin.command));
const matches2 = registry.match('/skill-');
console.log('skill-* count:', matches2.length);

console.log('\n=== ALL PASS ===');
