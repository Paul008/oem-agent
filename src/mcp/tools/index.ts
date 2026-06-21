/**
 * MCP tool registry for the OEM Agent server.
 *
 * All tool schemas are declared here so `tools/list` can return them, and
 * tool handlers are imported from per-domain modules.
 */

import type { MCPContext, MCPTool, MCPToolCallResult } from '../types';
import { searchAccessoriesTool, getProductTool, listVariantColorsTool, searchProductsTool } from './catalog-tools';
import { listOemsTool, searchOemModelsTool, getOemModelTool } from './oem-tools';
import { generateModelPageTool, createModelSubpageTool, getPageStatusTool, listModelPagesTool, previewPageTool } from './page-tools';
import { listOemRecipesTool } from './recipe-tools';
import { searchPdfsTool, searchSpecsTool } from './search-tools';
import { triggerOemSyncTool, triggerSpecificCrawlTool } from './sync-tools';

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
    searchProductsTool,
    getProductTool,
    listVariantColorsTool,
    searchAccessoriesTool,
    generateModelPageTool,
    createModelSubpageTool,
    getPageStatusTool,
    previewPageTool,
    listModelPagesTool,
    triggerOemSyncTool,
    triggerSpecificCrawlTool,
    searchPdfsTool,
    searchSpecsTool,
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
