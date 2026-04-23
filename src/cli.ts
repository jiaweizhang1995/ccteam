#!/usr/bin/env node
/**
 * agent-teams CLI entry point.
 * Wires subcommands to their handlers. Full implementations land per-milestone.
 */
import { Command } from 'commander';

const program = new Command();

program
  .name('agent-teams')
  .description('Provider-agnostic multi-agent CLI — shared task list + mailbox. Claude / OpenAI / Codex backends.')
  .version('0.1.0');

program
  .command('run [prompt...]')
  .description('Start an interactive team with an initial prompt')
  .option('--lead <provider-id>', 'override main-agent provider')
  .option('--teammate-provider <id>', 'default provider for spawned teammates')
  .option('--teammate-mode <mode>', 'in-process | tmux | auto', 'auto')
  .option('--team <name>', 'custom team name')
  .option('--dangerously-skip-permissions', 'skip permission prompts for tool calls')
  .action(async (_prompt: string[], _opts) => {
    const { runInteractive } = await import('./cli/run.js');
    await runInteractive(_prompt.join(' '), _opts);
  });

program
  .command('exec <prompt...>')
  .description('Non-interactive: stream JSONL events to stdout and exit on done')
  .option('--lead <provider-id>', 'override main-agent provider')
  .option('--teammate-provider <id>', 'default provider for spawned teammates')
  .option('--team <name>', 'custom team name')
  .option('--debug', 'print SDK request/response payloads (secrets redacted)')
  .option('--dangerously-skip-permissions', 'skip permission prompts for tool calls')
  .action(async (prompt: string[], opts) => {
    const { execMode } = await import('./exec/run.js');
    await execMode(prompt.join(' '), opts);
  });

program
  .command('list')
  .description('List active teams')
  .action(async () => {
    const { listTeams } = await import('./cli/list.js');
    await listTeams();
  });

program
  .command('attach <team>')
  .description('Reattach TUI to a running team')
  .action(async (team: string) => {
    const { attachTeam } = await import('./cli/attach.js');
    await attachTeam(team);
  });

program
  .command('cleanup <team>')
  .description('Force cleanup (fails if active teammates)')
  .option('--force', 'SIGKILL any surviving teammate workers')
  .action(async (team: string, opts) => {
    const { cleanupTeam } = await import('./cli/cleanup.js');
    await cleanupTeam(team, opts);
  });

program
  .command('auth <action> [provider]')
  .description('Manage provider auth (login | logout | status)')
  .action(async (action: string, provider?: string) => {
    const { auth } = await import('./cli/auth.js');
    await auth(action, provider);
  });

program
  .command('config')
  .description('Open config file in $EDITOR')
  .action(async () => {
    const { editConfig } = await import('./cli/config.js');
    await editConfig();
  });

program
  .command('providers')
  .description('List configured providers')
  .action(async () => {
    const { listProviders } = await import('./cli/providers.js');
    await listProviders();
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
