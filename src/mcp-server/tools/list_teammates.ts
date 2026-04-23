import type { StateFacade } from '../state-facade.js';
import type { AgentIdentity } from '../identity.js';

export function makeListTeammatesHandler(state: StateFacade, identity: AgentIdentity) {
  return async () => {
    const teammates = state.listTeammates(identity.teamName);
    const rows = teammates.map((t) => ({
      name: t.name,
      provider: t.provider,
      model: t.model,
      status: t.status,
      agent_type: t.agent_type,
    }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] };
  };
}
