import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// We need to test the token refresh logic, so we mock the fetch API and
// override the token path to a temp directory

const tmpAuthDir = join(tmpdir(), `agent-teams-test-${randomUUID()}`);
const tmpTokenPath = join(tmpAuthDir, "claude.json");

// Mock token path by patching the module — we do this by overriding homedir
vi.mock("node:os", async (importOriginal) => {
  const os = await importOriginal<typeof import("node:os")>();
  return { ...os, homedir: () => tmpAuthDir };
});

// Reimport after mocking
const { getValidAccessToken, refreshTokens } = await import("../../src/providers/oauth/anthropic.js");

function writeTokens(data: object) {
  mkdirSync(join(tmpAuthDir, ".agent-teams", "auth"), { recursive: true });
  writeFileSync(
    join(tmpAuthDir, ".agent-teams", "auth", "claude.json"),
    JSON.stringify(data),
    { mode: 0o600 },
  );
}

describe("OAuth token refresh", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;

  beforeEach(() => {
    mkdirSync(join(tmpAuthDir, ".agent-teams", "auth"), { recursive: true });
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    try {
      rmSync(tmpAuthDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it("returns existing access_token when not near expiry", async () => {
    const futureExpiry = Date.now() + 3600_000; // 1 hour from now
    writeTokens({
      access_token: "valid-token",
      refresh_token: "refresh-abc",
      expires_at: futureExpiry,
      token_type: "Bearer",
    });

    const token = await getValidAccessToken();
    expect(token).toBe("valid-token");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshes token when within 60s of expiry", async () => {
    const nearExpiry = Date.now() + 30_000; // 30s from now (within 60s threshold)
    writeTokens({
      access_token: "expiring-token",
      refresh_token: "refresh-xyz",
      expires_at: nearExpiry,
      token_type: "Bearer",
    });

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-token",
          refresh_token: "new-refresh",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const token = await getValidAccessToken();
    expect(token).toBe("new-token");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("throws when no token file exists", async () => {
    // Ensure no token file
    try {
      rmSync(join(tmpAuthDir, ".agent-teams", "auth", "claude.json"), { force: true });
    } catch { /* ignore */ }

    await expect(getValidAccessToken()).rejects.toThrow("Not authenticated");
  });

  it("refreshTokens calls token endpoint with correct params", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "refreshed-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "openid offline_access",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const tokens = await refreshTokens("my-refresh-token");
    expect(tokens.access_token).toBe("refreshed-token");
    expect(tokens.refresh_token).toBe("new-refresh-token");
    expect(tokens.expires_at).toBeGreaterThan(Date.now());

    const call = fetchSpy.mock.calls[0] as [string, RequestInit] | undefined;
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(String(url)).toContain("claude.ai/oauth/token");
    expect((init as RequestInit).method).toBe("POST");
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("my-refresh-token");
  });

  it("refreshTokens throws on non-200 response", async () => {
    fetchSpy.mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );

    await expect(refreshTokens("bad-token")).rejects.toThrow("Token fetch failed (401)");
  });
});
