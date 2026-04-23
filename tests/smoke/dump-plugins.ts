import { bootstrapPlugins } from '../../src/plugins/bootstrap.js';

const r = bootstrapPlugins(process.cwd());
const all = r.list();
console.log(`Total registered: ${all.length}\n`);

const bySource = new Map<string, number>();
for (const p of all) bySource.set(p.source ?? 'unknown', (bySource.get(p.source ?? 'unknown') ?? 0) + 1);
console.log('By source:');
for (const [src, n] of bySource) console.log(`  ${src}: ${n}`);

console.log('\n/claude-* commands (first 10):');
all.filter((p) => p.command.startsWith('/claude-')).slice(0, 10).forEach((p) =>
  console.log(`  ${p.command}  — ${p.description.slice(0, 70)}`));

console.log('\nBuiltins:');
all.filter((p) => p.source === 'builtin').forEach((p) =>
  console.log(`  ${p.command}  — ${p.description.slice(0, 70)}`));

console.log('\nPrefix match /pl:');
r.match('/pl').slice(0, 3).forEach((m) => console.log(`  ${m.plugin.command}`));

console.log('\nPrefix match /ralp:');
r.match('/ralp').slice(0, 3).forEach((m) => console.log(`  ${m.plugin.command}`));
