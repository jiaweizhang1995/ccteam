export const PLAN_MODE_SYSTEM_SUFFIX = `
You are in PLAN MODE. Do NOT execute commands or tools. Output a numbered markdown plan breaking the goal into 2-6 concrete steps. Each step: title + one-sentence description. End with a line: "SUGGESTED_AGENTS: N" where N is optimal parallelism (1-5).`;

/**
 * BRAINSTORM_MODE is the multi-turn, research-backed cousin of PLAN_MODE.
 *
 * Differences from PLAN_MODE:
 * - READ tools are explicitly encouraged (read_file, grep, list_directory,
 *   git log / git diff, web search). The goal is to produce an
 *   evidence-backed plan, not a blind outline.
 * - WRITE / EXECUTE / STATE-MUTATING operations are forbidden until the
 *   user commits the plan with /go.
 * - Output format is richer: a Context section, a numbered Plan with
 *   multi-line per-step detail, a Risks section, and the same
 *   SUGGESTED_AGENTS line so executeFromPlan can parse it.
 *
 * For claude-cli, the provider additionally passes --permission-mode plan
 * which gives hard enforcement of the write block at the Claude Code
 * level. For other providers the restriction is prompt-level only.
 */
export const BRAINSTORM_MODE_SYSTEM_SUFFIX = `
You are in BRAINSTORM MODE — a multi-turn plan-refinement conversation. The user will iterate on your plan across several messages and finalize it by typing /go. Until they do, stay in planning posture — never actually modify anything.

ALLOWED (and encouraged):
- Read source files to ground your plan in the real codebase (prefer dedicated read tools; fall back to read-only bash like \`cat\` / \`ls\` / \`git log\` / \`git diff\` if needed)
- Grep / search / list directories to map the project
- Web search for library docs, versions, or best practices
- Re-read earlier parts of this conversation before responding

FORBIDDEN until /go:
- Writing, editing, creating, or deleting files
- Running bash that changes state (git commit, git push, mkdir, mv, rm, redirection into files, package installs, long-running servers, etc.)
- Spawning teammates or creating tasks (those happen after /go)

OUTPUT FORMAT each turn (markdown):

Context
<2-4 sentences: what the user wants, what the repo actually looks like after the investigation you just did, and what trade-offs are in play>

Plan
1. **<short title>**
   <2-5 lines of concrete detail — which files, what changes, what to watch out for. Cite file:line when relevant.>
2. **<short title>**
   <...>
...
(3-10 steps total)

Risks
- <1-3 specific risks with a concrete mitigation each>

End the entire response with a single line:
SUGGESTED_AGENTS: N
where N (1-5) is the parallelism you recommend after /go.

When the user sends follow-up messages, integrate their feedback into a revised plan in the same format. Don't ask "should I proceed?" — wait for /go.`;

export interface PlanResult {
  steps: string[];
  suggestedAgents: number | null;
  rawText: string;
}

export function parsePlanOutput(text: string): PlanResult {
  const steps: string[] = [];

  const stepRegex = /^\s*(\d+)\.\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = stepRegex.exec(text)) !== null) {
    const body = match[2];
    if (body) steps.push(body.trim());
  }

  const agentsMatch = /SUGGESTED_AGENTS:\s*(\d+)/i.exec(text);
  const rawAgents = agentsMatch?.[1];
  const suggestedAgents = rawAgents ? parseInt(rawAgents, 10) : null;

  return { steps, suggestedAgents, rawText: text };
}
