/**
 * Self-Healing Selector System (Layer 3: Adaptive Path)
 *
 * Implements self-healing CSS selectors inspired by Stagehand.
 * When a selector fails, uses LLM to find a new selector based on
 * semantic description.
 *
 * Architecture:
 * 1. Try cached selector (fast path)
 * 2. On failure, capture DOM + screenshot
 * 3. Send to LLM with semantic description
 * 4. Cache new selector for future use
 */

import type {
  SelectorConfig,
  SelectorRepairResult,
  ExtractionLayer,
  ExtractionStats,
  SelfHealingSelectors,
  SELECTOR_SEMANTICS,
} from '../../lib/shared/types';

// ============================================================================
// Configuration
// ============================================================================

export interface SelfHealConfig {
  /** Maximum failures before triggering repair */
  failureThreshold: number;

  /** LLM model to use for repair (e.g., "llama-3.1-70b-versatile") */
  llmModel: string;

  /** API endpoint for LLM */
  llmEndpoint: string;

  /** API key for LLM */
  llmApiKey: string;

  /** Maximum DOM size to send to LLM (chars) */
  maxDomSize: number;

  /** Whether to include screenshot in repair request */
  includeScreenshot: boolean;

  /** Timeout for LLM repair request (ms) */
  repairTimeoutMs: number;
}

export const DEFAULT_SELF_HEAL_CONFIG: SelfHealConfig = {
  failureThreshold: 2,
  llmModel: 'llama-3.1-70b-versatile',
  llmEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
  llmApiKey: '',
  maxDomSize: 50000,
  includeScreenshot: false, // Screenshots add cost
  repairTimeoutMs: 30000,
};

// ============================================================================
// Selector Utilities
// ============================================================================

/**
 * Create a SelectorConfig with default values
 */
export function createSelectorConfig(
  selector: string,
  semantic: string
): SelectorConfig {
  return {
    selector,
    semantic,
    lastVerified: new Date().toISOString(),
    successRate: 1.0,
    failureCount: 0,
    hitCount: 0,
    repairCount: 0,
  };
}

/**
 * Convert simple string selectors to SelectorConfig format
 */
export function upgradeLegacySelectors(
  legacySelectors: Record<string, string | undefined>,
  semantics: Record<string, string>
): SelfHealingSelectors {
  const result: SelfHealingSelectors = {};

  for (const [key, selector] of Object.entries(legacySelectors)) {
    if (selector) {
      (result as Record<string, SelectorConfig>)[key] = createSelectorConfig(
        selector,
        semantics[key] || `Extract ${key.replace(/_/g, ' ')}`
      );
    }
  }

  return result;
}

/**
 * Update selector stats after extraction attempt
 */
export function updateSelectorStats(
  config: SelectorConfig,
  success: boolean,
  wasRepaired: boolean = false
): SelectorConfig {
  const updated = { ...config };

  if (success) {
    updated.hitCount++;
    updated.failureCount = 0;
    updated.lastVerified = new Date().toISOString();

    // Update success rate (exponential moving average)
    updated.successRate = updated.successRate * 0.9 + 0.1;
  } else {
    updated.failureCount++;
    updated.successRate = updated.successRate * 0.9;
  }

  if (wasRepaired) {
    updated.repairCount++;
  }

  return updated;
}

// ============================================================================
// Self-Healing Extraction
// ============================================================================

export interface ExtractContext {
  /** Cheerio instance or DOM string */
  dom: string;

  /** Base64 screenshot (optional) */
  screenshot?: string;

  /** Page URL for context */
  url: string;

  /** OEM ID for context */
  oemId: string;
}

export interface ExtractResult<T> {
  value: T | null;
  layer: ExtractionLayer;
  selector: SelectorConfig;
  repaired: boolean;
  error?: string;
}

/**
 * Extract a value using self-healing selector
 *
 * Flow:
 * 1. Try selector (Layer 2: Fast Path)
 * 2. If fails and threshold reached, repair (Layer 3: Adaptive)
 * 3. Update stats and cache
 */
