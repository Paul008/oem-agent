/**
 * MCP (Model Context Protocol) types for the OEM Agent remote MCP server.
 *
 * Implements JSON-RPC 2.0 message shapes and the MCP 2024-11-05 protocol
 * (https://spec.modelcontextprotocol.io/specification/2024-11-05/).
 */

export type MCPRequestId = string | number | null;

export interface MCPJsonRpcRequest {
  jsonrpc: '2.0';
  id?: MCPRequestId;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPJsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPJsonRpcResponse {
  jsonrpc: '2.0';
  id: MCPRequestId;
  result?: unknown;
  error?: MCPJsonRpcError;
}

export interface MCPJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
}

export interface MCPToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface MCPToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: { listChanged?: boolean };
    prompts?: { listChanged?: boolean };
    resources?: { listChanged?: boolean; subscribe?: boolean };
    logging?: Record<string, never>;
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface MCPCallToolRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export type MCPMessageHandler = (
  request: MCPJsonRpcRequest,
  ctx: MCPContext,
) => Promise<unknown>;

export interface MCPContext {
  sessionId: string;
  user?: { email: string; name?: string };
  env: import('../types').MoltbotEnv;
}

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const MCP_SERVER_NAME = 'oem-agent-mcp';
export const MCP_SERVER_VERSION = '0.1.0';

export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_NOT_INITIALIZED: -32002,
} as const;
