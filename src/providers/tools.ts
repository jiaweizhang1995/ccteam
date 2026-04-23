import type { ToolSpec } from "./types.js";

// Anthropic native tool schema shape
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// OpenAI function-calling tool schema shape
export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// MCP tool schema shape (used in claude-cli / codex-cli config)
export interface McpToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export function toolSpecToAnthropic(tool: ToolSpec): AnthropicTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      properties: tool.schema.properties,
      ...(tool.schema.required !== undefined
        ? { required: tool.schema.required }
        : {}),
    },
  };
}

export function anthropicToToolSpec(tool: AnthropicTool): ToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    schema: {
      type: "object",
      properties: tool.input_schema.properties,
      ...(tool.input_schema.required !== undefined
        ? { required: tool.input_schema.required }
        : {}),
    },
  };
}

export function toolSpecToOpenAI(tool: ToolSpec): OpenAITool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.schema.properties,
        ...(tool.schema.required !== undefined
          ? { required: tool.schema.required }
          : {}),
      },
    },
  };
}

export function openAIToToolSpec(tool: OpenAITool): ToolSpec {
  return {
    name: tool.function.name,
    description: tool.function.description,
    schema: {
      type: "object",
      properties: tool.function.parameters.properties,
      ...(tool.function.parameters.required !== undefined
        ? { required: tool.function.parameters.required }
        : {}),
    },
  };
}

export function toolSpecToMcp(tool: ToolSpec): McpToolSchema {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: "object",
      properties: tool.schema.properties,
      ...(tool.schema.required !== undefined
        ? { required: tool.schema.required }
        : {}),
    },
  };
}

export function mcpToToolSpec(tool: McpToolSchema): ToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    schema: {
      type: "object",
      properties: tool.inputSchema.properties,
      ...(tool.inputSchema.required !== undefined
        ? { required: tool.inputSchema.required }
        : {}),
    },
  };
}

// Batch helpers
export function toolSpecsToAnthropic(tools: ToolSpec[]): AnthropicTool[] {
  return tools.map(toolSpecToAnthropic);
}

export function toolSpecsToOpenAI(tools: ToolSpec[]): OpenAITool[] {
  return tools.map(toolSpecToOpenAI);
}

export function toolSpecsToMcp(tools: ToolSpec[]): McpToolSchema[] {
  return tools.map(toolSpecToMcp);
}
