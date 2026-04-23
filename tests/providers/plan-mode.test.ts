import { describe, it, expect } from "vitest";
import { parsePlanOutput, PLAN_MODE_SYSTEM_SUFFIX } from "../../src/providers/plan-mode.js";

describe("parsePlanOutput", () => {
  it("parses numbered steps and SUGGESTED_AGENTS", () => {
    const text = `Here is the plan:

1. Analyze codebase — Review existing auth module structure and identify entry points.
2. Write tests — Add unit tests covering the main auth flows.
3. Refactor auth module — Extract shared logic into reusable helpers.
4. Validate — Run the full test suite and fix any regressions.

SUGGESTED_AGENTS: 3`;

    const result = parsePlanOutput(text);
    expect(result.steps).toHaveLength(4);
    expect(result.steps[0]).toBe("Analyze codebase — Review existing auth module structure and identify entry points.");
    expect(result.steps[3]).toBe("Validate — Run the full test suite and fix any regressions.");
    expect(result.suggestedAgents).toBe(3);
  });

  it("returns null suggestedAgents when line is absent", () => {
    const text = `1. Step one — Do the first thing.\n2. Step two — Do the second thing.`;
    const result = parsePlanOutput(text);
    expect(result.steps).toHaveLength(2);
    expect(result.suggestedAgents).toBeNull();
  });

  it("returns empty steps for plain text with no numbered list", () => {
    const text = "I cannot help with that.";
    const result = parsePlanOutput(text);
    expect(result.steps).toHaveLength(0);
    expect(result.suggestedAgents).toBeNull();
  });

  it("handles SUGGESTED_AGENTS case-insensitively", () => {
    const text = `1. First step — Description.\nsuggested_agents: 2`;
    const result = parsePlanOutput(text);
    expect(result.suggestedAgents).toBe(2);
  });

  it("handles leading/trailing whitespace on step lines", () => {
    const text = `  1. First step — Description.\n  2. Second step — Another description.\nSUGGESTED_AGENTS: 1`;
    const result = parsePlanOutput(text);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toBe("First step — Description.");
    expect(result.suggestedAgents).toBe(1);
  });

  it("rawText preserves original provider output", () => {
    const text = "1. Step one — Do something.\nSUGGESTED_AGENTS: 1";
    const result = parsePlanOutput(text);
    expect(result.rawText).toBe(text);
  });

  it("PLAN_MODE_SYSTEM_SUFFIX contains key sentinel text", () => {
    expect(PLAN_MODE_SYSTEM_SUFFIX).toContain("PLAN MODE");
    expect(PLAN_MODE_SYSTEM_SUFFIX).toContain("SUGGESTED_AGENTS");
    expect(PLAN_MODE_SYSTEM_SUFFIX).toContain("Do NOT execute commands or tools");
  });
});
