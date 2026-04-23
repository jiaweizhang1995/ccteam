import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, chmodSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import lockfile from "proper-lockfile";

// Anthropic OAuth endpoints (Claude.ai PKCE flow)
const ANTHROPIC_AUTH_URL = "https://claude.ai/oauth/authorize";
const ANTHROPIC_TOKEN_URL = "https://claude.ai/oauth/token";
// TODO: "agent-teams-cli" is a placeholder — Anthropic requires a registered OAuth client.
// See docs/providers.md for how to register and set AGENT_TEAMS_OAUTH_CLIENT_ID.
const CLIENT_ID = process.env["AGENT_TEAMS_OAUTH_CLIENT_ID"] ?? "agent-teams-cli";
const REDIRECT_PORT = 54321;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = "openid offline_access";

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
  token_type: string;
  scope?: string;
}

const TOKEN_PATH = join(homedir(), ".agent-teams", "auth", "claude.json");

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function loadTokens(): OAuthTokens | null {
  try {
    if (!existsSync(TOKEN_PATH)) return null;
    return JSON.parse(readFileSync(TOKEN_PATH, "utf8")) as OAuthTokens;
  } catch {
    return null;
  }
}

function saveTokens(tokens: OAuthTokens): void {
  ensureDir(TOKEN_PATH);
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { encoding: "utf8" });
  chmodSync(TOKEN_PATH, 0o600);
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function fetchTokens(params: Record<string, string>): Promise<OAuthTokens> {
  const body = new URLSearchParams(params).toString();
  const resp = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token fetch failed (${resp.status}): ${text}`);
  }
  const data = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type: string;
    scope?: string;
  };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? "",
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    token_type: data.token_type,
    scope: data.scope,
  };
}

async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  // File-level lock so multiple teammate worker processes serialize refresh correctly
  ensureDir(TOKEN_PATH);
  // proper-lockfile requires the target file to exist before locking
  if (!existsSync(TOKEN_PATH)) {
    writeFileSync(TOKEN_PATH, "null", { encoding: "utf8" });
    chmodSync(TOKEN_PATH, 0o600);
  }
  const release = await lockfile.lock(TOKEN_PATH, { retries: { retries: 5, minTimeout: 100 } });
  try {
    return await fn();
  } finally {
    await release();
  }
}

export async function getValidAccessToken(): Promise<string> {
  return withRefreshLock(async () => {
    let tokens = loadTokens();
    if (!tokens) {
      throw new Error("Not authenticated. Run: agent-teams auth login claude");
    }

    // Refresh if within 60s of expiry
    if (tokens.expires_at - Date.now() < 60_000) {
      tokens = await refreshTokens(tokens.refresh_token);
      saveTokens(tokens);
    }

    return tokens.access_token;
  });
}

export async function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
  return fetchTokens({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
  });
}

export async function loginOAuth(): Promise<OAuthTokens> {
  const { verifier, challenge } = generatePkce();
  const state = base64url(randomBytes(16));

  const authUrl = new URL(ANTHROPIC_AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // Attempt to open browser
  const { exec } = await import("node:child_process");
  exec(
    process.platform === "darwin"
      ? `open "${authUrl.toString()}"`
      : `xdg-open "${authUrl.toString()}"`,
  );

  console.log(`\nOpen this URL in your browser:\n${authUrl.toString()}\n`);

  // Start local server to receive callback
  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${REDIRECT_PORT}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const returnedState = url.searchParams.get("state");
      const returnedCode = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400);
        res.end(`Authentication error: ${error}`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400);
        res.end("State mismatch");
        server.close();
        reject(new Error("OAuth state mismatch"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body><h1>Authenticated! You can close this tab.</h1></body></html>");
      server.close();
      resolve(returnedCode ?? "");
    });

    server.listen(REDIRECT_PORT, "127.0.0.1", () => {
      console.log(`Waiting for OAuth callback on port ${REDIRECT_PORT}...`);
    });

    server.on("error", reject);
    setTimeout(() => {
      server.close();
      reject(new Error("OAuth login timed out after 5 minutes"));
    }, 300_000);
  });

  const tokens = await fetchTokens({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });

  saveTokens(tokens);
  console.log("Authentication successful.");
  return tokens;
}

export function isAuthenticated(): boolean {
  return loadTokens() !== null;
}
