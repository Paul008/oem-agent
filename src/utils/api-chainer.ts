/**
 * API Chainer Utility
 * 
 * Handles chained API calls where subsequent APIs require tokens/keys
 * from previous responses (e.g., session IDs, CSRF tokens, API keys).
 * 
 * Features:
 * - Token extraction from responses
 * - URL template resolution with token substitution
 * - Sequential API execution with dependency tracking
 * - Response caching and correlation
 */

import type { NetworkResponse } from './network-browser';

export interface ApiChainStep {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | object;
  // Which previous step's response to extract tokens from
  dependsOn?: string;
  // Token extraction configuration
  tokenExtraction?: TokenExtractionConfig[];
  // Condition to execute this step
  condition?: (context: ChainContext) => boolean;
  // Transform the request based on context
  transformRequest?: (request: ApiChainStep, context: ChainContext) => ApiChainStep;
  // Validate the response
  validateResponse?: (response: NetworkResponse, context: ChainContext) => boolean;
}

export interface TokenExtractionConfig {
  name: string;
  // JSON path or regex pattern
  source: 'json' | 'header' | 'cookie' | 'url';
  path?: string; // For JSON: dot notation (e.g., 'data.session.id')
  pattern?: string; // For regex extraction
  headerName?: string; // For header extraction
  cookieName?: string; // For cookie extraction
  urlParam?: string; // For URL parameter extraction
  // Default value if not found
  defaultValue?: string;
}

export interface ChainContext {
  // All tokens extracted so far
  tokens: Record<string, string>;
  // All responses received
  responses: Map<string, NetworkResponse>;
  // Parsed JSON data from responses
  parsedData: Map<string, any>;
  // Step execution results
  stepResults: Map<string, StepResult>;
  // Start time
  startTime: number;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  response?: NetworkResponse;
  error?: string;
  duration: number;
  tokensExtracted: string[];
}

export interface ChainResult {
  success: boolean;
  context: ChainContext;
  executedSteps: string[];
  failedSteps: string[];
  totalDuration: number;
  // Flattened data from all steps
  mergedData: Record<string, any>;
}

/**
 * API Chainer class for executing dependent API calls.
 */
export class ApiChainer {
  private steps: Map<string, ApiChainStep> = new Map();

  /**
   * Add a step to the chain.
   */
  addStep(step: ApiChainStep): this {
    this.steps.set(step.id, step);
    return this;
  }