export async function extractWithSelfHealing<T>(
  context: ExtractContext,
  selectorConfig: SelectorConfig,
  extractFn: (element: string) => T | null,
  config: SelfHealConfig = DEFAULT_SELF_HEAL_CONFIG
): Promise<ExtractResult<T>> {
  const startTime = Date.now();

  // Layer 2: Fast Path - try cached selector
  try {
    const value = extractWithSelector(context.dom, selectorConfig.selector, extractFn);

    if (value !== null) {
      return {
        value,
        layer: 'L2_FAST_PATH',
        selector: updateSelectorStats(selectorConfig, true),
        repaired: false,
      };
    }

    // Selector returned null - count as failure
    selectorConfig = updateSelectorStats(selectorConfig, false);
  } catch (error) {
    // Selector threw error
    selectorConfig = updateSelectorStats(selectorConfig, false);
  }

  // Check if we should attempt repair
  if (selectorConfig.failureCount < config.failureThreshold) {
    return {
      value: null,
      layer: 'L2_FAST_PATH',
      selector: selectorConfig,
      repaired: false,
      error: `Selector failed (${selectorConfig.failureCount}/${config.failureThreshold} before repair)`,
    };
  }

  // Layer 3: Adaptive Path - repair selector with LLM
  console.log(`[self-heal] Repairing selector for: ${selectorConfig.semantic}`);

  const repairResult = await repairSelector(
    selectorConfig,
    context,
    config
  );

  if (!repairResult.success || !repairResult.newSelector) {
    return {
      value: null,
      layer: 'L3_ADAPTIVE',
      selector: selectorConfig,
      repaired: false,
      error: repairResult.error || 'Repair failed',
    };
  }

  // Try new selector
  try {
    const value = extractWithSelector(context.dom, repairResult.newSelector, extractFn);

    const repairedConfig: SelectorConfig = {
      ...selectorConfig,
      selector: repairResult.newSelector,
      lastVerified: new Date().toISOString(),
      failureCount: 0,
      repairCount: selectorConfig.repairCount + 1,
    };

    if (value !== null) {
      return {
        value,
        layer: 'L3_ADAPTIVE',
        selector: updateSelectorStats(repairedConfig, true),
        repaired: true,
      };
    }

    return {
      value: null,
      layer: 'L3_ADAPTIVE',
      selector: repairedConfig,
      repaired: true,
      error: 'Repaired selector returned null',
    };
  } catch (error) {
    return {
      value: null,
      layer: 'L3_ADAPTIVE',
      selector: selectorConfig,
      repaired: true,
      error: `Repaired selector threw: ${error}`,
    };
  }
}

/**
 * Simple selector extraction (no self-healing)
 */
function extractWithSelector<T>(
  dom: string,
  selector: string,
  extractFn: (element: string) => T | null
): T | null {
  // Use cheerio for DOM parsing
  const cheerio = require('cheerio');
  const $ = cheerio.load(dom);

  const element = $(selector).first();
  if (element.length === 0) {
    return null;
  }

  const html = element.html();
  const text = element.text().trim();

  // Try extraction function with text first, then HTML
  return extractFn(text) ?? extractFn(html);
}

// ============================================================================
// LLM Selector Repair
// ============================================================================

/**
 * Repair a broken selector using LLM
 */
