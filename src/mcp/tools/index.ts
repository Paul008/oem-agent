/**
 * MCP tool registry for the OEM Agent server.
 *
 * All tool schemas are declared here so `tools/list` can return them, and
 * tool handlers are imported from per-domain modules.
 */

import type { MCPContext, MCPTool, MCPToolCallResult } from '../types';
import { listOemsTool, searchOemModelsTool, getOemModelTool } from './oem-tools';
import { generateModelPageTool, createModelSubpageTool, getPageStatusTool } from './page-tools';
import { listOemRecipesTool } from './recipe-tools';
import { triggerOemSyncTool } from './sync-tools';

export interface RegisteredTool {
  definition: MCPTool;
  handler: (args: Record<string, unknown>, ctx: MCPContext) => Promise<MCPToolCallResult>;
}

export function createToolRegistry(): {
  listTools: () => MCPTool[];
  getTool: (name: string) => RegisteredTool | undefined;
} {
  const tools: RegisteredTool[] = [
    listOemsTool,
    searchOemModelsTool,
    getOemModelTool,
    listOemRecipesTool,
    generateModelPageTool,
    createModelSubpageTool,
    getPageStatusTool,
    triggerOemSyncTool,
  ];

  const byName = new Map(tools.map((t) => [t.definition.name, t]));

  return {
    listTools: () => tools.map((t) => t.definition),
    getTool: (name: string) => byName.get(name),
  };
}

export function textResult(text: string, isError = false): MCPToolCallResult {
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

export function jsonResult(value: unknown): MCPToolCallResult {
  return textResult(JSON.stringify(value, null, 2));
}
