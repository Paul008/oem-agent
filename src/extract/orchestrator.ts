/**
 * Extraction Orchestrator
 *
 * Routes extraction requests through the 4-layer architecture:
 *
 * Layer 1 (Research): Pre-crawl intelligence via Brave + Perplexity
 * Layer 2 (Fast Path): Cached selectors/APIs, no LLM calls
 * Layer 3 (Adaptive): Self-healing selector repair with LLM
 * Layer 4 (Discovery): Full AI-driven exploration for new OEMs
 *
 * Decision flow:
 * 1. Check cache for OEM discovery
 * 2. If cache exists → Layer 2 (Fast Path)
 * 3. If selector fails → Layer 3 (Adaptive)
 * 4. If too many failures → Layer 4 (Discovery)
 */

import type {
  ExtractionLayer,
  ExtractionStats,
  DiscoveryResult,
  SelfHealingSelectors,
} from '../../lib/shared/types';

import {
  getDiscoveryCache,
  createCacheFromDiscovery,
  setDiscoveryCache,
  updateCacheWithExtraction,
  getCacheHealthSummary,
  type DiscoveryCache,
} from './cache';

import {
  batchExtractWithSelfHealing,
  type SelfHealConfig,
  type ExtractContext,
  type BatchExtractResult,
  DEFAULT_SELF_HEAL_CONFIG,
} from './self-heal';

// ============================================================================
// Orchestrator Types
// ============================================================================

export interface OrchestratorConfig {
  /** Self-healing configuration */
  selfHeal: SelfHealConfig;

  /** Minimum cache health for Layer 2 (0-1) */
  minCacheHealthForFastPath: number;

  /** Maximum selector failures before triggering Layer 4 */
  maxFailuresBeforeDiscovery: number;

  /** Whether to auto-trigger discovery on cache miss */
  autoDiscovery: boolean;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  selfHeal: DEFAULT_SELF_HEAL_CONFIG,
  minCacheHealthForFastPath: 0.3,
  maxFailuresBeforeDiscovery: 5,
  autoDiscovery: false,
};

export interface OrchestrationResult {
  /** Which layer was used */
  layer: ExtractionLayer;

  /** Extracted values (key → value) */
  values: Record<string, string | null>;

  /** Extraction statistics */
  stats: ExtractionStats;

  /** Updated selectors (for caching) */
  updatedSelectors?: SelfHealingSelectors;

  /** Whether discovery is needed */
  needsDiscovery: boolean;

  /** Discovery reason if needed */
  discoveryReason?: string;

  /** Errors encountered */
  errors: string[];
}

// ============================================================================
// Layer Decision Logic
// ============================================================================

export interface LayerDecision {
  layer: ExtractionLayer;
  reason: string;
  cacheHealth?: ReturnType<typeof getCacheHealthSummary>;
}

/**
 * Determine which layer to use for extraction
 */