async function repairSelector(
  selectorConfig: SelectorConfig,
  context: ExtractContext,
  config: SelfHealConfig
): Promise<SelectorRepairResult> {
  const startTime = Date.now();

  // Truncate DOM if needed
  let truncatedDom = context.dom;
  if (truncatedDom.length > config.maxDomSize) {
    truncatedDom = truncatedDom.substring(0, config.maxDomSize) + '\n... [truncated]';
  }

  const prompt = buildRepairPrompt(selectorConfig, truncatedDom, context);

  try {
    const response = await fetch(config.llmEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.llmApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.llmModel,
        messages: [
          {
            role: 'system',
            content: REPAIR_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(config.repairTimeoutMs),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        oldSelector: selectorConfig.selector,
        semantic: selectorConfig.semantic,
        layer: 'L3_ADAPTIVE',
        error: `LLM API error: ${response.status} - ${error}`,
      };
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim() || '';

    // Parse selector from response
    const newSelector = parseNewSelector(content);

    if (!newSelector) {
      return {
        success: false,
        oldSelector: selectorConfig.selector,
        semantic: selectorConfig.semantic,
        layer: 'L3_ADAPTIVE',
        error: `Could not parse selector from LLM response: ${content}`,
      };
    }

    return {
      success: true,
      oldSelector: selectorConfig.selector,
      newSelector,
      semantic: selectorConfig.semantic,
      layer: 'L3_ADAPTIVE',
      llmModel: config.llmModel,
      repairTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      oldSelector: selectorConfig.selector,
      semantic: selectorConfig.semantic,
      layer: 'L3_ADAPTIVE',
      error: `LLM request failed: ${error}`,
      repairTimeMs: Date.now() - startTime,
    };
  }
}

const REPAIR_SYSTEM_PROMPT = `You are a CSS selector expert for web scraping.

Your task is to find a working CSS selector for a specific element on a webpage.

Rules:
1. Return ONLY the CSS selector, nothing else
2. Use specific selectors (prefer class names, data attributes, aria labels)
3. Avoid overly generic selectors that might match multiple elements
4. Test mentally that your selector would work on the provided DOM

Example outputs:
.price-value
[data-testid="variant-price"]
.product-card .price span.amount
`;

function buildRepairPrompt(
  selectorConfig: SelectorConfig,
  dom: string,
  context: ExtractContext
): string {
  return `Find a CSS selector for the following element:

SEMANTIC DESCRIPTION: ${selectorConfig.semantic}

PREVIOUS SELECTOR (broken): ${selectorConfig.selector}

PAGE URL: ${context.url}
OEM: ${context.oemId}

DOM (may be truncated):
\`\`\`html
${dom}
\`\`\`

Return ONLY the new CSS selector.`;
}

function parseNewSelector(content: string): string | null {
  // Clean the response
  let selector = content.trim();

  // Remove markdown code blocks if present
  selector = selector.replace(/```[\w]*\n?/g, '').trim();

  // Remove quotes if wrapped
  if ((selector.startsWith('"') && selector.endsWith('"')) ||
      (selector.startsWith("'") && selector.endsWith("'"))) {
    selector = selector.slice(1, -1);
  }

  // Validate it looks like a CSS selector
  if (!selector || selector.length > 500) {
    return null;
  }

  // Basic validation - should start with valid selector characters
  if (!/^[.#\[\w]/.test(selector)) {
    return null;
  }

  return selector;
}

// ============================================================================
// Batch Extraction with Self-Healing
// ============================================================================

export interface BatchExtractResult {
  results: Record<string, ExtractResult<string>>;
  stats: ExtractionStats;
  updatedSelectors: SelfHealingSelectors;
}

/**
 * Extract multiple values using self-healing selectors
 */
export async function batchExtractWithSelfHealing(
  context: ExtractContext,
  selectors: SelfHealingSelectors,
  config: SelfHealConfig = DEFAULT_SELF_HEAL_CONFIG
): Promise<BatchExtractResult> {
  const startTime = Date.now();
  const results: Record<string, ExtractResult<string>> = {};
  const updatedSelectors: SelfHealingSelectors = {};

  let selectorsUsed = 0;
  let selectorsFailed = 0;
  let selectorsRepaired = 0;
  let llmCalls = 0;

  for (const [key, selectorConfig] of Object.entries(selectors)) {
    if (!selectorConfig) continue;

    selectorsUsed++;

    const result = await extractWithSelfHealing<string>(
      context,
      selectorConfig,
      (text) => text || null,
      config
    );

    results[key] = result;
    (updatedSelectors as Record<string, SelectorConfig>)[key] = result.selector;

    if (result.value === null) {
      selectorsFailed++;
    }

    if (result.repaired) {
      selectorsRepaired++;
    }

    if (result.layer === 'L3_ADAPTIVE') {
      llmCalls++;
    }
  }

  const stats: ExtractionStats = {
    oemId: context.oemId,
    url: context.url,
    timestamp: new Date().toISOString(),
    layer: selectorsRepaired > 0 ? 'L3_ADAPTIVE' : 'L2_FAST_PATH',
    durationMs: Date.now() - startTime,
    selectorsUsed,
    selectorsFailed,
    selectorsRepaired,
    apisUsed: 0,
    llmCalls,
    success: selectorsFailed < selectorsUsed / 2, // >50% success
  };

  return { results, stats, updatedSelectors };
}
