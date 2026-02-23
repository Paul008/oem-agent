/**
 * Multi-Provider AI Client
 *
 * Unified interface for calling Groq, Kimi, Gemini, and Claude APIs
 * with automatic fallback and cost tracking.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  imageBase64?: string; // For vision models
}

export interface AIRequest {
  provider: 'groq' | 'kimi' | 'gemini' | 'claude';
  model: string;
  messages: AIMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: 'json' | 'text';
}

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  reasoning?: string; // For thinking models
}

export interface ProviderConfig {
  groqApiKey?: string;
  kimiApiKey?: string;
  geminiApiKey?: string;
  claudeApiKey?: string;
}

// ============================================================================
// Model Pricing
// ============================================================================

const MODEL_COSTS = {
  // Groq models (2026 pricing)
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'openai/gpt-oss-20b': { input: 0.075, output: 0.30 },
  'openai/gpt-oss-120b': { input: 0.15, output: 0.60 },
  'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.11, output: 0.34 },

  // Kimi models
  'kimi-k2': { input: 0.60, output: 2.50 },
  'kimi-k2-turbo': { input: 1.15, output: 8.00 },
  'kimi-latest': { input: 0.20, output: 2.00 }, // 8K context tier

  // Gemini models
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-2.0-flash-thinking': { input: 0.10, output: 3.90 },
  'gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'gemini-3.1-pro-preview': { input: 2.00, output: 12.00 },

  // Claude models
  'claude-haiku-4.5': { input: 0.25, output: 1.25 },
  'claude-sonnet-4.5': { input: 3.00, output: 15.00 },
  'claude-opus-4.6': { input: 15.00, output: 75.00 },
};

// ============================================================================
// Multi-Provider Client
// ============================================================================

export class MultiProviderClient {
  private config: ProviderConfig;
  private supabase?: SupabaseClient;

  constructor(config: ProviderConfig, supabase?: SupabaseClient) {
    this.config = config;
    this.supabase = supabase;
  }

  /**
   * Route request to appropriate provider
   */
  async chat(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      let response: AIResponse;

      switch (request.provider) {
        case 'groq':
          response = await this.callGroq(request);
          break;
        case 'kimi':
          response = await this.callKimi(request);
          break;
        case 'gemini':
          response = await this.callGemini(request);
          break;
        case 'claude':
          response = await this.callClaude(request);
          break;
        default:
          throw new Error(`Unknown provider: ${request.provider}`);
      }

      // Log to database if available
      if (this.supabase) {
        await this.logInference(request, response, Date.now() - startTime);
      }

      return response;
    } catch (error) {
      console.error(`[MultiProvider] ${request.provider} failed:`, error);
      throw error;
    }
  }

  /**
   * Call Groq API (OpenAI-compatible)
   */
  private async callGroq(request: AIRequest): Promise<AIResponse> {
    if (!this.config.groqApiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const messages = request.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const body: any = {
      model: request.model,
      messages,
      temperature: request.temperature ?? 0.1,
      max_tokens: request.max_tokens ?? 8192,
    };

    if (request.response_format === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const costs = MODEL_COSTS[request.model as keyof typeof MODEL_COSTS] || { input: 0, output: 0 };
    const cost = (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;

    return {
      content: data.choices[0].message.content,
      provider: 'groq',
      model: request.model,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: cost,
      },
    };
  }

  /**
   * Call Kimi API (Moonshot/OpenAI-compatible)
   */
  private async callKimi(request: AIRequest): Promise<AIResponse> {
    if (!this.config.kimiApiKey) {
      throw new Error('KIMI_API_KEY not configured');
    }

    const messages = request.messages.map(m => {
      const msg: any = {
        role: m.role,
        content: m.content,
      };

      // Add image if vision model
      if (m.imageBase64 && request.model.includes('k2.5')) {
        msg.content = [
          { type: 'text', text: m.content },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${m.imageBase64}` } },
        ];
      }

      return msg;
    });

    const body = {
      model: request.model,
      messages,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.max_tokens ?? 8192,
    };

    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.kimiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Kimi API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const costs = MODEL_COSTS[request.model as keyof typeof MODEL_COSTS] || { input: 0.6, output: 2.5 };
    const cost = (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;

    return {
      content: data.choices[0].message.content,
      provider: 'kimi',
      model: request.model,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: cost,
      },
    };
  }

  /**
   * Call Gemini API
   */
  private async callGemini(request: AIRequest): Promise<AIResponse> {
    if (!this.config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Build Gemini-specific request format
    const contents = request.messages.map(m => {
      const parts: any[] = [{ text: m.content }];

      // Add image if provided
      if (m.imageBase64) {
        parts.push({
          inline_data: {
            mime_type: 'image/jpeg',
            data: m.imageBase64,
          },
        });
      }

      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    const body: any = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.max_tokens ?? 8192,
      },
    };

    if (request.response_format === 'json') {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const endpoint = request.model.includes('thinking')
      ? 'generateContent?thinkingMode=true'
      : 'generateContent';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:${endpoint}?key=${this.config.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const reasoning = data.candidates?.[0]?.content?.parts?.find((p: any) => p.thought)?.thought;

    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const costs = MODEL_COSTS[request.model as keyof typeof MODEL_COSTS] || { input: 0.1, output: 0.4 };
    const cost = (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;

    return {
      content,
      provider: 'gemini',
      model: request.model,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: cost,
      },
      reasoning,
    };
  }

  /**
   * Call Claude API (Anthropic)
   */
  private async callClaude(request: AIRequest): Promise<AIResponse> {
    if (!this.config.claudeApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Separate system message
    const systemMessage = request.messages.find(m => m.role === 'system');
    const messages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: m.content,
      }));

    const body: any = {
      model: request.model,
      messages,
      max_tokens: request.max_tokens ?? 4096,
      temperature: request.temperature ?? 0.7,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.claudeApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    const costs = MODEL_COSTS[request.model as keyof typeof MODEL_COSTS] || { input: 3, output: 15 };
    const cost = (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;

    return {
      content: data.content[0].text,
      provider: 'claude',
      model: request.model,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: cost,
      },
    };
  }

  /**
   * Log inference to database
   */
  private async logInference(
    request: AIRequest,
    response: AIResponse,
    durationMs: number
  ): Promise<void> {
    if (!this.supabase) return;

    try {
      await this.supabase.from('ai_inference_log').insert({
        provider: response.provider,
        model: response.model,
        task_type: 'autonomous_agent',
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cost_usd: response.usage.cost_usd,
        latency_ms: durationMs,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[MultiProvider] Failed to log inference:', error);
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create multi-provider client from environment variables
 */
export function createMultiProviderClient(
  env: Record<string, string | undefined>,
  supabase?: SupabaseClient
): MultiProviderClient {
  return new MultiProviderClient({
    groqApiKey: env.GROQ_API_KEY,
    kimiApiKey: env.KIMI_API_KEY || env.MOONSHOT_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY || env.GOOGLE_API_KEY,
    claudeApiKey: env.ANTHROPIC_API_KEY,
  }, supabase);
}

/**
 * Helper to build messages from simple prompt
 */
export function buildMessages(
  systemPrompt: string,
  userPrompt: string,
  imageBase64?: string
): AIMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt, imageBase64 },
  ];
}
