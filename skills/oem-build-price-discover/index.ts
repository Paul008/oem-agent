/**
 * Skill: oem-build-price-discover — Automated Configurator Pattern Discovery
 *
 * Crawls OEM build-and-price pages to discover:
 * - URL patterns for variant/color selection flows
 * - API endpoints returning vehicle data
 * - DOM selectors for prices, colors, disclaimers
 * - Interaction requirements (clicks needed to reveal data)
 *
 * Output is stored in agent memory and used to configure oem-extract skill.
 */

import type { OemId } from '../../src/oem/types';
import type {
  DiscoveryResult,
  ResearchFindings,
  DiscoveredApi,
  SelfHealingSelectors,
  SelectorConfig,
} from '../../lib/shared/types';
import { SELECTOR_SEMANTICS } from '../../lib/shared/types';
import {
  createCacheFromDiscovery,
  setDiscoveryCache,
  serializeCache,
} from '../../src/extract/cache';

interface DiscoveryPayload {
  oem_id: OemId;
  entry_url: string;
  max_variants?: number;      // Limit variants to analyze (default: 3)
  capture_screenshots?: boolean;
}

interface ContainerEnv {
  CDP_SECRET: string;
  WORKER_URL: string;
  GROQ_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  BRAVE_API_KEY?: string;          // Optional: Web search for research
  PERPLEXITY_API_KEY?: string;     // Optional: AI-powered research
}

interface CapturedNetworkRequest {
  url: string;
  method: string;
  contentType: string;
  responseBody?: string;
  timestamp: number;
}

interface CdpClient {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  on: (event: string, handler: (params: unknown) => void) => void;
  close: () => Promise<void>;
}