export function decideLayer(
  oemId: string,
  config: OrchestratorConfig = DEFAULT_ORCHESTRATOR_CONFIG
): LayerDecision {
  const cacheHealth = getCacheHealthSummary(oemId);

  // No cache → needs discovery (Layer 4)
  if (!cacheHealth.hasCache) {
    return {
      layer: 'L4_DISCOVERY',
      reason: 'No discovery cache exists for this OEM',
      cacheHealth,
    };
  }

  // Cache exists but too unhealthy → needs re-discovery
  const healthRatio = cacheHealth.healthySelectorCount / Math.max(cacheHealth.selectorCount, 1);
  if (healthRatio < config.minCacheHealthForFastPath) {
    return {
      layer: 'L4_DISCOVERY',
      reason: `Cache health too low: ${(healthRatio * 100).toFixed(1)}% < ${(config.minCacheHealthForFastPath * 100).toFixed(1)}%`,
      cacheHealth,
    };
  }

  // Cache is healthy → use Fast Path (Layer 2)
  // Self-healing (Layer 3) happens automatically on selector failure
  return {
    layer: 'L2_FAST_PATH',
    reason: `Cache healthy: ${cacheHealth.healthySelectorCount}/${cacheHealth.selectorCount} selectors working`,
    cacheHealth,
  };
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Main orchestration function - routes to appropriate layer
 */
export async function orchestrateExtraction(
  oemId: string,
  context: ExtractContext,
  config: OrchestratorConfig = DEFAULT_ORCHESTRATOR_CONFIG
): Promise<OrchestrationResult> {
  const decision = decideLayer(oemId, config);
  const errors: string[] = [];

  console.log(`[orchestrator] ${oemId}: Using ${decision.layer} - ${decision.reason}`);

  // Layer 4: Discovery needed
  if (decision.layer === 'L4_DISCOVERY') {
    return {
      layer: 'L4_DISCOVERY',
      values: {},
      stats: createEmptyStats(oemId, context.url, 'L4_DISCOVERY'),
      needsDiscovery: true,
      discoveryReason: decision.reason,
      errors: [],
    };
  }

  // Layer 2/3: Fast Path with Self-Healing
  const cache = getDiscoveryCache(oemId);
  if (!cache) {
    return {
      layer: 'L4_DISCOVERY',
      values: {},
      stats: createEmptyStats(oemId, context.url, 'L4_DISCOVERY'),
      needsDiscovery: true,
      discoveryReason: 'Cache disappeared during extraction',
      errors: [],
    };
  }

  // Set API key for self-healing
  const selfHealConfig = {
    ...config.selfHeal,
    llmApiKey: config.selfHeal.llmApiKey,
  };

  // Run batch extraction with self-healing
  const batchResult = await batchExtractWithSelfHealing(
    context,
    cache.selectors,
    selfHealConfig
  );

  // Extract values from results
  const values: Record<string, string | null> = {};
  for (const [key, result] of Object.entries(batchResult.results)) {
    values[key] = result.value;
    if (result.error) {
      errors.push(`${key}: ${result.error}`);
    }
  }

  // Update cache with results
  updateCacheWithExtraction(oemId, batchResult.stats, batchResult.updatedSelectors);

  // Check if we need discovery due to too many failures
  const failureRatio = batchResult.stats.selectorsFailed / Math.max(batchResult.stats.selectorsUsed, 1);
  const needsDiscovery = failureRatio > 0.5 && batchResult.stats.selectorsRepaired >= config.maxFailuresBeforeDiscovery;

  return {
    layer: batchResult.stats.layer,
    values,
    stats: batchResult.stats,
    updatedSelectors: batchResult.updatedSelectors,
    needsDiscovery,
    discoveryReason: needsDiscovery
      ? `Too many selector failures: ${batchResult.stats.selectorsFailed}/${batchResult.stats.selectorsUsed}`
      : undefined,
    errors,
  };
}

/**
 * Initialize cache from discovery result
 */
export function initializeCacheFromDiscovery(discovery: DiscoveryResult): DiscoveryCache {
  const cache = createCacheFromDiscovery(discovery);
  setDiscoveryCache(discovery.oem_id, cache);
  console.log(`[orchestrator] Initialized cache for ${discovery.oem_id}`);
  return cache;
}

/**
 * Create empty stats for failed/skipped extractions
 */
function createEmptyStats(
  oemId: string,
  url: string,
  layer: ExtractionLayer
): ExtractionStats {
  return {
    oemId,
    url,
    timestamp: new Date().toISOString(),
    layer,
    durationMs: 0,
    selectorsUsed: 0,
    selectorsFailed: 0,
    selectorsRepaired: 0,
    apisUsed: 0,
    llmCalls: 0,
    success: false,
  };
}

// ============================================================================
// API-Based Extraction (Layer 2 Fast Path - APIs)
// ============================================================================

export interface ApiExtractionConfig {
  /** Timeout for API calls (ms) */
  timeout: number;

  /** Headers to include */
  headers: Record<string, string>;

  /** Whether to use cached responses */
  useCache: boolean;
}

export const DEFAULT_API_CONFIG: ApiExtractionConfig = {
  timeout: 10000,
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'OEM-Agent/1.0',
  },
  useCache: true,
};

