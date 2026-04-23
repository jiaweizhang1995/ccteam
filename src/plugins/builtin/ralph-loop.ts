import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin, BuiltinHandler } from '../types.js';

/**
 * Ralph Loop — runs the current task in a self-referential loop until the
 * agent outputs `<promise>DONE</promise>` (or a custom completion promise).
 *
 * Mechanic: writes the task to .ccteam/ralph/state.md in the project dir
 * on first invocation. Each subsequent iteration reads back that state so
 * the agent sees its own prior work.
 *
 * This is a lightweight port of the claude-code ralph-loop idea — we can't
 * install stop-hooks in this CLI's runtime the same way Claude Code does,
 * so the loop is driver-based: the caller (TUI or exec) re-issues the task
 * until the promise string appears in the final agent output.
 *
 * For v1 we just scaffold the state file + emit a `ralph_loop_started`
 * event + set the pending prompt. The actual looping belongs to the
 * TUI / exec driver which owns the agent turn lifecycle.
 */
export const RALPH_LOOP_PLUGIN: Plugin = {
  name: 'ralph-loop',
  command: '/ralph-loop',
  description: 'Self-referential loop: repeat task until <promise>DONE</promise> is emitted',
  handler: 'builtin',
  builtinKey: 'ralph-loop',
  completionPromise: 'DONE',
  body: '',
  source: 'builtin',
};

function statePath(projectDir: string): string {
  const dir = join(projectDir, '.ccteam', 'ralph');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'state.md');
}

export const ralphLoopBuiltin: BuiltinHandler = async (ctx) => {
  if (!ctx.args.trim()) {
    ctx.emit('plugin_output', {
      stream: 'stderr',
      text: '[/ralph-loop] usage: /ralph-loop <task description>',
    });
    return;
  }

  const sp = statePath(ctx.cwd);
  const iteration = existsSync(sp)
    ? parseIteration(readFileSync(sp, 'utf8')) + 1
    : 1;

  const state = `---
task_started: ${new Date().toISOString()}
iteration: ${iteration}
completion_promise: <promise>DONE</promise>
---

# Ralph Loop — iteration ${iteration}

Task:
${ctx.args}

Previous iterations recorded in git history for this file.

Rules for you (the agent):
1. Make progress on the task above.
2. Only output \`<promise>DONE</promise>\` when the task is completely and unequivocally finished.
3. Do not output a false promise to exit the loop early — the caller will detect it.
4. On each iteration, read this file plus recent git history of .ccteam/ralph/state.md to understand prior progress.
`;
  writeFileSync(sp, state, 'utf8');

  ctx.emit('ralph_loop_started', {
    iteration,
    task: ctx.args,
    statePath: sp,
    completionPromise: 'DONE',
  });

  if (ctx.setCompletionPromise) {
    ctx.setCompletionPromise('<promise>DONE</promise>');
  }

  // Activate the runtime loop on TeamLead so it auto-iterates until promise.
  // When activateRalphLoop is not wired (e.g. exec mode), this is a no-op and
  // the loop falls back to single-shot + state-file tracking.
  ctx.activateRalphLoop?.('<promise>DONE</promise>', 20);

  // Feed the composed prompt to the agent to kick off iteration 1.
  ctx.setPendingPrompt(`${state}\n\nContinue work on the task above.`);
};

function parseIteration(s: string): number {
  const m = s.match(/^iteration:\s*(\d+)/m);
  return m ? parseInt(m[1]!, 10) : 0;
}
