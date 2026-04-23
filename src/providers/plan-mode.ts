export const PLAN_MODE_SYSTEM_SUFFIX = `
You are in PLAN MODE. Do NOT execute commands or tools. Output a numbered markdown plan breaking the goal into 2-6 concrete steps. Each step: title + one-sentence description. End with a line: "SUGGESTED_AGENTS: N" where N is optimal parallelism (1-5).`;

export function parsePlanOutput(text: string): {
  steps: string[];
  suggestedAgents: number | null;
} {
  const steps: string[] = [];

  // Extract numbered list items: lines starting with "1.", "2.", etc.
  const stepRegex = /^\s*(\d+)\.\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = stepRegex.exec(text)) !== null) {
    steps.push(match[2]!.trim());
  }

  // Extract SUGGESTED_AGENTS: N
  const agentsMatch = /SUGGESTED_AGENTS:\s*(\d+)/i.exec(text);
  const suggestedAgents = agentsMatch ? parseInt(agentsMatch[1]!, 10) : null;

  return { steps, suggestedAgents };
}