/**
 * Extract data via API (Layer 2 fast path)
 */
export async function extractViaApi<T>(
  apiUrl: string,
  transform: (response: unknown) => T | null,
  config: ApiExtractionConfig = DEFAULT_API_CONFIG
): Promise<{ data: T | null; error?: string; durationMs: number }> {
  const startTime = Date.now();

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: config.headers,
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      return {
        data: null,
        error: `API returned ${response.status}`,
        durationMs: Date.now() - startTime,
      };
    }

    const json = await response.json();
    const data = transform(json);

    return {
      data,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      data: null,
      error: `API call failed: ${error}`,
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Hybrid Extraction (API + DOM)
// ============================================================================

export interface HybridExtractionResult {
  /** Data from API calls */
  apiData: Record<string, unknown>;

  /** Data from DOM extraction */
  domData: Record<string, string | null>;

  /** Merged data (API takes priority) */
  merged: Record<string, unknown>;

  /** Statistics */
  stats: {
    apisUsed: number;
    apisSuccessful: number;
    selectorsUsed: number;
    selectorsSuccessful: number;
  };
}

/**
 * Hybrid extraction using both APIs and DOM
 */
export async function hybridExtraction(
  oemId: string,
  context: ExtractContext,
  config: OrchestratorConfig = DEFAULT_ORCHESTRATOR_CONFIG
): Promise<HybridExtractionResult> {
  const cache = getDiscoveryCache(oemId);

  const result: HybridExtractionResult = {
    apiData: {},
    domData: {},
    merged: {},
    stats: {
      apisUsed: 0,
      apisSuccessful: 0,
      selectorsUsed: 0,
      selectorsSuccessful: 0,
    },
  };

  // First, try APIs (fastest)
  if (cache?.apis) {
    for (const api of cache.apis.filter(a => a.isHealthy)) {
      result.stats.apisUsed++;

      const apiResult = await extractViaApi(api.url, (json) => json);

      if (apiResult.data) {
        result.stats.apisSuccessful++;
        result.apiData[api.url] = apiResult.data;
      }
    }
  }

  // Then, fill gaps with DOM extraction
  const domResult = await orchestrateExtraction(oemId, context, config);
  result.domData = domResult.values;
  result.stats.selectorsUsed = domResult.stats.selectorsUsed;
  result.stats.selectorsSuccessful = domResult.stats.selectorsUsed - domResult.stats.selectorsFailed;

  // Merge: API data takes priority
  result.merged = {
    ...result.domData,
    ...result.apiData,
  };

  return result;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get extraction layer name for logging
 */
export function getLayerName(layer: ExtractionLayer): string {
  switch (layer) {
    case 'L1_RESEARCH':
      return 'Research (Brave + Perplexity)';
    case 'L2_FAST_PATH':
      return 'Fast Path (Cached)';
    case 'L3_ADAPTIVE':
      return 'Adaptive (Self-Healing)';
    case 'L4_DISCOVERY':
      return 'Discovery (Full AI)';
    default:
      return layer;
  }
}

/**
 * Get recommended action based on orchestration result
 */
export function getRecommendedAction(result: OrchestrationResult): string {
  if (result.needsDiscovery) {
    return `Run oem-build-price-discover for this OEM: ${result.discoveryReason}`;
  }

  if (result.stats.selectorsRepaired > 0) {
    return `${result.stats.selectorsRepaired} selectors were repaired - consider re-running discovery to validate patterns`;
  }

  if (result.stats.selectorsFailed > 0) {
    return `${result.stats.selectorsFailed} selectors failed - monitor for degradation`;
  }

  return 'Extraction successful - no action needed';
}