  /**
   * Execute the API chain.
   */
  async execute(
    fetchFn: (url: string, options: any) => Promise<NetworkResponse>,
    initialTokens: Record<string, string> = {}
  ): Promise<ChainResult> {
    const context: ChainContext = {
      tokens: { ...initialTokens },
      responses: new Map(),
      parsedData: new Map(),
      stepResults: new Map(),
      startTime: Date.now(),
    };

    const executedSteps: string[] = [];
    const failedSteps: string[] = [];

    // Determine execution order based on dependencies
    const executionOrder = this.resolveExecutionOrder();

    for (const stepId of executionOrder) {
      const step = this.steps.get(stepId);
      if (!step) continue;

      // Check condition
      if (step.condition && !step.condition(context)) {
        console.log(`[ApiChainer] Skipping step ${stepId}: condition not met`);
        continue;
      }

      // Check dependency
      if (step.dependsOn && !context.stepResults.has(step.dependsOn)) {
        console.log(`[ApiChainer] Skipping step ${stepId}: dependency ${step.dependsOn} not executed`);
        failedSteps.push(stepId);
        continue;
      }

      console.log(`[ApiChainer] Executing step: ${step.name} (${stepId})`);
      
      const stepStart = Date.now();
      let stepResult: StepResult;

      try {
        // Transform request if needed
        let request = step;
        if (step.transformRequest) {
          request = step.transformRequest(step, context);
        }

        // Resolve tokens in URL
        const resolvedUrl = this.resolveTokens(request.url, context.tokens);
        
        // Resolve tokens in headers
        const resolvedHeaders: Record<string, string> = {};
        if (request.headers) {
          for (const [key, value] of Object.entries(request.headers)) {
            resolvedHeaders[key] = this.resolveTokens(value, context.tokens);
          }
        }

        // Resolve tokens in body
        let resolvedBody = request.body;
        if (typeof request.body === 'string') {
          resolvedBody = this.resolveTokens(request.body, context.tokens);
        } else if (typeof request.body === 'object') {
          resolvedBody = JSON.parse(this.resolveTokens(JSON.stringify(request.body), context.tokens));
        }

        // Execute the request
        const response = await fetchFn(resolvedUrl, {
          method: request.method,
          headers: resolvedHeaders,
          body: resolvedBody ? JSON.stringify(resolvedBody) : undefined,
        });

        // Validate response if validator provided
        if (request.validateResponse && !request.validateResponse(response, context)) {
          throw new Error(`Response validation failed for step ${stepId}`);
        }

        // Store response
        context.responses.set(stepId, response);
        
        // Parse JSON if applicable
        if (response.body && this.isJsonResponse(response)) {
          try {
            const data = JSON.parse(response.body);
            context.parsedData.set(stepId, data);
          } catch (e) {
            console.log(`[ApiChainer] Failed to parse JSON for step ${stepId}`);
          }
        }

        // Extract tokens
        const extractedTokens = this.extractTokens(response, step.tokenExtraction || [], context);
        Object.assign(context.tokens, extractedTokens);

        stepResult = {
          stepId,
          success: true,
          response,
          duration: Date.now() - stepStart,
          tokensExtracted: Object.keys(extractedTokens),
        };

        context.stepResults.set(stepId, stepResult);
        executedSteps.push(stepId);

        console.log(`[ApiChainer] Step ${stepId} succeeded, extracted tokens:`, Object.keys(extractedTokens));

      } catch (error: any) {
        stepResult = {
          stepId,
          success: false,
          error: error.message,
          duration: Date.now() - stepStart,
          tokensExtracted: [],
        };

        context.stepResults.set(stepId, stepResult);
        failedSteps.push(stepId);

        console.error(`[ApiChainer] Step ${stepId} failed:`, error.message);
      }
    }

    // Merge all parsed data
    const mergedData = this.mergeData(context.parsedData);

    return {
      success: failedSteps.length === 0,
      context,
      executedSteps,
      failedSteps,
      totalDuration: Date.now() - context.startTime,
      mergedData,
    };
  }

  /**
   * Create a Ford-specific API chain for pricing data.
   * This chain:
   * 1. Gets initial session from vehiclesmenu.data
   * 2. Captures Adobe Target tokens
   * 3. Attempts to fetch pricing.data with session tokens
   */
  static createFordPricingChain(vehicleCode: string): ApiChainer {
    const chainer = new ApiChainer();

    // Step 1: Get initial session data
    chainer.addStep({
      id: 'init',
      name: 'Initialize Session',
      url: 'https://www.ford.com.au/content/ford/au/en_au.vehiclesmenu.data',
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      tokenExtraction: [
        {
          name: 'fordSessionId',
          source: 'json',
          path: 'session.id',
        },
        {
          name: 'fordToken',
          source: 'json',
          path: 'token',
        },
        {
          name: 'mboxSession',
          source: 'json',
          path: 'mboxSession',
        },
      ],
    });

    // Step 2: Get Adobe Target token
    chainer.addStep({
      id: 'adobe-target',
      name: 'Get Adobe Target Token',
      url: 'https://fordapa.tt.omtrdc.net/m2/fordapa/mbox/json?mbox=target-global-mbox&mboxSession={{mboxSession}}',
      method: 'GET',
      dependsOn: 'init',
      headers: {
        'Accept': 'application/json',
      },
      tokenExtraction: [
        {
          name: 'adobeSessionId',
          source: 'json',
          path: 'sessionId',
        },
        {
          name: 'mboxPC',
          source: 'json',
          path: 'mboxPC',
        },
      ],
    });

    // Step 3: Try to fetch pricing data
    chainer.addStep({
      id: 'pricing',
      name: 'Fetch Pricing Data',
      url: `https://www.ford.com.au/content/ford/au/en_au/home/${vehicleCode}/pricing.data`,
      method: 'GET',
      dependsOn: 'adobe-target',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'X-Ford-Session': '{{fordSessionId}}',
        'X-Adobe-Session': '{{adobeSessionId}}',
        'X-Mbox-PC': '{{mboxPC}}',
      },
      validateResponse: (response) => {
        return response.status === 200 && 
               response.body !== null && 
               response.body.length > 100;
      },
    });

