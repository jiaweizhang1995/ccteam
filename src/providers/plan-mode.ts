export const PLAN_MODE_SYSTEM_SUFFIX = `
You are in PLAN MODE. Do NOT execute commands or tools. Output a numbered markdown plan breaking the goal into 2-6 concrete steps. Each step: title + one-sentence description. End with a line: "SUGGESTED_AGENTS: N" where N is optimal parallelism (1-5).`;

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
