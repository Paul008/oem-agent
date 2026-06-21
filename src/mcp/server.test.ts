/**
 * Tests for the MCP server protocol and tools.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpSession } from './session';
import { createMockEnv } from '../test-utils';
import type { MoltbotEnv } from '../types';
import { MCP_PROTOCOL_VERSION } from './types';

function createMockDurableObjectState(id = 'test-session'): DurableObjectState {
  return {
    id: { toString: () => id } as DurableObjectId,
    storage: {} as DurableObjectStorage,
    waitUntil: vi.fn(),
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn().mockReturnValue([]),
    setWebSocketAutoResponse: vi.fn(),
    setHibernatableWebSocketEventTimeout: vi.fn(),
    getHibernatableWebSocketEventTimeout: vi.fn(),
    webSocketAutoResponse: vi.fn(),
    serializeAttachment: vi.fn(),
  } as unknown as DurableObjectState;
}

function streamCollector(response: Response): {
  events: Array<{ event: string; data: string }>;
  waitForEvents: (minCount: number, timeoutMs?: number) => Promise<void>;
} {
  const events: Array<{ event: string; data: string }> = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  const pump = async () => {
    while (!done) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        const eventMatch = block.match(/event: (.+)/);
        const dataMatch = block.match(/data: (.+)/);
        if (eventMatch && dataMatch) {
          events.push({ event: eventMatch[1], data: dataMatch[1] });
        }
      }
    }
  };

  pump().catch(() => {});

  return {
    events,
    waitForEvents: async (minCount, timeoutMs = 2_000) => {
      const start = Date.now();
      while (events.length < minCount && Date.now() - start < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
  };
}

async function postMessage(
  session: McpSession,
  message: Record<string, unknown>,
  sessionId = 'test-session',
): Promise<Response> {
  return session.fetch(
    new Request(`https://example.com/mcp/messages?sessionId=${sessionId}`, {
      method: 'POST',
      body: JSON.stringify(message),
    }),
  );
}

describe('McpSession', () => {
  let env: MoltbotEnv;
  let session: McpSession;

  beforeEach(() => {
    env = createMockEnv();
    session = new McpSession(createMockDurableObjectState(), env);
  });

  it('returns an SSE stream with an endpoint event', async () => {
    const response = await session.fetch(
      new Request('https://example.com/mcp/sse?sessionId=test-session'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const { events, waitForEvents } = streamCollector(response);
    await waitForEvents(1);

    const endpoint = events.find((e) => e.event === 'endpoint');
    expect(endpoint).toBeDefined();
    expect(endpoint!.data).toContain('/mcp/messages?sessionId=test-session');
  });

  it('responds to initialize with server info and capabilities', async () => {
    const sseResponse = await session.fetch(
      new Request('https://example.com/mcp/sse?sessionId=test-session'),
    );
    const { events, waitForEvents } = streamCollector(sseResponse);

    const initResponse = await postMessage(session, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: MCP_PROTOCOL_VERSION },
    });
    expect(initResponse.status).toBe(202);

    await waitForEvents(2);
    const responses = events.filter((e) => e.event === 'message').map((e) => JSON.parse(e.data));
    const init = responses.find((r) => r.id === 1);
    expect(init).toBeDefined();
    expect(init!.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: { name: 'oem-agent-mcp', version: '0.1.0' },
      capabilities: {
        tools: { listChanged: false },
      },
    });
  });

  it('lists tools after initialization', async () => {
    const sseResponse = await session.fetch(
      new Request('https://example.com/mcp/sse?sessionId=test-session'),
    );
    const { events, waitForEvents } = streamCollector(sseResponse);

    await postMessage(session, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: MCP_PROTOCOL_VERSION },
    });

    await postMessage(session, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    await postMessage(session, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    await waitForEvents(4);
    const responses = events.filter((e) => e.event === 'message').map((e) => JSON.parse(e.data));
    const toolsResponse = responses.find((r) => r.id === 2);
    expect(toolsResponse).toBeDefined();
    expect(toolsResponse!.error).toBeUndefined();

    const tools = (toolsResponse!.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'list_oems',
        'search_oem_models',
        'get_oem_model',
        'list_oem_recipes',
        'generate_model_page',
        'create_model_subpage',
        'get_page_status',
        'trigger_oem_sync',
      ]),
    );
  });

  it('returns method not found for unknown methods', async () => {
    const sseResponse = await session.fetch(
      new Request('https://example.com/mcp/sse?sessionId=test-session'),
    );
    const { events, waitForEvents } = streamCollector(sseResponse);

    await postMessage(session, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: MCP_PROTOCOL_VERSION },
    });
    await postMessage(session, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    await postMessage(session, {
      jsonrpc: '2.0',
      id: 99,
      method: 'unknown/method',
    });

    await waitForEvents(4);
    const responses = events.filter((e) => e.event === 'message').map((e) => JSON.parse(e.data));
    const errorResponse = responses.find((r) => r.id === 99);
    expect(errorResponse).toBeDefined();
    expect(errorResponse!.error).toMatchObject({
      code: -32601,
      message: expect.stringContaining('Method not found'),
    });
  });

  it('executes list_oems tool and returns OEMs', async () => {
    const sseResponse = await session.fetch(
      new Request('https://example.com/mcp/sse?sessionId=test-session'),
    );
    const { events, waitForEvents } = streamCollector(sseResponse);

    await postMessage(session, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: MCP_PROTOCOL_VERSION },
    });
    await postMessage(session, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    await postMessage(session, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_oems', arguments: {} },
    });

    await waitForEvents(4);
    const responses = events.filter((e) => e.event === 'message').map((e) => JSON.parse(e.data));
    const toolResponse = responses.find((r) => r.id === 2);
    expect(toolResponse).toBeDefined();
    expect(toolResponse!.error).toBeUndefined();

    const result = toolResponse!.result as { content: Array<{ type: string; text: string }> };
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.oems).toBeInstanceOf(Array);
    expect(parsed.oems.length).toBeGreaterThan(0);
    expect(parsed.oems[0]).toHaveProperty('id');
  });
});
