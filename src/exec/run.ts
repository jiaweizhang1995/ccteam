import { makeExecEvent, serializeEvent } from './serializer.js';
import type { ExecEventKind } from './serializer.js';

export interface ExecOptions {
  lead?: string;
  teammateProvider?: string;
  team?: string;
  debug?: boolean;
  dangerouslySkipPermissions?: boolean;
}

function emit(team: string, agent: string, kind: ExecEventKind, payload: Record<string, unknown>): void {
  process.stdout.write(serializeEvent(makeExecEvent(team, agent, kind, payload)) + '\n');
}

export async function execMode(prompt: string, opts: ExecOptions): Promise<void> {
  // TeamLead is implemented in M4 (orchestrator). Dynamic import so this file compiles
  // before the orchestrator exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { TeamLead } = await import('../orchestrator/lead.js') as any;

  const teamName = opts.team ?? slugify(prompt);

  const lead = new TeamLead({
    teamName,
    prompt,
    leadProvider: opts.lead,
    teammateProvider: opts.teammateProvider,
    dangerouslySkipPermissions: opts.dangerouslySkipPermissions ?? false,
    debug: opts.debug ?? false,
    onEvent(agent: string, kind: string, payload: Record<string, unknown>) {
      emit(teamName, agent, kind as ExecEventKind, payload);
    },
  });

  let exitCode = 0;

  try {
    await lead.run();
  } catch (err) {
    emit(teamName, 'lead', 'error', { message: err instanceof Error ? err.message : String(err) });
    exitCode = 1;
  } finally {
    await lead.shutdown();
  }

  process.exit(exitCode);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'team';
}