export async function handler(
  env: ContainerEnv,
  payload: Record<string, unknown>
): Promise<DiscoveryResult> {
  const {
    oem_id,
    entry_url,
    max_variants = 3,
    capture_screenshots = true
  } = payload as unknown as DiscoveryPayload;

  console.log(`[oem-build-price-discover] Starting discovery for ${oem_id}`);
  console.log(`[oem-build-price-discover] Entry URL: ${entry_url}`);

  const result: DiscoveryResult = {
    oem_id,
    discovered_at: new Date().toISOString(),
    entry_url,
    url_patterns: {},
    apis: [],
    selectors: {},
    selfHealingSelectors: {},
    strategy: {
      primary: 'dom',
      requires_js_render: true,
      requires_interaction: false,
    },
    models_found: [],
    variants_analyzed: 0,
    errors: [],
    stats: {
      totalExtractions: 0,
      successfulExtractions: 0,
      selectorRepairs: 0,
      avgExtractionTimeMs: 0,
    },
  };

  // Network interception storage
  const capturedRequests: CapturedNetworkRequest[] = [];

  try {
    // Phase 1: Research using Brave + Perplexity (if available)
    if (env.BRAVE_API_KEY || env.PERPLEXITY_API_KEY) {
      console.log(`[oem-build-price-discover] Starting research phase (L1_RESEARCH)...`);
      result.research = await conductResearch(env, oem_id, entry_url);
      console.log(`[oem-build-price-discover] Research complete:`, result.research);
    }

    // Phase 2: Active discovery with CDP (L4_DISCOVERY)
    console.log(`[oem-build-price-discover] Starting CDP discovery phase (L4_DISCOVERY)...`);

    // Step 1: Create CDP client and enable network interception
    const client = await createCdpClient(env);

    // Enable network interception to discover APIs
    await client.send('Network.enable');
    await client.send('Page.enable');

    // Set up network request capture
    client.on('Network.responseReceived', async (params: unknown) => {
      const { response, requestId } = params as {
        response: { url: string; mimeType: string; status: number };
        requestId: string;
      };

      // Only capture JSON responses (potential APIs)
      if (response.mimeType === 'application/json' && response.status === 200) {
        try {
          const bodyResult = await client.send('Network.getResponseBody', { requestId }) as { body: string };
          capturedRequests.push({
            url: response.url,
            method: 'GET', // Will be updated if needed
            contentType: response.mimeType,
            responseBody: bodyResult.body,
            timestamp: Date.now(),
          });
          console.log(`[oem-build-price-discover] Captured API: ${response.url}`);
        } catch {
          // Body may not be available for some responses
        }
      }
    });

    // Step 2: Navigate to entry URL
    console.log(`[oem-build-price-discover] Navigating to entry URL...`);
    await client.send('Page.navigate', { url: entry_url });
    await waitForPageLoad(client, 10000);

    // Step 3: Discover available models on the page
    const models = await discoverModels(client);
    result.models_found = models.map(m => m.name);
    console.log(`[oem-build-price-discover] Found ${models.length} models`);

    // Step 4: For each model (up to max_variants), discover the configurator flow
    for (const model of models.slice(0, max_variants)) {
      try {
        await discoverModelFlow(client, model, result, capturedRequests);
        result.variants_analyzed++;
        console.log(`[oem-build-price-discover] Analyzed model: ${model.name}`);
      } catch (error) {
        console.error(`[oem-build-price-discover] Error analyzing ${model.name}:`, error);
        result.errors?.push(`Failed to analyze ${model.name}: ${error}`);
      }
    }

    // Step 5: Analyze captured network requests for API patterns
    console.log(`[oem-build-price-discover] Analyzing ${capturedRequests.length} captured API requests...`);
    result.apis = await classifyApis(env, capturedRequests);

    // Step 6: Extract DOM selectors and create SelfHealingSelectors
    console.log(`[oem-build-price-discover] Extracting selectors...`);
    const { selectors, selfHealingSelectors } = await extractSelectors(client);
    result.selectors = selectors;
    result.selfHealingSelectors = selfHealingSelectors;

    // Step 7: Determine extraction strategy
    result.strategy = determineStrategy(result);
    console.log(`[oem-build-price-discover] Strategy: ${result.strategy.primary}`);

    // Step 8: Capture screenshots if requested
    if (capture_screenshots) {
      result.screenshots = await captureScreenshots(client, oem_id);
    }

    // Step 9: Initialize cache and store discovery
    const cache = createCacheFromDiscovery(result);
    setDiscoveryCache(oem_id, cache);
    console.log(`[oem-build-price-discover] Cache initialized for ${oem_id}`);

    // Step 10: Store discovery in agent memory
    await storeInMemory(env, result);

    // Clean up
    await client.close();
    console.log(`[oem-build-price-discover] Discovery complete for ${oem_id}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors?.push(errorMessage);
    console.error(`[oem-build-price-discover] Error: ${errorMessage}`);
  }

  return result;
}

// ============================================================================
// CDP Client & Network Interception
// ============================================================================

async function createCdpClient(env: ContainerEnv): Promise<CdpClient> {
  const cdpUrl = `${env.WORKER_URL}/cdp?secret=${encodeURIComponent(env.CDP_SECRET)}`;

  // Connect via WebSocket to CDP endpoint
  const ws = new WebSocket(cdpUrl);

  const pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  const eventHandlers = new Map<string, ((params: unknown) => void)[]>();
  let messageId = 1;

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (error) => reject(new Error(`WebSocket error: ${error}`));
    setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
  });

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data as string) as {
      id?: number;
      result?: unknown;
      error?: { message: string };
      method?: string;
      params?: unknown;
    };

    if (message.id !== undefined) {
      const pending = pendingRequests.get(message.id);
      if (pending) {
        pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      const handlers = eventHandlers.get(message.method) || [];
      for (const handler of handlers) {
        handler(message.params);
      }
    }
  };

  return {
    send: (method: string, params?: Record<string, unknown>) => {
      return new Promise((resolve, reject) => {
        const id = messageId++;
        pendingRequests.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new Error(`CDP request timeout: ${method}`));
          }
        }, 30000);
      });
    },
    on: (event: string, handler: (params: unknown) => void) => {
      const handlers = eventHandlers.get(event) || [];
      handlers.push(handler);
      eventHandlers.set(event, handlers);
    },
    close: async () => {
      ws.close();
    },
  };
}

async function waitForPageLoad(client: CdpClient, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    client.on('Page.loadEventFired', () => {
      clearTimeout(timeout);
      setTimeout(resolve, 1000); // Extra wait for dynamic content
    });
  });
}

// ============================================================================
// Model Discovery
// ============================================================================

interface DiscoveredModel {
  name: string;
  url?: string;
  element?: string;
}

async function discoverModels(client: CdpClient): Promise<DiscoveredModel[]> {
  const result = await client.send('Runtime.evaluate', {
    expression: `
      (function() {
        // Common patterns for vehicle model cards
        const selectors = [
          '[data-model]',
          '.model-card',
          '.vehicle-card',
          '.model-tile',
          '[data-vehicle-name]',
          '.car-card',
          '.product-card',
          '.range-item',
        ];

        const models = [];
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const name = el.getAttribute('data-model') ||
                        el.getAttribute('data-vehicle-name') ||
                        el.querySelector('h2, h3, .title, .name')?.textContent?.trim() ||
                        el.textContent?.trim().split('\\n')[0];

            const link = el.querySelector('a')?.href ||
                        (el.tagName === 'A' ? el.href : null);

            if (name && name.length < 100) {
              models.push({ name, url: link });
            }
          }
        }
        return models;
      })()
    `,
    returnByValue: true,
  }) as { result: { value: DiscoveredModel[] } };

  return result.result?.value || [];
}

// ============================================================================
// Configurator Flow Discovery
// ============================================================================

async function discoverModelFlow(
  client: CdpClient,
  model: DiscoveredModel,
  result: DiscoveryResult,
  capturedRequests: CapturedNetworkRequest[]
): Promise<void> {
  if (model.url) {
    // Navigate to model page
    await client.send('Page.navigate', { url: model.url });
    await waitForPageLoad(client, 8000);

    // Capture URL pattern for model page
    const currentUrl = await getCurrentUrl(client);
    if (currentUrl) {
      const pattern = extractUrlPattern(currentUrl, model.name);
      if (pattern) {
        result.url_patterns.model_index = {
          pattern: pattern.pattern,
          example: currentUrl,
          parameters: pattern.parameters,
        };
      }
    }

    // Look for variant selection step
    const variantUrl = await findAndClickStep(client, [
      '[data-step="variant"]',
      '.variant-selector',
      '.trim-selector',
      'button:contains("Select")',
      'a[href*="variant"]',
      'a[href*="trim"]',
    ]);

    if (variantUrl) {
      result.url_patterns.variant_selection = {
        pattern: extractUrlPattern(variantUrl, model.name)?.pattern || variantUrl,
        example: variantUrl,
        parameters: extractUrlPattern(variantUrl, model.name)?.parameters || [],
      };
    }

    // Look for color selection step
    const colorUrl = await findAndClickStep(client, [
      '[data-step="color"]',
      '.color-selector',
      '.exterior-colors',
      'button:contains("Color")',
      'a[href*="color"]',
    ]);

    if (colorUrl) {
      result.url_patterns.color_selection = {
        pattern: extractUrlPattern(colorUrl, model.name)?.pattern || colorUrl,
        example: colorUrl,
        parameters: extractUrlPattern(colorUrl, model.name)?.parameters || [],
      };
    }
  }
}

async function getCurrentUrl(client: CdpClient): Promise<string | null> {
  try {
    const result = await client.send('Runtime.evaluate', {
      expression: 'window.location.href',
      returnByValue: true,
    }) as { result: { value: string } };
    return result.result?.value || null;
  } catch {
    return null;
  }
}

async function findAndClickStep(
  client: CdpClient,
  selectors: string[]
): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const result = await client.send('Runtime.evaluate', {
        expression: `
          (function() {
            const el = document.querySelector('${selector}');
            if (el) {
              el.click();
              return true;
            }
            return false;
          })()
        `,
        returnByValue: true,
      }) as { result: { value: boolean } };

      if (result.result?.value) {
        await waitForPageLoad(client, 3000);
        return await getCurrentUrl(client);
      }
    } catch {
      // Try next selector
    }
  }
  return null;
}

function extractUrlPattern(
  url: string,
  modelName: string
): { pattern: string; parameters: string[] } | null {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/');
    const parameters: string[] = [];
    const patternParts: string[] = [];

    for (const part of pathParts) {
      if (part === '') {
        patternParts.push('');
      } else if (part.toLowerCase().includes(modelName.toLowerCase().replace(/\s+/g, ''))) {
        parameters.push('model');
        patternParts.push('{model}');
      } else if (/^\d+$/.test(part)) {
        parameters.push('id');
        patternParts.push('{id}');
      } else if (part.length === 36 && part.includes('-')) {
        parameters.push('uuid');
        patternParts.push('{uuid}');
      } else {
        patternParts.push(part);
      }
    }

    return {
      pattern: patternParts.join('/'),
      parameters,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// API Classification
// ============================================================================

async function classifyApis(
  env: ContainerEnv,
  capturedRequests: CapturedNetworkRequest[]
): Promise<DiscoveredApi[]> {
  const apis: DiscoveredApi[] = [];

  for (const request of capturedRequests) {
    // Skip non-vehicle related URLs
    if (!isVehicleRelatedUrl(request.url)) continue;

    try {
      const responseData = request.responseBody ? JSON.parse(request.responseBody) : null;
      if (!responseData) continue;

      // Use Groq to classify what data this API provides
      const classification = await classifyApiWithLlm(env, request.url, responseData);

      if (classification.provides.length > 0) {
        apis.push({
          url: request.url,
          method: request.method,
          content_type: request.contentType,
          provides: classification.provides,
          sample_response: responseData,
          headers_needed: {},
        });
      }
    } catch {
      // Skip invalid JSON responses
    }
  }

  return apis;
}

function isVehicleRelatedUrl(url: string): boolean {
  const vehicleKeywords = [
    'vehicle', 'model', 'variant', 'trim', 'color', 'price',
    'configurator', 'build', 'spec', 'feature', 'option',
    'disclaimer', 'inventory', 'stock', 'driveaway',
  ];

  const urlLower = url.toLowerCase();
  return vehicleKeywords.some(keyword => urlLower.includes(keyword));
}

async function classifyApiWithLlm(
  env: ContainerEnv,
  url: string,
  responseData: unknown
): Promise<{ provides: DiscoveredApi['provides'] }> {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are an API classifier for automotive websites. Analyze the API response and determine what vehicle data it provides.

Return a JSON array with any of these values that apply:
- "variants": vehicle trim levels, models, or versions
- "colors": exterior/interior color options
- "prices": pricing information (MSRP, drive-away, RRP)
- "features": vehicle features or specifications
- "disclaimers": legal disclaimers or terms

Example response: ["variants", "prices"]
Only return the JSON array, nothing else.`,
          },
          {
            role: 'user',
            content: `URL: ${url}\n\nResponse (first 2000 chars):\n${JSON.stringify(responseData).substring(0, 2000)}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 100,
      }),
    });

    if (response.ok) {
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content?.trim() || '[]';

      try {
        const provides = JSON.parse(content) as DiscoveredApi['provides'];
        return { provides };
      } catch {
        return { provides: [] };
      }
    }
  } catch (error) {
    console.error('[classifyApiWithLlm] Error:', error);
  }

  return { provides: [] };
}

// ============================================================================
// Selector Extraction with Self-Healing Support
// ============================================================================

interface ExtractedSelectors {
  selectors: DiscoveryResult['selectors'];
  selfHealingSelectors: SelfHealingSelectors;
}

async function extractSelectors(client: CdpClient): Promise<ExtractedSelectors> {
  const selectors: DiscoveryResult['selectors'] = {};
  const selfHealingSelectors: SelfHealingSelectors = {};

  // Define selector patterns to search for
  const selectorPatterns: Array<{
    key: keyof SelfHealingSelectors;
    patterns: string[];
  }> = [
    {
      key: 'variant_cards',
      patterns: ['.variant-card', '.trim-card', '[data-variant]', '.model-trim', '.grade-card'],
    },
    {
      key: 'variant_name',
      patterns: ['.variant-name', '.trim-name', '[data-variant-name]', '.grade-name', '.model-name'],
    },
    {
      key: 'variant_price',
      patterns: ['.variant-price', '.trim-price', '[data-price]', '.price-value', '.driveaway-price'],
    },
    {
      key: 'color_swatches',
      patterns: ['.color-swatch', '.color-option', '[data-color]', '.exterior-color', '.paint-swatch'],
    },
    {
      key: 'color_name',
      patterns: ['.color-name', '[data-color-name]', '.paint-name', '.selected-color'],
    },
    {
      key: 'color_code',
      patterns: ['[data-color-code]', '.color-code', '.paint-code'],
    },
    {
      key: 'color_price_delta',
      patterns: ['.color-price', '[data-color-price]', '.paint-price', '.color-additional'],
    },
    {
      key: 'disclaimer',
      patterns: ['.disclaimer', '.legal-text', '[data-disclaimer]', '.price-disclaimer', '.terms'],
    },
    {
      key: 'total_price',
      patterns: ['.total-price', '.final-price', '[data-total]', '.summary-price', '.configured-price'],
    },
    {
      key: 'price_type_label',
      patterns: ['.price-type', '.price-label', '[data-price-type]', '.driveaway-label', '.rrp-label'],
    },
  ];

  for (const { key, patterns } of selectorPatterns) {
    const foundSelector = await findWorkingSelector(client, patterns);

    if (foundSelector) {
      // Set legacy selector
      (selectors as Record<string, string>)[key] = foundSelector;

      // Create self-healing selector config
      const selectorConfig: SelectorConfig = {
        selector: foundSelector,
        semantic: SELECTOR_SEMANTICS[key],
        lastVerified: new Date().toISOString(),
        successRate: 1.0,
        failureCount: 0,
        hitCount: 0,
        repairCount: 0,
      };

      (selfHealingSelectors as Record<string, SelectorConfig>)[key] = selectorConfig;
    }
  }

  return { selectors, selfHealingSelectors };
}

async function findWorkingSelector(
  client: CdpClient,
  patterns: string[]
): Promise<string | null> {
  for (const pattern of patterns) {
    try {
      const result = await client.send('Runtime.evaluate', {
        expression: `document.querySelector('${pattern}') !== null`,
        returnByValue: true,
      }) as { result: { value: boolean } };

      if (result.result?.value) {
        return pattern;
      }
    } catch {
      // Try next pattern
    }
  }
  return null;
}

// ============================================================================
// Strategy Determination
// ============================================================================

function determineStrategy(result: DiscoveryResult): DiscoveryResult['strategy'] {
  const hasApis = result.apis.length > 0;
  const apiProvidesAll = result.apis.some(api =>
    api.provides.includes('variants') &&
    api.provides.includes('prices')
  );
  const hasSelectors = Object.keys(result.selectors).length >= 3;

  // Determine primary strategy
  let primary: 'api' | 'dom' | 'hybrid' = 'dom';
  if (apiProvidesAll) {
    primary = 'api';
  } else if (hasApis && hasSelectors) {
    primary = 'hybrid';
  }

  // Determine JS render requirement
  const requiresJsRender = true; // Most modern configurators need JS

  // Determine if interaction is needed
  const requiresInteraction = result.url_patterns.variant_selection !== undefined ||
    result.url_patterns.color_selection !== undefined;

  const interactionSteps: string[] = [];
  if (result.url_patterns.variant_selection) {
    interactionSteps.push('Select variant');
  }
  if (result.url_patterns.color_selection) {
    interactionSteps.push('Select color');
  }

  return {
    primary,
    requires_js_render: requiresJsRender,
    requires_interaction: requiresInteraction,
    interaction_steps: interactionSteps.length > 0 ? interactionSteps : undefined,
  };
}

// ============================================================================
// Screenshot Capture
// ============================================================================

async function captureScreenshots(
  client: CdpClient,
  oemId: string
): Promise<string[]> {
  const screenshots: string[] = [];

  try {
    const result = await client.send('Page.captureScreenshot', {
      format: 'png',
      quality: 80,
    }) as { data: string };

    if (result.data) {
      screenshots.push(`data:image/png;base64,${result.data}`);
    }
  } catch (error) {
    console.error(`[captureScreenshots] Error: ${error}`);
  }

  return screenshots;
}

// ============================================================================
// Memory Storage
// ============================================================================

async function storeInMemory(
  env: ContainerEnv,
  result: DiscoveryResult
): Promise<void> {
  // Create cache and serialize
  const cache = createCacheFromDiscovery(result);
  const cacheJson = serializeCache(cache);

  // Log the discovery (in production, this would write to OpenClaw memory)
  console.log(`[storeInMemory] Discovery result for ${result.oem_id}:`);
  console.log(`  - Models found: ${result.models_found.length}`);
  console.log(`  - APIs discovered: ${result.apis.length}`);
  console.log(`  - Selectors found: ${Object.keys(result.selectors).length}`);
  console.log(`  - Self-healing selectors: ${Object.keys(result.selfHealingSelectors || {}).length}`);
  console.log(`  - Strategy: ${result.strategy.primary}`);

  // TODO: Write to OpenClaw memory filesystem when integrated
  // await writeFile(`discoveries/${result.oem_id}.json`, cacheJson);
  // await writeFile(`memory/oem-discovery/${result.oem_id}.md`, generateMarkdownSummary(result));
}

// ============================================================================
// Research Phase: Brave + Perplexity
// ============================================================================

async function conductResearch(
  env: ContainerEnv,
  oem_id: string,
  entry_url: string
): Promise<ResearchFindings> {
  const findings: ResearchFindings = {};
  const domain = new URL(entry_url).hostname;
  const oemName = oem_id.replace('-au', '').replace('-', ' ');

  // Brave Search: Find existing knowledge
  if (env.BRAVE_API_KEY) {
    const braveResults = await braveSearch(env.BRAVE_API_KEY, [
      `${oemName} Australia website technology stack`,
      `${domain} API endpoints configurator`,
      `${oemName} build and price React Vue Angular`,
      `automotive configurator ${oemName} developer`,
    ]);

    findings.relevant_sources = braveResults.urls;
    findings.tech_stack = braveResults.tech_hints;
    findings.known_apis = braveResults.api_hints;
  }

  // Perplexity: AI-powered research synthesis
  if (env.PERPLEXITY_API_KEY) {
    const perplexityResult = await perplexityResearch(env.PERPLEXITY_API_KEY, `
      I'm building a web scraper for ${oemName} Australia's vehicle configurator at ${entry_url}.

      Help me understand:
      1. What technology stack does ${domain} use? (React, Vue, Angular, CMS like AEM/Sitecore?)
      2. Do they have documented APIs for vehicle data?
      3. What's the typical URL pattern for automotive build-and-price configurators?
      4. Are there similar OEM websites I can reference for patterns?
      5. What data structure should I expect for variants, colors, and pricing?

      Be specific with any URLs, API endpoints, or code patterns you find.
    `);

    findings.pattern_hints = perplexityResult.patterns;
    findings.cms_platform = perplexityResult.cms;
    findings.similar_oems = perplexityResult.similar_oems;
  }

  return findings;
}

async function braveSearch(
  apiKey: string,
  queries: string[]
): Promise<{ urls: string[]; tech_hints: string[]; api_hints: string[] }> {
  const urls: string[] = [];
  const tech_hints: string[] = [];
  const api_hints: string[] = [];

  for (const query of queries) {
    try {
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey,
        },
      });

      if (response.ok) {
        const data = await response.json() as { web?: { results?: Array<{ url: string; description: string }> } };
        const results = data.web?.results || [];

        for (const result of results.slice(0, 3)) {
          urls.push(result.url);

          // Look for tech stack hints
          const desc = result.description.toLowerCase();
          if (desc.includes('react')) tech_hints.push('React');
          if (desc.includes('vue')) tech_hints.push('Vue');
          if (desc.includes('angular')) tech_hints.push('Angular');
          if (desc.includes('next.js') || desc.includes('nextjs')) tech_hints.push('Next.js');
          if (desc.includes('aem') || desc.includes('adobe experience')) tech_hints.push('Adobe AEM');
          if (desc.includes('sitecore')) tech_hints.push('Sitecore');

          // Look for API hints
          if (desc.includes('/api/') || desc.includes('endpoint')) {
            api_hints.push(result.description);
          }
        }
      }
    } catch (error) {
      console.error(`[braveSearch] Error for query "${query}":`, error);
    }
  }

  return {
    urls: [...new Set(urls)],
    tech_hints: [...new Set(tech_hints)],
    api_hints: [...new Set(api_hints)],
  };
}

async function perplexityResearch(
  apiKey: string,
  prompt: string
): Promise<{ patterns: string[]; cms?: string; similar_oems: string[] }> {
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a web scraping expert specializing in automotive websites. Provide specific, actionable technical details about website architecture, API patterns, and data structures.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (response.ok) {
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content || '';

      // Parse the response for structured data
      const patterns: string[] = [];
      const similar_oems: string[] = [];
      let cms: string | undefined;

      // Extract patterns mentioned
      const patternMatches = content.match(/\/[\w\-\/\{\}\.]+/g);
      if (patternMatches) {
        patterns.push(...patternMatches.slice(0, 5));
      }

      // Extract CMS mentions
      if (content.toLowerCase().includes('adobe aem') || content.toLowerCase().includes('experience manager')) {
        cms = 'Adobe AEM';
      } else if (content.toLowerCase().includes('sitecore')) {
        cms = 'Sitecore';
      } else if (content.toLowerCase().includes('wordpress')) {
        cms = 'WordPress';
      } else if (content.toLowerCase().includes('drupal')) {
        cms = 'Drupal';
      }

      // Extract similar OEM mentions
      const oemKeywords = ['toyota', 'honda', 'ford', 'mazda', 'hyundai', 'nissan', 'volkswagen', 'bmw', 'mercedes'];
      for (const oem of oemKeywords) {
        if (content.toLowerCase().includes(oem)) {
          similar_oems.push(oem);
        }
      }

      return { patterns, cms, similar_oems };
    }
  } catch (error) {
    console.error('[perplexityResearch] Error:', error);
  }

  return { patterns: [], similar_oems: [] };
}
