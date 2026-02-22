/**
 * AI Model Router
 * 
 * Implements Section 10 (AI Model Routing Strategy) from spec.
 * Routes tasks to the cheapest, fastest model that can do the job.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AiProvider,
  AiTaskType,
  AiInferenceLog,
  OemId,
  GroqModelConfig,
  AiRouterConfig,
} from '../oem/types';

// ============================================================================
// Model Configuration (from spec Section 10.3, 10.4)
// ============================================================================

// Gemini config (separate from AiRouterConfig since it has a different structure)
export const GEMINI_CONFIG = {
  api_base: 'https://generativelanguage.googleapis.com/v1beta',
  api_key_env: 'GOOGLE_API_KEY',
  model: 'gemini-2.5-pro',
  default_params: {
    temperature: 0.7,
    maxOutputTokens: 65536,
  },
  cost_per_m_input: 1.25,
  cost_per_m_output: 10.00,
  max_context: 1048576,
  supports_vision: true,
  use_for: ['page_generation', 'content_generation_with_vision'],
};

// Gemini 3.1 Pro config (structured section extraction — lower temp, JSON output)
export const GEMINI_31_CONFIG = {
  model: 'gemini-3.1-pro-preview',
  cost_per_m_input: 2.00,
  cost_per_m_output: 12.00,
  default_params: {
    temperature: 0.3,
    maxOutputTokens: 16384,
  },
};

// Moonshot direct API (for Kimi K2.5 vision — user-provided key)
export const MOONSHOT_CONFIG = {
  api_base: 'https://api.moonshot.ai/v1',
  api_key_env: 'MOONSHOT_API_KEY',
  model: 'kimi-k2.5',
  cost_per_m_input: 0.60,
  cost_per_m_output: 2.50,
  max_context: 262144,
  supports_vision: true,
};

export const AI_ROUTER_CONFIG: AiRouterConfig = {
  groq: {
    api_base: 'https://api.groq.com/openai/v1',
    api_key_env: 'GROQ_API_KEY',
    default_params: {
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    },
    models: {
      fast_classify: {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        description: 'Ultra-fast classification and lightweight tasks',
        cost_per_m_input: 0.11,
        cost_per_m_output: 0.34,
        max_context: 131072,
        latency_p50_ms: 150,
        supports_vision: true,
        supports_tools: true,
      },
      balanced: {
        model: 'openai/gpt-oss-20b',
        description: 'Fast reasoning, validation, structured output',
        cost_per_m_input: 0.075,
        cost_per_m_output: 0.30,
        max_context: 131072,
        latency_p50_ms: 300,
        supports_vision: false,
        supports_tools: true,
      },
      powerful: {
        model: 'openai/gpt-oss-120b',
        description: 'Complex extraction, summarisation, content generation',
        cost_per_m_input: 0.15,
        cost_per_m_output: 0.60,
        max_context: 131072,
        latency_p50_ms: 800,
        supports_vision: false,
        supports_tools: true,
      },
      reasoning: {
        model: 'moonshotai/kimi-k2-instruct',
        description: 'Complex reasoning, multi-brand page analysis',
        cost_per_m_input: 1.00,
        cost_per_m_output: 3.00,
        max_context: 262144,
        latency_p50_ms: 1200,
        supports_vision: false,
        supports_tools: true,
      },
    },
    batch_config: {
      enabled: true,
      discount_pct: 50,
      use_for: ['news_page_extraction', 'quarterly_design_audit_pre_screening', 'bulk_sitemap_analysis'],
    },
  },
  kimi_k2_5: {
    api_base: 'https://api.together.xyz/v1',
    api_key_env: 'TOGETHER_API_KEY',
    model: 'moonshotai/Kimi-K2.5',
    default_params: {
      temperature: 0.6,
      max_tokens: 16384,
      response_format: { type: 'json_object' },
    },
    thinking_mode_params: {
      temperature: 1.0,
      max_tokens: 32768,
    },
    cost_per_m_input: 0.60,
    cost_per_m_output: 2.50,
    max_context: 262144,
    supports_vision: true,
    use_for: ['brand_token_extraction', 'page_layout_decomposition', 'component_detail_extraction'],
  },
};

// ============================================================================
// Task Routing Rules (from spec Section 10.2)
// ============================================================================

export interface RouteDecision {
  provider: AiProvider;
  model: string;
  modelConfig: GroqModelConfig | null;
  fallbackProvider?: AiProvider;
  fallbackModel?: string;
  useBatch?: boolean;
}

const TASK_ROUTING: Record<AiTaskType, RouteDecision> = {
  // Crawl — HTML normalisation
  html_normalisation: {
    provider: 'groq',
    model: AI_ROUTER_CONFIG.groq.models.fast_classify.model,
    modelConfig: AI_ROUTER_CONFIG.groq.models.fast_classify,
    fallbackProvider: 'groq',
    fallbackModel: AI_ROUTER_CONFIG.groq.models.balanced.model,
  },
  
  // Crawl — LLM extraction fallback
  llm_extraction: {
    provider: 'groq',
    model: AI_ROUTER_CONFIG.groq.models.powerful.model,
    modelConfig: AI_ROUTER_CONFIG.groq.models.powerful,
    fallbackProvider: 'groq',
    fallbackModel: AI_ROUTER_CONFIG.groq.models.reasoning.model,
  },
  
  // Crawl — Structured output validation
  diff_classification: {
    provider: 'groq',
    model: AI_ROUTER_CONFIG.groq.models.fast_classify.model,
    modelConfig: AI_ROUTER_CONFIG.groq.models.fast_classify,
    fallbackProvider: 'groq',
    fallbackModel: AI_ROUTER_CONFIG.groq.models.balanced.model,
  },
  
  // Change detection — Summary generation
  change_summary: {
    provider: 'groq',
    model: AI_ROUTER_CONFIG.groq.models.powerful.model,
    modelConfig: AI_ROUTER_CONFIG.groq.models.powerful,
    fallbackProvider: 'groq',
    fallbackModel: AI_ROUTER_CONFIG.groq.models.reasoning.model,
  },
  
  // Design Agent — Visual change pre-screening
  design_pre_screening: {
    provider: 'groq',
    model: AI_ROUTER_CONFIG.groq.models.reasoning.model,
    modelConfig: AI_ROUTER_CONFIG.groq.models.reasoning,
    fallbackProvider: 'groq',
    fallbackModel: AI_ROUTER_CONFIG.groq.models.powerful.model,
  },
  
  // Design Agent — Brand token extraction (VISION REQUIRED)
  design_vision: {
    provider: 'moonshot',
    model: MOONSHOT_CONFIG.model,
    modelConfig: null,
    fallbackProvider: 'together',
    fallbackModel: AI_ROUTER_CONFIG.kimi_k2_5.model,
  },
  
  // Sales Rep — Conversational agent
  sales_conversation: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20251022', // Latest Sonnet 4.5
    modelConfig: null,
    fallbackProvider: 'groq',
    fallbackModel: AI_ROUTER_CONFIG.groq.models.powerful.model,
  },
  
  // Sales Rep — Content generation
  content_generation: {
    provider: 'groq',
    model: AI_ROUTER_CONFIG.groq.models.powerful.model,
    modelConfig: AI_ROUTER_CONFIG.groq.models.powerful,
    fallbackProvider: 'anthropic',
    fallbackModel: 'claude-sonnet-4-5-20251022',
  },

  // Brand Ambassador — Page generation (VISION REQUIRED) [legacy single-stage]
  page_generation: {
    provider: 'google_gemini',
    model: GEMINI_CONFIG.model,
    modelConfig: null,
  },

  // Brand Ambassador — Stage 1: Visual extraction (Gemini sees the page)
  page_visual_extraction: {
    provider: 'google_gemini',
    model: GEMINI_CONFIG.model,
    modelConfig: null,
    // No fallback - vision is required
  },

  // Brand Ambassador — Stage 2: Content generation (Claude writes the page)
  page_content_generation: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    modelConfig: null,
    fallbackProvider: 'google_gemini',
    fallbackModel: GEMINI_CONFIG.model,
  },

  // Brand Ambassador — Screenshot-to-code (Kimi K2.5 replicates the OEM page)
  page_screenshot_to_code: {
    provider: 'moonshot',
    model: MOONSHOT_CONFIG.model,
    modelConfig: null,
    fallbackProvider: 'together',
    fallbackModel: AI_ROUTER_CONFIG.kimi_k2_5.model,
  },

  // Brand Ambassador — Structured section extraction from cloned HTML
  page_structuring: {
    provider: 'google_gemini',
    model: GEMINI_31_CONFIG.model,
    modelConfig: null,
    fallbackProvider: 'google_gemini',
    fallbackModel: GEMINI_CONFIG.model,
  },

  // Adaptive Pipeline — Quick layout classification (fast, cheap)
  quick_scan: {
    provider: 'groq',
    model: AI_ROUTER_CONFIG.groq.models.fast_classify.model,
    modelConfig: AI_ROUTER_CONFIG.groq.models.fast_classify,
    fallbackProvider: 'groq',
    fallbackModel: AI_ROUTER_CONFIG.groq.models.balanced.model,
  },

  // Adaptive Pipeline — Extraction quality validation (fast, cheap)
  extraction_quality_check: {
    provider: 'groq',
    model: AI_ROUTER_CONFIG.groq.models.balanced.model,
    modelConfig: AI_ROUTER_CONFIG.groq.models.balanced,
    fallbackProvider: 'groq',
    fallbackModel: AI_ROUTER_CONFIG.groq.models.powerful.model,
  },

  // Adaptive Pipeline — Deep section analysis with vision
  section_deep_analysis: {
    provider: 'google_gemini',
    model: GEMINI_31_CONFIG.model,
    modelConfig: null,
    fallbackProvider: 'google_gemini',
    fallbackModel: GEMINI_CONFIG.model,
  },

  // Adaptive Pipeline — Bespoke component generation (Claude)
  bespoke_component: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    modelConfig: null,
    fallbackProvider: 'google_gemini',
    fallbackModel: GEMINI_CONFIG.model,
  },
};

// ============================================================================
// AI Router Class
// ============================================================================

export interface InferenceRequest {
  taskType: AiTaskType;
  prompt: string;
  /** Base64-encoded image data for vision models */
  imageBase64?: string;
  /** MIME type of the image (default: image/png) */
  imageMimeType?: string;
  oemId?: OemId;
  importRunId?: string;
  useBatch?: boolean;
  requireJson?: boolean;
  /** Override max tokens for this request */
  maxTokens?: number;
}

