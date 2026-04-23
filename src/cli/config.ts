import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

export async function editConfig(): Promise<void> {
  const configPath = join(homedir(), '.agent-teams', 'config.json');
  if (!existsSync(configPath)) {
    mkdirSync(join(homedir(), '.agent-teams'), { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      providers: {},
      defaults: { lead: 'claude-oauth', teammate: 'claude-oauth' },
      teammateMode: 'auto',
      hooks: { TeammateIdle: null, TaskCreated: null, TaskCompleted: null },
    }, null, 2));
  }
  const editor = process.env['EDITOR'] ?? 'vi';
  spawnSync(editor, [configPath], { stdio: 'inherit' });
}
