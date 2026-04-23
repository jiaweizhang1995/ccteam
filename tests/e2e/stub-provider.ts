// Stub provider for e2e tests — returns canned responses without hitting any real API.
// Replace real AgentBackend with this in e2e test setup once orchestrator (#5) lands.

import type { AgentBackend, AgentEvent, AgentTurnResult, ChatMessage, ToolSpec } from '../../src/providers/types.js';

export interface CannedTurn {
  text?: string;
  toolCalls?: Array<{
    name: string;
    input: Record<string, unknown>;
    result: string;
  }>;
}

export class StubProvider implements AgentBackend {
  readonly id: string;
  readonly label: string;
  readonly model = 'stub-model';

  private turns: CannedTurn[];
  private turnIndex = 0;

  constructor(id: string, turns: CannedTurn[]) {
    this.id = id;
    this.label = `Stub (${id})`;
    this.turns = turns;
  }

  async run(opts: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolSpec[];
    signal: AbortSignal;
    onEvent(e: AgentEvent): void;
  }): Promise<AgentTurnResult> {
    const turn = this.turns[this.turnIndex % this.turns.length] ?? { text: '' };
    this.turnIndex++;

    let text = '';
    const toolCalls: AgentTurnResult['tool_calls'] = [];

    if (turn.text) {
      text = turn.text;
      opts.onEvent({ type: 'text_delta', text: turn.text });
    }

    for (const tc of turn.toolCalls ?? []) {
      const id = `stub_${Date.now()}_${tc.name}`;
      toolCalls.push({ id, name: tc.name, input: tc.input });
      opts.onEvent({ type: 'tool_call', id, name: tc.name, input: tc.input });
      opts.onEvent({ type: 'tool_result', tool_use_id: id, content: tc.result, is_error: false });
    }

    opts.onEvent({ type: 'done', stop_reason: 'end_turn' });

    return { stop_reason: 'end_turn', text, tool_calls: toolCalls };
  }

  async shutdown(): Promise<void> {}
}
