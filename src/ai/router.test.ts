import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiRouter,
  AVAILABLE_MODELS,
  CLOUDFLARE_KIMI_K3_CONFIG,
  KIMI_K2_6_CONFIG,
  KIMI_K3_CONFIG,
  TASK_ROUTING,
  calculateInferenceCost,
} from './router';

afterEach(() => {
  vi.unstubAllGlobals();
});

function moonshotResponse(content = '{"sections":[]}') {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function geminiResponse(content = '{"sections":[]}') {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: content }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const pageBuilderTasks = [
  'design_vision',
  'page_generation',
  'page_visual_extraction',
  'page_content_generation',
  'page_screenshot_to_code',
  'page_structuring',
] as const;

describe('Kimi K3 Page Builder defaults', () => {
  it('registers Kimi K3 with the official identifier and capabilities', () => {
    expect(KIMI_K3_CONFIG).toMatchObject({
      model: 'kimi-k3',
      api_base: 'https://api.moonshot.ai/v1',
      max_context: 1_048_576,
      supports_vision: true,
      supports_tools: true,
      default_params: { reasoning_effort: 'high' },
    });
    expect(AVAILABLE_MODELS).toContainEqual(expect.objectContaining({
      id: 'kimi-k3-moonshot',
      provider: 'moonshot',
      model: 'kimi-k3',
      capabilities: ['vision', 'json_mode', 'reasoning', 'tools'],
    }));
  });

  it('uses Kimi K3 only for the six approved Page Builder task defaults', () => {
    for (const task of pageBuilderTasks) {
      expect(TASK_ROUTING[task]).toMatchObject({ provider: 'moonshot', model: 'kimi-k3' });
    }

    expect(TASK_ROUTING.quick_scan.model).not.toBe('kimi-k3');
    expect(TASK_ROUTING.llm_extraction.model).not.toBe('kimi-k3');
    expect(TASK_ROUTING.sales_conversation.model).not.toBe('kimi-k3');
  });

  it('calculates K3 cache-miss inference cost from official rates', () => {
    expect(calculateInferenceCost('moonshot', 'kimi-k3', {
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
    })).toBe(18);
  });

  it('does not report unified K3 as free and prices hosted K2.6', () => {
    expect(calculateInferenceCost('workers_ai', CLOUDFLARE_KIMI_K3_CONFIG.model, {
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
    })).toBeNull();
    expect(calculateInferenceCost('workers_ai', KIMI_K2_6_CONFIG.model, {
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
    })).toBe(4.95);
  });

  it('sends K3 reasoning, image, and JSON fields to Moonshot', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => moonshotResponse());
    vi.stubGlobal('fetch', fetchMock);
    const router = new AiRouter({ moonshot: 'test-key' });

    const response = await router.route({
      taskType: 'page_structuring',
      prompt: 'Return structured sections',
      imageBase64: 'aW1hZ2U=',
      imageMimeType: 'image/png',
      requireJson: true,
      maxTokens: 4096,
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(response).toMatchObject({ provider: 'moonshot', model: 'kimi-k3', wasFallback: false });
    expect(body).toMatchObject({
      model: 'kimi-k3',
      reasoning_effort: 'high',
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });
    expect(body.messages[0].content[0].image_url.url).toBe('data:image/png;base64,aW1hZ2U=');
  });

  it('does not send K3-only reasoning effort to legacy Moonshot models', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => moonshotResponse());
    vi.stubGlobal('fetch', fetchMock);
    const router = new AiRouter({ moonshot: 'test-key' });

    await router.route({
      taskType: 'page_structuring',
      prompt: 'Return structured sections',
      overrideRoute: { provider: 'moonshot', model: 'kimi-k2.5' },
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe('kimi-k2.5');
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('keeps per-request overrides above the K3 task default', async () => {
    const fetchMock = vi.fn(async () => geminiResponse());
    vi.stubGlobal('fetch', fetchMock);
    const router = new AiRouter({ google: 'test-key' });

    const result = await router.route({
      taskType: 'page_structuring',
      prompt: 'Return structured sections',
      overrideRoute: { provider: 'google_gemini', model: 'gemini-2.5-pro' },
    });

    expect(result).toMatchObject({
      provider: 'google_gemini',
      model: 'gemini-2.5-pro',
      wasFallback: false,
    });
  });

  it('sends a JSON schema through Gemini generateContent structured output fields', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => geminiResponse('{"kind":"carousel"}'));
    vi.stubGlobal('fetch', fetchMock);
    const router = new AiRouter({ google: 'test-key' });
    const responseJsonSchema = {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['carousel'] } },
      required: ['kind'],
      additionalProperties: false,
    };

    await router.route({
      taskType: 'section_deep_analysis',
      prompt: 'Return a carousel candidate',
      requireJson: true,
      responseJsonSchema,
      overrideRoute: { provider: 'google_gemini', model: 'gemini-3.1-pro-preview' },
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema,
    });
    expect(body.generationConfig).not.toHaveProperty('responseFormat');
  });

  it('routes Adaptive Match through Cloudflare Kimi K3 with schema-constrained output', async () => {
    const run = vi.fn(async () => ({
      response: '{"mutations":[]}',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));
    const router = new AiRouter(
      {},
      undefined,
      { run } as unknown as Ai,
      { workersAiGatewayId: 'adaptive-match' },
    );
    const responseJsonSchema = {
      type: 'object',
      properties: { mutations: { type: 'array', items: { type: 'object' } } },
      required: ['mutations'],
      additionalProperties: false,
    };

    const result = await router.route({
      taskType: 'section_deep_analysis',
      prompt: 'Repair this section',
      imageBase64: 'aW1hZ2U=',
      imageMimeType: 'image/png',
      requireJson: true,
      responseJsonSchema,
      maxTokens: 4096,
    });

    expect(result).toMatchObject({
      provider: 'workers_ai',
      model: CLOUDFLARE_KIMI_K3_CONFIG.model,
      wasFallback: false,
    });
    expect(run).toHaveBeenCalledWith(
      CLOUDFLARE_KIMI_K3_CONFIG.model,
      expect.objectContaining({
        max_tokens: 4096,
        reasoning_effort: 'high',
        response_format: { type: 'json_schema', json_schema: responseJsonSchema },
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
            { type: 'text', text: 'Repair this section' },
          ],
        }],
      }),
      { gateway: { id: 'adaptive-match' } },
    );
  });

  it('falls back from Cloudflare Kimi K3 to hosted Kimi K2.6', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('Unified Billing credits unavailable'))
      .mockResolvedValueOnce({ response: '{"mutations":[]}', usage: {} });
    const router = new AiRouter(
      {},
      undefined,
      { run } as unknown as Ai,
      { workersAiGatewayId: 'adaptive-match' },
    );

    const result = await router.route({
      taskType: 'section_deep_analysis',
      prompt: 'Repair this section',
      requireJson: true,
    });

    expect(result).toMatchObject({
      provider: 'workers_ai',
      model: KIMI_K2_6_CONFIG.model,
      wasFallback: true,
    });
    expect(run.mock.calls[0][0]).toBe(CLOUDFLARE_KIMI_K3_CONFIG.model);
    expect(run.mock.calls[0][2]).toEqual({ gateway: { id: 'adaptive-match' } });
    expect(run.mock.calls[1][0]).toBe(KIMI_K2_6_CONFIG.model);
    expect(run.mock.calls[1][1]).toEqual(expect.objectContaining({
      chat_template_kwargs: { thinking: true },
    }));
    expect(run.mock.calls[1][2]).toBeUndefined();
  });

  it('skips unified K3 when no AI Gateway is configured', async () => {
    const run = vi.fn(async (..._args: unknown[]) => ({ response: '{"mutations":[]}', usage: {} }));
    const router = new AiRouter({}, undefined, { run } as unknown as Ai);

    const result = await router.route({
      taskType: 'section_deep_analysis',
      prompt: 'Repair this section',
      requireJson: true,
    });

    expect(result).toMatchObject({
      provider: 'workers_ai',
      model: KIMI_K2_6_CONFIG.model,
      wasFallback: true,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toBe(KIMI_K2_6_CONFIG.model);
  });

  it('keeps database overrides above the K3 task default', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'workflow_settings') {
          return {
            select() {
              return {
                eq() {
                  return {
                    async single() {
                      return {
                        data: {
                          config: {
                            ai_model_overrides: {
                              page_structuring: {
                                provider: 'google_gemini',
                                model: 'gemini-3.1-pro-preview',
                              },
                            },
                          },
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        return { async insert() { return { error: null }; } };
      },
    } as unknown as SupabaseClient;
    vi.stubGlobal('fetch', vi.fn(async () => geminiResponse()));
    const router = new AiRouter({ google: 'test-key' }, supabase);

    const result = await router.route({
      taskType: 'page_structuring',
      prompt: 'Return structured sections',
    });

    expect(result).toMatchObject({
      provider: 'google_gemini',
      model: 'gemini-3.1-pro-preview',
      wasFallback: false,
    });
  });
});
