import { join } from 'node:path';
import { homedir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { State } from '../state/index.js';
import { createBackend } from '../providers/factory.js';
import { createInProcessServer } from '../mcp-server/server.js';
import { StateAdapter } from '../mcp-server/state-adapter.js';
import { killAllTeammates, cleanupOrphans } from './orphan-cleanup.js';
import { resolvePermissionMode, type PermissionMode } from './permissions.js';
import { loadSubagentDefs } from './subagent-defs.js';
import { loadConfig } from '../config/loader.js';
import { writeMcpConfigForProvider, getCodexMcpOverrides } from './mcp-config-writer.js';
import { parsePlanOutput } from '../providers/plan-mode.js';
import type { AgentBackend, AgentEvent, ChatMessage, ToolSpec } from '../providers/types.js';

export interface PlanResult {
  steps: string[];
  suggestedAgents: number | null;
  rawText: string;
}

export interface TeamLeadOpts {
  teamName: string;
  prompt: string;
  leadProvider?: string;
  teammateProvider?: string;
  dangerouslySkipPermissions: boolean;
  debug: boolean;
  onEvent: (agent: string, kind: string, payload: Record<string, unknown>) => void;
  workingDir?: string;
}

function extractToolResultText(content: unknown): string {
  if (!Array.isArray(content)) return String(content);
  return (content as Array<{ type: string; text?: string }>)
    .map((c) => (c.type === 'text' ? (c.text ?? '') : c.type === 'image' ? '[image]' : ''))
    .join('');
}

export class TeamLead {
  private state!: State;
  private opts: TeamLeadOpts;
  private controller = new AbortController();
  private conversation: ChatMessage[] = [];
  private mcpCleanup?: () => Promise<void>;
  private backend!: AgentBackend;
  private permissionMode!: PermissionMode;
  private teammateProviderId!: string;
  /** Ralph-loop mode: when non-null, lead keeps iterating until this string appears in output. */
  private ralphPromise: string | null = null;
  private ralphIteration = 0;
  private ralphMaxIterations = 20;

  /**
   * Brainstorm (multi-turn plan-refinement) mode.
   *
   * Independent of the main `run()` conversation: each brainstorm turn is a
   * fresh `backend.run({planMode: true})` call whose messages live in
   * `brainstormConversation`. After `/go`, `brainstormLatest` is handed to
   * `executeFromPlan` and the state is cleared.
   *
   * Kept separate from `this.conversation` so committing or abandoning a
   * brainstorm does not pollute the main agent's context.
   */
  private brainstormActive = false;
  private brainstormConversation: ChatMessage[] = [];
  private brainstormLatest: PlanResult | null = null;

  constructor(opts: TeamLeadOpts) {
    this.opts = opts;
  }

  /** Activate ralph-loop. Lead keeps going until promise appears or max hit. */
  setRalphPromise(promise: string | null, maxIterations = 20): void {
    this.ralphPromise = promise;
    this.ralphMaxIterations = maxIterations;
    this.ralphIteration = 0;
    if (promise) this.opts.onEvent('lead', 'ralph_loop_active', { promise, maxIterations });
  }

  async run(): Promise<void> {
    const dbPath = join(homedir(), '.agent-teams', 'state.db');
    this.state = new State(dbPath);

    const workingDir = this.opts.workingDir ?? process.cwd();
    this.permissionMode = resolvePermissionMode({ dangerouslySkipPermissions: this.opts.dangerouslySkipPermissions });
    const permissionMode = this.permissionMode;

    cleanupOrphans(this.state, this.opts.teamName);

    const config = loadConfig(workingDir);
    const leadProviderId = this.opts.leadProvider ?? config.defaults.lead ?? 'claude-oauth';
    this.teammateProviderId = this.opts.teammateProvider ?? config.defaults.teammate ?? leadProviderId;
    const teammateProviderId = this.teammateProviderId;
    const leadProviderConfigBase = config.providers.get(leadProviderId) ?? { type: leadProviderId as 'anthropic-oauth' };

    const leadSessionId = uuidv4();

    // Write MCP bridge config if lead uses a CLI-backed provider
    const leadBridgeIdentity = {
      teamName: this.opts.teamName,
      agentName: 'lead',
      agentId: leadSessionId,
      isLead: true,
    };
    const leadMcpConfigPath = writeMcpConfigForProvider(leadProviderId, leadBridgeIdentity);
    let leadProviderConfig = leadMcpConfigPath
      ? { ...leadProviderConfigBase, mcpConfigPath: leadMcpConfigPath }
      : leadProviderConfigBase;
    // codex doesn't accept a full mcp-config file — pass inline -c overrides instead.
    if ((leadProviderConfigBase as { type?: string }).type === 'codex-cli') {
      leadProviderConfig = { ...leadProviderConfig, mcpOverrides: getCodexMcpOverrides(leadBridgeIdentity) };
    }

    const existing = this.state.getTeam(this.opts.teamName);
    if (!existing) {
      this.state.createTeam({
        name: this.opts.teamName,
        created_at: Date.now(),
        lead_session_id: leadSessionId,
        lead_provider: leadProviderId,
        permission_mode: permissionMode,
        working_dir: workingDir,
        status: 'active',
      });
    }

    const identity = {
      agentId: leadSessionId,
      agentName: 'lead',
      teamName: this.opts.teamName,
      isLead: true,
    };

    const adapter = new StateAdapter(this.state, this.opts.teamName);

    // Pass state + spawn helpers to MCP server for spawn_teammate tool
    const spawnContext = {
      state: this.state,
      teamName: this.opts.teamName,
      teammateProviderId,
      permissionMode,
      config,
      subagentDefs: loadSubagentDefs(workingDir),
    };

    const { client: mcpClient, cleanup } = await createInProcessServer(adapter, identity, spawnContext);
    this.mcpCleanup = cleanup;

    const tools = await mcpClient.listTools();
    const toolSpecs: ToolSpec[] = (tools.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? '',
      schema: {
        type: 'object' as const,
        properties: (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {},
        required: (t.inputSchema as { required?: string[] }).required,
      },
    }));

    this.backend = createBackend('lead', leadProviderConfig);
    const backend = this.backend;

    const systemPrompt = `You are the team lead for team "${this.opts.teamName}". Coordinate your teammates using the available tools. Use spawn_teammate to create teammates, create tasks for them to claim, monitor progress via list_tasks and list_teammates, and synthesize a final result when all tasks are complete. Be concise and efficient.`;

    const notifier = this.state.startNotifier(this.opts.teamName);

    notifier.on('message', (e) => {
      const msg = e.message;
      this.opts.onEvent('lead', 'message_received', { from: msg.from_agent, kind: msg.kind, body: msg.body });

      // spawn_request addressed to 'orchestrator' — orchestrator IS the lead process
      if (msg.kind === 'spawn_request' && (msg.to_agent === 'orchestrator' || msg.to_agent === 'lead')) {
        const body = JSON.parse(msg.body) as {
          name?: string; provider?: string; model?: string; system_prompt?: string;
          agent_type?: string; tools?: string[]; request_id?: string;
        };
        const requestId = body.request_id ?? '';

        const handleSpawnRequest = async () => {
          try {
            const name = body.name;
            if (!name) throw new Error('spawn_request missing name');

            const { spawnTeammate } = await import('./spawn.js');
            const providerId = body.provider ?? spawnContext.teammateProviderId;
            let systemPrompt = body.system_prompt;

            if (body.agent_type) {
              const def = spawnContext.subagentDefs.get(body.agent_type);
              if (def && !body.system_prompt && def.description) {
                systemPrompt = `You are ${name}. ${def.description}`;
              }
            }

            const spawned = await spawnTeammate(this.state, {
              teamName: this.opts.teamName,
              name,
              provider: providerId,
              model: body.model,
              systemPrompt,
              agentType: body.agent_type,
              toolsAllowlist: body.tools,
              permissionMode,
            });

            this.state.appendEvent({
              team_name: this.opts.teamName,
              agent: 'orchestrator',
              kind: 'teammate_spawned',
              payload: JSON.stringify({ name, id: spawned.id, provider: providerId, status: 'spawning' }),
              created_at: Date.now(),
            });

            this.state.insertMessage({
              team_name: this.opts.teamName,
              from_agent: 'orchestrator',
              to_agent: msg.from_agent,
              kind: 'spawn_response',
              body: JSON.stringify({ request_id: requestId, teammate_id: spawned.id, status: 'spawning' }),
              created_at: Date.now(),
            });
          } catch (err) {
            this.state.insertMessage({
              team_name: this.opts.teamName,
              from_agent: 'orchestrator',
              to_agent: msg.from_agent,
              kind: 'spawn_response',
              body: JSON.stringify({ request_id: requestId, error: err instanceof Error ? err.message : String(err) }),
              created_at: Date.now(),
            });
          }
        };

        handleSpawnRequest().catch(() => {});
        return;
      }

      if (msg.to_agent !== 'lead') return;
      const body = JSON.parse(msg.body) as { text?: string; plan?: string; request_id?: string };

      if (msg.kind === 'plan_request') {
        // Surface plan_request as a user turn so lead naturally responds with decide_plan
        const planText = body.plan ?? JSON.stringify(body);
        this.conversation.push({
          role: 'user',
          content: `[${msg.from_agent} submitted a plan for approval (request_id: ${body.request_id ?? 'n/a'})]: ${planText}\nUse the decide_plan tool to approve or reject.`,
        });
      } else {
        const text = body.text ?? JSON.stringify(body);
        this.conversation.push({
          role: 'user',
          content: `[From ${msg.from_agent} (${msg.kind})]: ${text}`,
        });
      }
    });

    this.conversation.push({ role: 'user', content: this.opts.prompt });

    // CLI-subprocess providers (codex-cli / claude-cli) run their own complete
    // tool-use loop internally and call team tools via the MCP bridge. Our
    // orchestrator must NOT re-dispatch their tool_calls (double-execution).
    // For these providers, a single backend.run() invocation = one complete turn.
    const isCliSubprocessLead =
      (leadProviderConfigBase as { type?: string }).type === 'codex-cli' ||
      (leadProviderConfigBase as { type?: string }).type === 'claude-cli';

    while (!this.controller.signal.aborted) {
      const onEvent = (e: AgentEvent) => {
        this.opts.onEvent('lead', e.type, e as unknown as Record<string, unknown>);
      };

      const result = await backend.run({
        systemPrompt,
        messages: this.conversation,
        tools: isCliSubprocessLead ? [] : toolSpecs,
        signal: this.controller.signal,
        onEvent,
      });

      if (result.error) {
        this.opts.onEvent('lead', 'error', { message: result.error });
        break;
      }

      // For CLI-subprocess leads, the subprocess handled its own tool loop.
      // Surface any text and exit after one turn — unless ralph-loop is active.
      if (isCliSubprocessLead) {
        if (result.text) {
          this.conversation.push({ role: 'assistant', content: result.text });
        }
        this.opts.onEvent('lead', 'done', { stop_reason: result.stop_reason });

        if (this.ralphPromise && result.text && result.text.includes(this.ralphPromise)) {
          this.opts.onEvent('lead', 'ralph_completed', {
            promise: this.ralphPromise,
            iteration: this.ralphIteration,
          });
          this.state.appendEvent({
            team_name: this.opts.teamName, agent: 'lead', kind: 'ralph_completed',
            payload: JSON.stringify({ promise: this.ralphPromise, iteration: this.ralphIteration }),
            created_at: Date.now(),
          });
          this.ralphPromise = null;
          break;
        }
        if (this.ralphPromise) {
          this.ralphIteration++;
          if (this.ralphIteration >= this.ralphMaxIterations) {
            this.opts.onEvent('lead', 'ralph_max_iterations', {
              promise: this.ralphPromise, iteration: this.ralphIteration,
            });
            this.ralphPromise = null;
            break;
          }
          this.opts.onEvent('lead', 'ralph_iteration', { iteration: this.ralphIteration });
          this.state.appendEvent({
            team_name: this.opts.teamName, agent: 'lead', kind: 'ralph_iteration',
            payload: JSON.stringify({ iteration: this.ralphIteration }),
            created_at: Date.now(),
          });
          // Inject continue-prompt and keep looping
          this.conversation.push({
            role: 'user',
            content: `Continue working on the task. Previous turn output did not include <promise>${this.ralphPromise}</promise>. Make additional concrete progress. Only emit <promise>${this.ralphPromise}</promise> when the task is genuinely complete.`,
          });
          continue;
        }
        break;
      }

      // Build the assistant turn as content blocks when there are tool calls,
      // otherwise fall back to a plain text turn.
      if (result.tool_calls.length > 0) {
        const assistantContent: ChatMessage['content'] = [];
        if (result.text) {
          (assistantContent as Array<unknown>).push({ type: 'text', text: result.text });
        }
        for (const tc of result.tool_calls) {
          (assistantContent as Array<unknown>).push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        }
        this.conversation.push({ role: 'assistant', content: assistantContent });

        // Now execute each tool and append a user turn with tool_result blocks
        const toolResultContent: ChatMessage['content'] = [];
        for (const tc of result.tool_calls) {
          this.opts.onEvent('lead', 'tool_call', { id: tc.id, name: tc.name, input: tc.input });

          const toolResult = await mcpClient.callTool({ name: tc.name, arguments: tc.input });
          const text = extractToolResultText(toolResult.content);
          const isError = !!(toolResult as { isError?: boolean }).isError;

          this.opts.onEvent('lead', 'tool_result', { id: tc.id, name: tc.name, content: text, is_error: isError });

          (toolResultContent as Array<unknown>).push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: text,
            is_error: isError,
          });
        }
        this.conversation.push({ role: 'user', content: toolResultContent });
      } else {
        // No tool calls — model finished this turn.
        if (result.text) {
          this.conversation.push({ role: 'assistant', content: result.text });
          this.opts.onEvent('lead', 'text_delta', { text: result.text });
        }
        this.opts.onEvent('lead', 'done', { stop_reason: result.stop_reason });

        // Ralph-loop: keep iterating until promise appears or max iterations.
        if (this.ralphPromise && result.text && result.text.includes(this.ralphPromise)) {
          this.opts.onEvent('lead', 'ralph_completed', {
            promise: this.ralphPromise, iteration: this.ralphIteration,
          });
          this.ralphPromise = null;
          break;
        }
        if (this.ralphPromise) {
          this.ralphIteration++;
          if (this.ralphIteration >= this.ralphMaxIterations) {
            this.opts.onEvent('lead', 'ralph_max_iterations', {
              promise: this.ralphPromise, iteration: this.ralphIteration,
            });
            this.ralphPromise = null;
            break;
          }
          this.opts.onEvent('lead', 'ralph_iteration', { iteration: this.ralphIteration });
          this.state.appendEvent({
            team_name: this.opts.teamName, agent: 'lead', kind: 'ralph_iteration',
            payload: JSON.stringify({ iteration: this.ralphIteration }),
            created_at: Date.now(),
          });
          this.conversation.push({
            role: 'user',
            content: `Continue working on the task. Previous turn did not include <promise>${this.ralphPromise}</promise>. Make additional concrete progress. Only emit <promise>${this.ralphPromise}</promise> when the task is genuinely complete.`,
          });
          continue;
        }
        break;
      }
    }

    notifier.stop();
  }

  async runPlanMode(
    goal: string,
    onStream: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<PlanResult> {
    this.state.appendEvent({
      team_name: this.opts.teamName,
      agent: 'lead',
      kind: 'plan_started',
      payload: JSON.stringify({ goal }),
      created_at: Date.now(),
    });

    const effectiveSignal = signal ?? new AbortController().signal;
    let rawText = '';

    const result = await this.backend.run({
      systemPrompt: `You are the team lead for team "${this.opts.teamName}".`,
      messages: [{ role: 'user', content: goal }],
      tools: [],
      signal: effectiveSignal,
      onEvent: (e: AgentEvent) => {
        if (e.type === 'text_delta') {
          rawText += e.text;
          onStream(e.text);
        }
      },
      planMode: true,
    });

    if (result.error) {
      const err = Object.assign(new Error(result.error), { name: 'Error' });
      throw err;
    }

    if (effectiveSignal.aborted) {
      throw Object.assign(new Error('Plan generation aborted'), { name: 'AbortError' });
    }

    const fullText = rawText || result.text;
    const parsed = parsePlanOutput(fullText);

    const planResult: PlanResult = {
      steps: parsed.steps,
      suggestedAgents: parsed.suggestedAgents,
      rawText: fullText,
    };

    this.state.appendEvent({
      team_name: this.opts.teamName,
      agent: 'lead',
      kind: 'plan_completed',
      payload: JSON.stringify({ steps: planResult.steps, suggestedAgents: planResult.suggestedAgents }),
      created_at: Date.now(),
    });

    return planResult;
  }

  /** Is the lead currently in multi-turn brainstorm mode? */
  isBrainstormActive(): boolean {
    return this.brainstormActive;
  }

  /** The latest parsed plan produced during brainstorm — what `/go` will execute. */
  getBrainstormLatest(): PlanResult | null {
    return this.brainstormLatest;
  }

  /**
   * Start a brainstorm (multi-turn plan-refinement) session. Seeds the
   * conversation with the initial goal, runs one plan-mode turn, and stores
   * the assistant output. Subsequent refinements go through
   * `continueBrainstorm`.
   *
   * Does not touch `this.conversation` — completely isolated from the main
   * agent loop, so aborting brainstorm never pollutes normal execution.
   */
  async startBrainstorm(
    goal: string,
    onStream: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<PlanResult> {
    if (this.brainstormActive) {
      // Starting a new brainstorm implicitly abandons the prior one.
      this.brainstormActive = false;
      this.brainstormConversation = [];
      this.brainstormLatest = null;
    }
    this.brainstormActive = true;
    this.brainstormConversation = [{ role: 'user', content: goal }];
    this.state.appendEvent({
      team_name: this.opts.teamName,
      agent: 'lead',
      kind: 'brainstorm_started',
      payload: JSON.stringify({ goal }),
      created_at: Date.now(),
    });
    return this._runBrainstormTurn(onStream, signal);
  }

  /**
   * Append a user message to an ongoing brainstorm session and run another
   * plan-mode turn. The assistant's streamed response is pushed onto the
   * brainstorm conversation.
   */
  async continueBrainstorm(
    userMessage: string,
    onStream: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<PlanResult> {
    if (!this.brainstormActive) {
      throw new Error('continueBrainstorm called but brainstorm is not active');
    }
    this.brainstormConversation.push({ role: 'user', content: userMessage });
    return this._runBrainstormTurn(onStream, signal);
  }

  /**
   * Abort the current brainstorm without executing. Clears state but does
   * not spawn teammates or touch the main agent loop.
   */
  exitBrainstorm(): void {
    if (!this.brainstormActive) return;
    this.brainstormActive = false;
    this.brainstormConversation = [];
    this.brainstormLatest = null;
    this.state.appendEvent({
      team_name: this.opts.teamName,
      agent: 'lead',
      kind: 'brainstorm_exited',
      payload: '{}',
      created_at: Date.now(),
    });
  }

  /**
   * Execute the latest brainstorm plan. Clears brainstorm state, then
   * delegates to the existing `executeFromPlan` path.
   *
   * Throws if no plan has been produced yet (user hit `/go` before any
   * plan-mode turn completed).
   */
  async commitBrainstorm(agentCount?: number): Promise<PlanResult> {
    if (!this.brainstormActive) {
      throw new Error('commitBrainstorm called but brainstorm is not active');
    }
    const plan = this.brainstormLatest;
    if (!plan) {
      throw new Error('commitBrainstorm called but no plan has been generated yet');
    }
    const count = agentCount ?? Math.min(plan.suggestedAgents ?? plan.steps.length ?? 1, 5);
    this.state.appendEvent({
      team_name: this.opts.teamName,
      agent: 'lead',
      kind: 'brainstorm_committed',
      payload: JSON.stringify({ steps: plan.steps.length, agentCount: count }),
      created_at: Date.now(),
    });
    // Clear brainstorm state BEFORE executing so if executeFromPlan fails the
    // user can start a fresh brainstorm without residual state.
    this.brainstormActive = false;
    this.brainstormConversation = [];
    this.brainstormLatest = null;
    await this.executeFromPlan(plan, Math.max(1, Math.min(5, count)));
    return plan;
  }

  /**
   * Internal: run one brainstorm turn against the current conversation.
   * Shared by startBrainstorm + continueBrainstorm.
   */
  private async _runBrainstormTurn(
    onStream: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<PlanResult> {
    const effectiveSignal = signal ?? new AbortController().signal;
    let rawText = '';

    const result = await this.backend.run({
      systemPrompt: `You are the team lead for team "${this.opts.teamName}". You are in multi-turn planning mode — propose and refine a plan in response to the user. Tools are disabled until the user commits the plan with /go.`,
      messages: this.brainstormConversation,
      tools: [],
      signal: effectiveSignal,
      onEvent: (e: AgentEvent) => {
        if (e.type === 'text_delta') {
          rawText += e.text;
          onStream(e.text);
        }
      },
      planMode: true,
    });

    if (result.error) {
      throw Object.assign(new Error(result.error), { name: 'Error' });
    }
    if (effectiveSignal.aborted) {
      throw Object.assign(new Error('Brainstorm turn aborted'), { name: 'AbortError' });
    }

    const fullText = rawText || result.text;
    this.brainstormConversation.push({ role: 'assistant', content: fullText });

    const parsed = parsePlanOutput(fullText);
    const planResult: PlanResult = {
      steps: parsed.steps,
      suggestedAgents: parsed.suggestedAgents,
      rawText: fullText,
    };
    this.brainstormLatest = planResult;

    this.state.appendEvent({
      team_name: this.opts.teamName,
      agent: 'lead',
      kind: 'brainstorm_turn_completed',
      payload: JSON.stringify({ steps: planResult.steps.length, suggestedAgents: planResult.suggestedAgents, turnCount: this.brainstormConversation.length / 2 }),
      created_at: Date.now(),
    });

    return planResult;
  }

  async executeFromPlan(
    plan: PlanResult,
    agentCount: number,
    namePrefix = 'agent',
  ): Promise<void> {
    const { spawnTeammate } = await import('./spawn.js');

    this.state.appendEvent({
      team_name: this.opts.teamName,
      agent: 'lead',
      kind: 'plan_confirmed',
      payload: JSON.stringify({ agentCount }),
      created_at: Date.now(),
    });

    // Spawn N teammates
    for (let i = 1; i <= agentCount; i++) {
      const name = `${namePrefix}-${i}`;
      const spawned = await spawnTeammate(this.state, {
        teamName: this.opts.teamName,
        name,
        provider: this.teammateProviderId,
        permissionMode: this.permissionMode,
      });

      this.state.appendEvent({
        team_name: this.opts.teamName,
        agent: 'orchestrator',
        kind: 'teammate_spawned',
        payload: JSON.stringify({ name, id: spawned.id, provider: this.teammateProviderId, status: 'spawning' }),
        created_at: Date.now(),
      });
    }

    // Create one task per plan step
    for (const step of plan.steps) {
      this.state.createTask({
        id: uuidv4(),
        team_name: this.opts.teamName,
        title: step,
        description: null,
        status: 'pending',
        assigned_to: null,
        claim_lock_owner: null,
        claim_lock_expires: null,
        depends_on: null,
        result: null,
        created_by: 'lead',
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }
  }

  async shutdown(): Promise<void> {
    this.controller.abort();
    if (this.state) {
      await killAllTeammates(this.state, this.opts.teamName, 2_000);
      this.state.stopNotifier();
    }
    await this.mcpCleanup?.();
    this.state?.close();
  }
}