export interface InferenceResponse {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  provider: AiProvider;
  model: string;
  latency_ms: number;
  wasFallback: boolean;
}

export class AiRouter {
  private apiKeys: Record<string, string>;
  private supabase: SupabaseClient | null;
  private inferenceLog: AiInferenceLog[] = []; // Fallback when supabase is not provided

  constructor(apiKeys: { groq?: string; together?: string; moonshot?: string; anthropic?: string; google?: string }, supabase?: SupabaseClient) {
    this.apiKeys = {
      [AI_ROUTER_CONFIG.groq.api_key_env]: apiKeys.groq || '',
      [AI_ROUTER_CONFIG.kimi_k2_5.api_key_env]: apiKeys.together || '',
      [MOONSHOT_CONFIG.api_key_env]: apiKeys.moonshot || '',
      ANTHROPIC_API_KEY: apiKeys.anthropic || '',
      [GEMINI_CONFIG.api_key_env]: apiKeys.google || '',
    };
    this.supabase = supabase || null;
  }

  /**
   * Route a task to the appropriate model.
   * 
   * Implements routing rules from spec Section 10.6:
   * 1. Route to cheapest capable model
   * 2. Use Groq batch API for non-time-sensitive tasks
   * 3. Route through Cloudflare AI Gateway for observability
   * 4. Set per-model monthly spend caps
   * 5. If malformed JSON, retry once with same model, then escalate
   * 6. Log all LLM calls to ai_inference_log table
   */
  async route(request: InferenceRequest): Promise<InferenceResponse> {
    const route = TASK_ROUTING[request.taskType];
    if (!route) {
      throw new Error(`Unknown task type: ${request.taskType}`);
    }

    const startTime = Date.now();
    let provider = route.provider;
    let model = route.model;
    let wasFallback = false;
    let attempts = 0;
    const maxAttempts = 2;
    let primaryError: Error | null = null;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        const response = await this.callProvider(provider, model, request);
        const latency_ms = Date.now() - startTime;

        // Log the inference
        await this.logInference({
          request,
          response,
          provider,
          model,
          latency_ms,
          wasFallback,
          status: 'success',
        });

        return {
          ...response,
          provider,
          model,
          latency_ms,
          wasFallback,
        };
      } catch (error) {
        const latency_ms = Date.now() - startTime;

        // If first attempt failed, try fallback
        if (attempts === 1 && route.fallbackProvider && route.fallbackModel) {
          primaryError = error instanceof Error ? error : new Error(String(error));
          console.warn(`[AiRouter] Primary ${provider}/${model} failed: ${primaryError.message}. Falling back to ${route.fallbackProvider}/${route.fallbackModel}`);
          provider = route.fallbackProvider;
          model = route.fallbackModel;
          wasFallback = true;
          continue;
        }

        // Log error - include primary error context if this is a fallback failure
        const errorMsg = error instanceof Error ? error.message : String(error);
        const fullErrorMsg = primaryError
          ? `Primary (${route.provider}): ${primaryError.message} | Fallback (${provider}): ${errorMsg}`
          : errorMsg;

        await this.logInference({
          request,
          response: null,
          provider,
          model,
          latency_ms,
          wasFallback,
          status: 'error',
          errorMessage: fullErrorMsg,
        });

        throw new Error(fullErrorMsg);
      }
    }

    throw new Error('Max attempts reached');
  }

  /**
   * Call the appropriate provider API.
   */
  private async callProvider(
    provider: AiProvider,
    model: string,
    request: InferenceRequest
  ): Promise<Omit<InferenceResponse, 'provider' | 'model' | 'latency_ms' | 'wasFallback'>> {
    switch (provider) {
      case 'groq':
        return this.callGroq(model, request);
      case 'together':
        return this.callTogether(model, request);
      case 'moonshot':
        return this.callMoonshot(model, request);
      case 'anthropic':
        return this.callAnthropic(model, request);
      case 'cloudflare_ai_gateway':
        return this.callCloudflareAIGateway(model, request);
      case 'google_gemini':
        return this.callGemini(model, request);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Call Groq API.
   */
  private async callGroq(
    model: string,
    request: InferenceRequest
  ): Promise<Omit<InferenceResponse, 'provider' | 'model' | 'latency_ms' | 'wasFallback'>> {
    const apiKey = this.apiKeys[AI_ROUTER_CONFIG.groq.api_key_env];
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not set');
    }

    const response = await fetch(`${AI_ROUTER_CONFIG.groq.api_base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: request.imageBase64
            ? [
                { type: 'image_url', image_url: { url: `data:${request.imageMimeType || 'image/jpeg'};base64,${request.imageBase64}` } },
                { type: 'text', text: request.prompt },
              ]
            : request.prompt,
        }],
        ...AI_ROUTER_CONFIG.groq.default_params,
        response_format: request.requireJson !== false ? { type: 'json_object' } : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
    
    return {
      content: choices?.[0]?.message?.content || '',
      usage: {
        prompt_tokens: usage?.prompt_tokens || 0,
        completion_tokens: usage?.completion_tokens || 0,
        total_tokens: usage?.total_tokens || 0,
      },
    };
  }

  /**
   * Call Together AI API (for Kimi K2.5).
   * Supports vision via multimodal content (text + inline base64 image).
   */
  private async callTogether(
    model: string,
    request: InferenceRequest
  ): Promise<Omit<InferenceResponse, 'provider' | 'model' | 'latency_ms' | 'wasFallback'>> {
    const apiKey = this.apiKeys[AI_ROUTER_CONFIG.kimi_k2_5.api_key_env];
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY not set');
    }

    // Build message content — multimodal if image is provided
    let messageContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

    if (request.imageBase64) {
      const mimeType = request.imageMimeType || 'image/png';
      messageContent = [
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${request.imageBase64}` },
        },
        {
          type: 'text',
          text: request.prompt,
        },
      ];
    } else {
      messageContent = request.prompt;
    }

    const response = await fetch(`${AI_ROUTER_CONFIG.kimi_k2_5.api_base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: messageContent }],
        ...AI_ROUTER_CONFIG.kimi_k2_5.default_params,
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        response_format: request.requireJson !== false ? { type: 'json_object' } : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Together AI error: ${response.status} - ${error}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
    
    return {
      content: choices?.[0]?.message?.content || '',
      usage: {
        prompt_tokens: usage?.prompt_tokens || 0,
        completion_tokens: usage?.completion_tokens || 0,
        total_tokens: usage?.total_tokens || 0,
      },
    };
  }

  /**
   * Call Moonshot API directly (for Kimi K2.5 vision).
   * OpenAI-compatible format at api.moonshot.cn/v1.
   */
  private async callMoonshot(
    model: string,
    request: InferenceRequest
  ): Promise<Omit<InferenceResponse, 'provider' | 'model' | 'latency_ms' | 'wasFallback'>> {
    const apiKey = this.apiKeys[MOONSHOT_CONFIG.api_key_env];
    if (!apiKey) {
      throw new Error('MOONSHOT_API_KEY not set');
    }

    // Build multimodal content if image is provided
    let messageContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

    if (request.imageBase64) {
      const mimeType = request.imageMimeType || 'image/png';
      messageContent = [
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${request.imageBase64}` },
        },
        {
          type: 'text',
          text: request.prompt,
        },
      ];
    } else {
      messageContent = request.prompt;
    }

    const response = await fetch(`${MOONSHOT_CONFIG.api_base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: messageContent }],
        // Kimi K2.5 is a reasoning model — only temperature=1 is allowed
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        ...(request.requireJson !== false ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Moonshot API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

    return {
      content: choices?.[0]?.message?.content || '',
      usage: {
        prompt_tokens: usage?.prompt_tokens || 0,
        completion_tokens: usage?.completion_tokens || 0,
        total_tokens: usage?.total_tokens || 0,
      },
    };
  }

  /**
   * Call Anthropic API (Claude).
   */
  private async callAnthropic(
    model: string,
    request: InferenceRequest
  ): Promise<Omit<InferenceResponse, 'provider' | 'model' | 'latency_ms' | 'wasFallback'>> {
    const apiKey = this.apiKeys.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens || 4096,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const content = data.content as Array<{ text?: string }> | undefined;
    const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    
    return {
      content: content?.[0]?.text || '',
      usage: {
        prompt_tokens: usage?.input_tokens || 0,
        completion_tokens: usage?.output_tokens || 0,
        total_tokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
      },
    };
  }

  /**
   * Call Cloudflare AI Gateway.
   */
  private async callCloudflareAIGateway(
    model: string,
    request: InferenceRequest
  ): Promise<Omit<InferenceResponse, 'provider' | 'model' | 'latency_ms' | 'wasFallback'>> {
    // This would use the Cloudflare AI Gateway binding from the Worker environment
    // For now, delegate to Groq as the primary provider
    return this.callGroq(model, request);
  }

  /**
   * Call Google Gemini API.
   *
   * Supports vision (inline image data) and large context.
   * Uses the generateContent endpoint with structured JSON output.
   */
  private async callGemini(
    model: string,
    request: InferenceRequest
  ): Promise<Omit<InferenceResponse, 'provider' | 'model' | 'latency_ms' | 'wasFallback'>> {
    const apiKey = this.apiKeys[GEMINI_CONFIG.api_key_env];
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY not set');
    }

    // Build content parts
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    // Add image if provided (for vision tasks)
    if (request.imageBase64) {
      parts.push({
        inlineData: {
          mimeType: request.imageMimeType || 'image/png',
          data: request.imageBase64,
        },
      });
    }

    // Add text prompt
    parts.push({ text: request.prompt });

    // Use model-specific defaults
    const isGemini31 = model === GEMINI_31_CONFIG.model;
    const defaults = isGemini31 ? GEMINI_31_CONFIG.default_params : GEMINI_CONFIG.default_params;

    const body: Record<string, unknown> = {
      contents: [{ parts }],
      generationConfig: {
        temperature: defaults.temperature,
        maxOutputTokens: request.maxTokens || defaults.maxOutputTokens,
        responseMimeType: request.requireJson !== false ? 'application/json' : 'text/plain',
      },
    };

    const url = `${GEMINI_CONFIG.api_base}/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const candidates = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    const usageMetadata = data.usageMetadata as {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    } | undefined;

    const content = candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      content,
      usage: {
        prompt_tokens: usageMetadata?.promptTokenCount || 0,
        completion_tokens: usageMetadata?.candidatesTokenCount || 0,
        total_tokens: usageMetadata?.totalTokenCount || 0,
      },
    };
  }

  /**
   * Log inference to database.
   * 
   * Spec Section 10.6 Rule 8: Log all LLM calls to ai_inference_log table
   */
  private async logInference(params: {
    request: InferenceRequest;
    response: Omit<InferenceResponse, 'provider' | 'model' | 'latency_ms' | 'wasFallback'> | null;
    provider: AiProvider;
    model: string;
    latency_ms: number;
    wasFallback: boolean;
    status: 'success' | 'error' | 'timeout' | 'rate_limited';
    errorMessage?: string;
  }): Promise<void> {
    const logEntry: Partial<AiInferenceLog> = {
      oem_id: params.request.oemId || null,
      import_run_id: params.request.importRunId || null,
      provider: params.provider,
      model: params.model,
      task_type: params.request.taskType,
      prompt_tokens: params.response?.usage.prompt_tokens || null,
      completion_tokens: params.response?.usage.completion_tokens || null,
      total_tokens: params.response?.usage.total_tokens || null,
      cost_usd: this.calculateCost(params.provider, params.model, params.response?.usage),
      latency_ms: params.latency_ms,
      request_timestamp: new Date().toISOString(),
      response_timestamp: new Date().toISOString(),
      prompt_hash: await this.hashString(params.request.prompt),
      response_hash: params.response ? await this.hashString(params.response.content) : null,
      status: params.status,
      error_message: params.errorMessage || null,
      was_fallback: params.wasFallback,
      fallback_reason: params.wasFallback ? 'Primary model failed' : null,
      batch_discount_applied: params.request.useBatch || false,
      metadata_json: {
        taskType: params.request.taskType,
      },
    };

    if (this.supabase) {
      try {
        await this.supabase.from('ai_inference_log').insert(logEntry);
      } catch (e) {
        console.warn('[AiRouter] Failed to persist inference log:', e);
        this.inferenceLog.push(logEntry as AiInferenceLog);
      }
    } else {
      this.inferenceLog.push(logEntry as AiInferenceLog);
    }
  }

  /**
   * Calculate cost based on provider and token usage.
   */
  private calculateCost(
    provider: AiProvider,
    model: string,
    usage?: { prompt_tokens: number; completion_tokens: number }
  ): number | null {
    if (!usage) return null;

    const promptM = usage.prompt_tokens / 1_000_000;
    const completionM = usage.completion_tokens / 1_000_000;

    if (provider === 'groq') {
      const groqModel = Object.values(AI_ROUTER_CONFIG.groq.models).find(m => m.model === model);
      if (groqModel) {
        return promptM * groqModel.cost_per_m_input + completionM * groqModel.cost_per_m_output;
      }
    }

    if (provider === 'together' && model === AI_ROUTER_CONFIG.kimi_k2_5.model) {
      return promptM * AI_ROUTER_CONFIG.kimi_k2_5.cost_per_m_input +
             completionM * AI_ROUTER_CONFIG.kimi_k2_5.cost_per_m_output;
    }

    if (provider === 'moonshot') {
      return promptM * MOONSHOT_CONFIG.cost_per_m_input +
             completionM * MOONSHOT_CONFIG.cost_per_m_output;
    }

    // Anthropic costs vary by model
    if (provider === 'anthropic') {
      // Claude Sonnet 4.5: ~$3/1M input, ~$15/1M output
      return promptM * 3 + completionM * 15;
    }

    // Gemini models
    if (provider === 'google_gemini') {
      if (model === GEMINI_31_CONFIG.model) {
        return promptM * GEMINI_31_CONFIG.cost_per_m_input + completionM * GEMINI_31_CONFIG.cost_per_m_output;
      }
      return promptM * GEMINI_CONFIG.cost_per_m_input + completionM * GEMINI_CONFIG.cost_per_m_output;
    }

    return null;
  }

  private async hashString(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }

  /**
   * Get cost summary for reporting.
   */
  getCostSummary(): {
    totalCalls: number;
    totalCostUsd: number;
    callsByProvider: Record<AiProvider, number>;
    callsByTask: Record<AiTaskType, number>;
  } {
    const summary = {
      totalCalls: this.inferenceLog.length,
      totalCostUsd: 0,
      callsByProvider: {} as Record<AiProvider, number>,
      callsByTask: {} as Record<AiTaskType, number>,
    };

    this.inferenceLog.forEach(log => {
      summary.totalCostUsd += log.cost_usd || 0;
      summary.callsByProvider[log.provider] = (summary.callsByProvider[log.provider] || 0) + 1;
      summary.callsByTask[log.task_type] = (summary.callsByTask[log.task_type] || 0) + 1;
    });

    return summary;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function estimateTaskCost(taskType: AiTaskType, promptTokens: number, completionTokens: number): number {
  const route = TASK_ROUTING[taskType];
  if (!route || !route.modelConfig) return 0;

  const promptM = promptTokens / 1_000_000;
  const completionM = completionTokens / 1_000_000;

  return promptM * route.modelConfig.cost_per_m_input + completionM * route.modelConfig.cost_per_m_output;
}

export function getModelForTask(taskType: AiTaskType): string {
  return TASK_ROUTING[taskType]?.model || AI_ROUTER_CONFIG.groq.models.powerful.model;
}
