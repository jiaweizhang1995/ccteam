import { bootstrapPlugins } from '../../src/plugins/bootstrap.js';
const r = bootstrapPlugins(process.cwd());
const ralph = r.list().filter((p) => p.command.includes('ralph'));
console.log('Ralph-related commands:');
ralph.forEach((p) => console.log(`  ${p.command}  src=${p.source}  — ${p.description.slice(0, 80)}`));
