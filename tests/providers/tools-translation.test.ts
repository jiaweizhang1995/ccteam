import { describe, it, expect } from "vitest";
import type { ToolSpec } from "../../src/providers/types.js";
import {
  toolSpecToAnthropic,
  anthropicToToolSpec,
  toolSpecToOpenAI,
  openAIToToolSpec,
  toolSpecToMcp,
  mcpToToolSpec,
  toolSpecsToAnthropic,
  toolSpecsToOpenAI,
} from "../../src/providers/tools.js";

const SAMPLE: ToolSpec = {
  name: "get_weather",
  description: "Get the weather for a location",
  schema: {
    type: "object",
    properties: {
      location: { type: "string", description: "City name" },
      unit: { type: "string", enum: ["celsius", "fahrenheit"] },
    },
    required: ["location"],
  },
};

const MINIMAL: ToolSpec = {
  name: "ping",
  description: "Ping the server",
  schema: { type: "object", properties: {} },
};

describe("tools translation", () => {
  describe("ToolSpec ↔ Anthropic", () => {
    it("converts ToolSpec to Anthropic format", () => {
      const result = toolSpecToAnthropic(SAMPLE);
      expect(result.name).toBe("get_weather");
      expect(result.description).toBe("Get the weather for a location");
      expect(result.input_schema.type).toBe("object");
      expect(result.input_schema.properties).toEqual(SAMPLE.schema.properties);
      expect(result.input_schema.required).toEqual(["location"]);
    });

    it("round-trips ToolSpec through Anthropic format", () => {
      const anthropic = toolSpecToAnthropic(SAMPLE);
      const restored = anthropicToToolSpec(anthropic);
      expect(restored).toEqual(SAMPLE);
    });

    it("preserves absence of required when undefined", () => {
      const result = toolSpecToAnthropic(MINIMAL);
      expect(result.input_schema.required).toBeUndefined();
      const restored = anthropicToToolSpec(result);
      expect(restored.schema.required).toBeUndefined();
    });

    it("batch conversion preserves order", () => {
      const tools = [SAMPLE, MINIMAL];
      const converted = toolSpecsToAnthropic(tools);
      expect(converted).toHaveLength(2);
      expect(converted[0]?.name).toBe("get_weather");
      expect(converted[1]?.name).toBe("ping");
    });
  });

  describe("ToolSpec ↔ OpenAI", () => {
    it("converts ToolSpec to OpenAI function-calling format", () => {
      const result = toolSpecToOpenAI(SAMPLE);
      expect(result.type).toBe("function");
      expect(result.function.name).toBe("get_weather");
      expect(result.function.description).toBe("Get the weather for a location");
      expect(result.function.parameters.type).toBe("object");
      expect(result.function.parameters.properties).toEqual(SAMPLE.schema.properties);
      expect(result.function.parameters.required).toEqual(["location"]);
    });

    it("round-trips ToolSpec through OpenAI format", () => {
      const openai = toolSpecToOpenAI(SAMPLE);
      const restored = openAIToToolSpec(openai);
      expect(restored).toEqual(SAMPLE);
    });

    it("preserves absence of required when undefined", () => {
      const result = toolSpecToOpenAI(MINIMAL);
      expect(result.function.parameters.required).toBeUndefined();
      const restored = openAIToToolSpec(result);
      expect(restored.schema.required).toBeUndefined();
    });

    it("batch conversion preserves order", () => {
      const tools = [SAMPLE, MINIMAL];
      const converted = toolSpecsToOpenAI(tools);
      expect(converted).toHaveLength(2);
      expect(converted[0]?.function.name).toBe("get_weather");
      expect(converted[1]?.function.name).toBe("ping");
    });
  });

  describe("ToolSpec ↔ MCP", () => {
    it("converts ToolSpec to MCP inputSchema format", () => {
      const result = toolSpecToMcp(SAMPLE);
      expect(result.name).toBe("get_weather");
      expect(result.description).toBe("Get the weather for a location");
      expect(result.inputSchema.type).toBe("object");
      expect(result.inputSchema.properties).toEqual(SAMPLE.schema.properties);
      expect(result.inputSchema.required).toEqual(["location"]);
    });

    it("round-trips ToolSpec through MCP format", () => {
      const mcp = toolSpecToMcp(SAMPLE);
      const restored = mcpToToolSpec(mcp);
      expect(restored).toEqual(SAMPLE);
    });

    it("preserves absence of required when undefined", () => {
      const result = toolSpecToMcp(MINIMAL);
      expect(result.inputSchema.required).toBeUndefined();
      const restored = mcpToToolSpec(result);
      expect(restored.schema.required).toBeUndefined();
    });
  });

  describe("cross-format consistency", () => {
    it("Anthropic→ToolSpec and OpenAI→ToolSpec produce identical results", () => {
      const fromAnthropic = anthropicToToolSpec(toolSpecToAnthropic(SAMPLE));
      const fromOpenAI = openAIToToolSpec(toolSpecToOpenAI(SAMPLE));
      expect(fromAnthropic).toEqual(fromOpenAI);
    });

    it("Anthropic and OpenAI required fields match original", () => {
      const anthropic = toolSpecToAnthropic(SAMPLE);
      const openai = toolSpecToOpenAI(SAMPLE);
      expect(anthropic.input_schema.required).toEqual(openai.function.parameters.required);
    });
  });
});
