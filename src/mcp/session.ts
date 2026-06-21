/**
 * MCP Session Durable Object
 *
 * Maintains a long-lived SSE stream for a single MCP client session and
 * processes JSON-RPC messages posted to that session.
 */

import type {
  MCPContext,
  MCPJsonRpcError,
  MCPJsonRpcRequest,
  MCPJsonRpcResponse,
} from './types';
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_ERROR_CODES,
  type MCPInitializeResult,
} from './types';
import { createToolRegistry } from './tools';
import type { MoltbotEnv } from '../types';

// Satisfy Cloudflare Workers DurableObject namespace branding
const __DURABLE_OBJECT_BRAND = '__DURABLE_OBJECT_BRAND' as const;

interface SessionState {
  initialized: boolean;
  protocolVersion: string;
  user?: { email: string; name?: string };
}

export class McpSession {
  readonly [__DURABLE_OBJECT_BRAND]!: never;

  private state: SessionState = {
    initialized: false,
    protocolVersion: MCP_PROTOCOL_VERSION,
  };
  private controller?: ReadableStreamDefaultController<Uint8Array>;
  private pendingPings = 0;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: MoltbotEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path.endsWith('/sse')) {
      return this.handleSSE(request);
    }

    if (request.method === 'POST' && path.endsWith('/messages')) {
      return this.handleMessage(request);
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Establish an SSE stream for the client.
   */
  private handleSSE(request: Request): Response {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId') || this.ctx.id.toString();

    // Parse auth header if present; dev mode is handled by the router before reaching the DO.
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer mcp-')) {
      // Placeholder: in a real implementation validate the MCP token.
      // For now we just record that a bearer token was supplied.
    }

    const userEmail = request.headers.get('X-MCP-User-Email') || undefined;
    const userName = request.headers.get('X-MCP-User-Name') || undefined;
    if (userEmail) {
      this.state.user = { email: userEmail, name: userName };
    }

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
        this.sendSSE('endpoint', `/mcp/messages?sessionId=${encodeURIComponent(sessionId)}`);
      },
      cancel: () => {
        this.controller = undefined;
        if (this.pendingPings) {
          clearInterval(this.pendingPings as unknown as number);
          this.pendingPings = 0;
        }
      },
    });

    // Keep the DO alive and the connection healthy with periodic comments.
    this.pendingPings = setInterval(() => {
      this.sendSSEComment('keepalive');
    }, 30_000) as unknown as number;

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  /**
   * Handle a JSON-RPC message posted to this session.
   */
  private async handleMessage(request: Request): Promise<Response> {
    let body: string;
    try {
      body = await request.text();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    let parsed: MCPJsonRpcRequest;
    try {
      parsed = JSON.parse(body) as MCPJsonRpcRequest;
    } catch {
      this.sendError(null, {
        code: MCP_ERROR_CODES.PARSE_ERROR,
        message: 'Parse error: invalid JSON',
      });
      return new Response(null, { status: 202 });
    }

    const ctx: MCPContext = {
      sessionId: this.ctx.id.toString(),
      user: this.state.user,
      env: this.env,
    };

    try {
      const result = await this.dispatch(parsed, ctx);
      if (parsed.id !== undefined && parsed.id !== null) {
        this.sendResponse({ jsonrpc: '2.0', id: parsed.id, result });
      }
    } catch (err) {
      const error = this.normalizeError(err);
      if (parsed.id !== undefined && parsed.id !== null) {
        this.sendResponse({ jsonrpc: '2.0', id: parsed.id, error });
      } else {
        this.sendError(null, error);
      }
    }

    return new Response(null, { status: 202 });
  }

  private async dispatch(request: MCPJsonRpcRequest, ctx: MCPContext): Promise<unknown> {
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request);
      case 'initialized':
      case 'notifications/initialized':
        this.state.initialized = true;
        return {};
      case 'ping':
        return {};
      case 'tools/list':
        this.assertInitialized();
        return { tools: createToolRegistry().listTools() };
      case 'tools/call':
        this.assertInitialized();
        return this.handleToolCall(request, ctx);
      case 'prompts/list':
        this.assertInitialized();
        return { prompts: [] };
      case 'resources/list':
        this.assertInitialized();
        return { resources: [] };
      default:
        throw this.methodNotFound(request.method);
    }
  }

  private handleInitialize(request: MCPJsonRpcRequest): MCPInitializeResult {
    const params = request.params || {};
    const clientVersion = params.protocolVersion as string | undefined;

    // Accept the requested protocol version if it matches ours; otherwise fall back.
    this.state.protocolVersion = clientVersion === MCP_PROTOCOL_VERSION ? clientVersion : MCP_PROTOCOL_VERSION;
    this.state.initialized = false; // Wait for notifications/initialized.

    return {
      protocolVersion: this.state.protocolVersion,
      capabilities: {
        tools: { listChanged: false },
        prompts: { listChanged: false },
        resources: { listChanged: false },
        logging: {},
      },
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
      },
    };
  }

  private async handleToolCall(request: MCPJsonRpcRequest, ctx: MCPContext): Promise<unknown> {
    const params = request.params || {};
    const name = params.name as string;
    const args = (params.arguments as Record<string, unknown>) || {};

    if (!name) {
      throw this.invalidParams('Missing tool name');
    }

    const registry = createToolRegistry();
    const tool = registry.getTool(name);
    if (!tool) {
      throw this.methodNotFound(`Tool not found: ${name}`);
    }

    return tool.handler(args, ctx);
  }

  private assertInitialized(): void {
    if (!this.state.initialized) {
      const error: MCPJsonRpcError = {
        code: MCP_ERROR_CODES.SERVER_NOT_INITIALIZED,
        message: 'Server not initialized',
      };
      throw error;
    }
  }

  private methodNotFound(method: string): MCPJsonRpcError {
    return {
      code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
      message: `Method not found: ${method}`,
    };
  }

  private invalidParams(message: string): MCPJsonRpcError {
    return {
      code: MCP_ERROR_CODES.INVALID_PARAMS,
      message,
    };
  }

  private normalizeError(err: unknown): MCPJsonRpcError {
    if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
      return err as MCPJsonRpcError;
    }
    return {
      code: MCP_ERROR_CODES.INTERNAL_ERROR,
      message: err instanceof Error ? err.message : 'Internal error',
    };
  }

  private sendResponse(response: MCPJsonRpcResponse): void {
    this.sendSSE('message', JSON.stringify(response));
  }

  private sendError(id: MCPJsonRpcResponse['id'], error: MCPJsonRpcError): void {
    this.sendResponse({ jsonrpc: '2.0', id, error });
  }

  private sendSSE(event: string, data: string): void {
    if (!this.controller) return;
    const payload = new TextEncoder().encode(`event: ${event}\ndata: ${data}\n\n`);
    try {
      this.controller.enqueue(payload);
    } catch {
      // Stream may have been closed.
    }
  }

  private sendSSEComment(comment: string): void {
    if (!this.controller) return;
    const payload = new TextEncoder().encode(`: ${comment}\n\n`);
    try {
      this.controller.enqueue(payload);
    } catch {
      // Stream may have been closed.
    }
  }
}
