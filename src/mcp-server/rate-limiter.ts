const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export function checkRateLimit(agentId: string): boolean {
  const now = Date.now();
  let win = windows.get(agentId);
  if (!win || now >= win.resetAt) {
    win = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(agentId, win);
  }
  win.count++;
  return win.count <= MAX_PER_WINDOW;
}

export function getRateLimitInfo(agentId: string): { count: number; max: number; resetAt: number } {
  const now = Date.now();
  const win = windows.get(agentId);
  if (!win || now >= win.resetAt) {
    return { count: 0, max: MAX_PER_WINDOW, resetAt: now + WINDOW_MS };
  }
  return { count: win.count, max: MAX_PER_WINDOW, resetAt: win.resetAt };
}
