/**
 * Live smoke: spawn mcp-bridge.ts and verify tools/list returns team tools.
 * Run: pnpm tsx tests/smoke/bridge-live.ts
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const bridgePath = join(process.cwd(), 'src/mcp-bridge.ts');
const tsxBin = join(process.cwd(), 'node_modules/.bin/tsx');

const p = spawn(tsxBin, [bridgePath], {
  env: {
    ...process.env,
    AGENT_TEAMS_TEAM_NAME: 'bridge-test',
    AGENT_TEAMS_AGENT_NAME: 'lead',
    AGENT_TEAMS_AGENT_ID: 'test-lead',
    AGENT_TEAMS_IS_LEAD: '1',
  },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buf = '';
p.stdout.on('data', (d) => { buf += d.toString(); });

p.on('exit', () => {
  console.log('--- raw stdout ---');
  console.log(buf);
  const lines = buf.split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.id === 2 && msg.result?.tools) {
        console.log(`\n--- PASS: ${msg.result.tools.length} tools listed ---`);
        for (const t of msg.result.tools) console.log(`  • ${t.name}`);
        process.exit(0);
      }
    } catch { /* not JSON */ }
  }
  console.error('FAIL: no tools/list response received');
  process.exit(1);
});

// MCP handshake
const initMsg = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } } };
const listMsg = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };

p.stdin.write(JSON.stringify(initMsg) + '\n');
setTimeout(() => {
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
  p.stdin.write(JSON.stringify(listMsg) + '\n');
  setTimeout(() => p.kill(), 1500);
}, 500);
