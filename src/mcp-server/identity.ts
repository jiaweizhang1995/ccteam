/**
 * Resolves the connecting agent's identity.
 * Orchestrator sets AGENT_TEAMS_AGENT_ID and AGENT_TEAMS_AGENT_NAME at spawn time.
 */
export interface AgentIdentity {
  agentId: string;
  agentName: string;
  teamName: string;
  isLead: boolean;
}

export function resolveIdentity(): AgentIdentity {
  const agentId = process.env['AGENT_TEAMS_AGENT_ID'] ?? 'unknown';
  const agentName = process.env['AGENT_TEAMS_AGENT_NAME'] ?? 'unknown';
  const teamName = process.env['AGENT_TEAMS_TEAM_NAME'] ?? 'unknown';
  const isLead = process.env['AGENT_TEAMS_IS_LEAD'] === '1';
  return { agentId, agentName, teamName, isLead };
}