    // Step 4: Alternative pricing endpoint
    chainer.addStep({
      id: 'pricing-alt',
      name: 'Fetch Pricing Data (Alternative)',
      url: `https://www.ford.com.au/api/pricing/${vehicleCode}`,
      method: 'GET',
      dependsOn: 'adobe-target',
      condition: (context) => {
        // Only run if previous pricing step failed
        const pricingResult = context.stepResults.get('pricing');
        return !pricingResult?.success;
      },
      headers: {
        'Accept': 'application/json',
        'X-Ford-Session': '{{fordSessionId}}',
        'X-Adobe-Session': '{{adobeSessionId}}',
      },
    });

    return chainer;
  }

  // Private helper methods

  private resolveExecutionOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (stepId: string) => {
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected at step: ${stepId}`);
      }
      if (visited.has(stepId)) {
        return;
      }

      const step = this.steps.get(stepId);
      if (!step) {
        throw new Error(`Step not found: ${stepId}`);
      }

      visiting.add(stepId);

      if (step.dependsOn) {
        visit(step.dependsOn);
      }

      visiting.delete(stepId);
      visited.add(stepId);
      order.push(stepId);
    };

    for (const stepId of this.steps.keys()) {
      visit(stepId);
    }

    return order;
  }

  private resolveTokens(template: string, tokens: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return tokens[key] !== undefined ? tokens[key] : match;
    });
  }

  private extractTokens(
    response: NetworkResponse,
    configs: TokenExtractionConfig[],
    context: ChainContext
  ): Record<string, string> {
    const tokens: Record<string, string> = {};

    for (const config of configs) {
      try {
        let value: string | undefined;

        switch (config.source) {
          case 'json':
            if (response.body) {
              const data = context.parsedData.get(response.url) || JSON.parse(response.body);
              value = this.getValueByPath(data, config.path || '');
            }
            break;

          case 'header':
            value = response.headers[config.headerName || ''];
            break;

          case 'cookie':
            // Would need Set-Cookie header parsing
            const setCookie = response.headers['set-cookie'];
            if (setCookie && config.cookieName) {
              const match = setCookie.match(new RegExp(`${config.cookieName}=([^;]+)`));
              value = match?.[1];
            }
            break;

          case 'url':
            if (config.urlParam) {
              const url = new URL(response.url);
              value = url.searchParams.get(config.urlParam) || undefined;
            }
            break;
        }

        if (config.pattern && value) {
          const match = value.match(new RegExp(config.pattern));
          value = match?.[0] || value;
        }

        if (value !== undefined) {
          tokens[config.name] = String(value);
        } else if (config.defaultValue) {
          tokens[config.name] = config.defaultValue;
        }

      } catch (e) {
        console.log(`[ApiChainer] Failed to extract token ${config.name}:`, e);
      }
    }

    return tokens;
  }

  private getValueByPath(obj: any, path: string): string | undefined {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current !== undefined ? String(current) : undefined;
  }

  private isJsonResponse(response: NetworkResponse): boolean {
    return response.contentType?.includes('application/json') || 
           response.contentType?.includes('text/json') ||
           false;
  }

  private mergeData(parsedData: Map<string, any>): Record<string, any> {
    const merged: Record<string, any> = {};

    for (const [stepId, data] of parsedData) {
      merged[stepId] = data;

      // Also flatten nested data
      if (typeof data === 'object' && data !== null) {
        for (const [key, value] of Object.entries(data)) {
          if (!merged[key]) {
            merged[key] = value;
          }
        }
      }
    }

    return merged;
  }
}

export default ApiChainer;
