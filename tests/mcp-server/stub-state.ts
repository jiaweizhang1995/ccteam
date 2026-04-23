import type { StateFacade } from '../../src/mcp-server/state-facade.js';
import type { Teammate, Task, Message } from '../../src/types/index.js';

export type StubState = StateFacade & {
  messages: (Omit<Message, 'id' | 'delivered_at'> & { id: number })[];
  tasks: Map<string, Task>;
  teammates: Map<string, Teammate>;
};

export function makeStubState(overrides: Partial<StateFacade> = {}): StubState {
  const messages: StubState['messages'] = [];
  const tasks = new Map<string, Task>();
  const teammates = new Map<string, Teammate>();
  let msgId = 1;

  const base: StateFacade = {
    listTeammates(teamName) {
      return [...teammates.values()].filter((t) => t.team_name === teamName);
    },
    getTeammateByName(teamName, name) {
      return [...teammates.values()].find((t) => t.team_name === teamName && t.name === name);
    },
    listActiveTeammates(teamName) {
      return [...teammates.values()].filter(
        (t) => t.team_name === teamName && (t.status === 'active' || t.status === 'idle'),
      );
    },
    listTasks(teamName) {
      return [...tasks.values()].filter((t) => t.team_name === teamName);
    },
    listTasksByStatus(teamName, status) {
      return [...tasks.values()].filter((t) => t.team_name === teamName && t.status === status);
    },
    getTask(id) {
      return tasks.get(id);
    },
    createTask(task) {
      tasks.set(task.id, task);
    },
    async claimTask(taskId, _teamName, agentName) {
      const t = tasks.get(taskId);
      if (!t || t.status !== 'pending') return false;
      tasks.set(taskId, { ...t, status: 'in_progress', assigned_to: agentName, updated_at: Date.now() });
      return true;
    },
    completeTask(taskId, result) {
      const t = tasks.get(taskId);
      if (t) tasks.set(taskId, { ...t, status: 'completed', result, updated_at: Date.now() });
    },
    insertMessage(msg) {
      const id = msgId++;
      messages.push({ ...msg, id });
      return id;
    },
    getMessages(teamName, filter) {
      return messages
        .filter((m) => {
          if (m.team_name !== teamName) return false;
          if (filter?.fromAgent && m.from_agent !== filter.fromAgent) return false;
          if (filter?.toAgent && m.to_agent !== filter.toAgent) return false;
          if (filter?.kind && m.kind !== filter.kind) return false;
          return true;
        })
        .map((m) => ({ ...m, delivered_at: null }));
    },
  };

  return Object.assign(base, overrides, { messages, tasks, teammates }) as StubState;
}

export function addTeammate(
  stub: StubState,
  name: string,
  teamName = 'test-team',
  status: Teammate['status'] = 'active',
): void {
  stub.teammates.set(name, {
    id: `id-${name}`,
    team_name: teamName,
    name,
    agent_type: null,
    provider: 'claude-api',
    model: null,
    system_prompt: null,
    pid: null,
    pane_id: null,
    status,
    tools_allowlist: null,
  });
}

export function addTask(
  stub: StubState,
  id: string,
  title: string,
  teamName = 'test-team',
  status: Task['status'] = 'pending',
): void {
  const now = Date.now();
  stub.tasks.set(id, {
    id,
    team_name: teamName,
    title,
    description: null,
    status,
    assigned_to: null,
    claim_lock_owner: null,
    claim_lock_expires: null,
    depends_on: null,
    result: null,
    created_by: 'lead',
    created_at: now,
    updated_at: now,
  });
}
