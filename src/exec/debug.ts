import { makeExecEvent, serializeEvent, redactPayload } from './serializer.js';

export function emitDebugRequest(
  team: string,
  agent: string,
  body: Record<string, unknown>,
): void {
  const event = makeExecEvent(team, agent, 'provider_request', redactPayload(body));
  process.stdout.write(serializeEvent(event) + '\n');
}

export function emitDebugResponse(
  team: string,
  agent: string,
  body: Record<string, unknown>,
): void {
  const event = makeExecEvent(team, agent, 'provider_response', redactPayload(body));
  process.stdout.write(serializeEvent(event) + '\n');
}
