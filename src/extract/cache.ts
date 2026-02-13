/**
 * Discovery Cache System
 *
 * Manages caching of OEM discovery results including:
 * - Self-healing selectors
 * - API endpoints
 * - URL patterns
 * - Extraction statistics
 *
 * Integrates with OpenClaw memory system for persistence.
 */

import type {
  DiscoveryResult,
  SelfHealingSelectors,
  SelectorConfig,
  ExtractionStats,
  DiscoveredApi,
} from '../../lib/shared/types';

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheEntry<T> {
  data: T;
  cachedAt: string;
  expiresAt: string;
  hitCount: number;
  lastAccessed: string;
}

export interface DiscoveryCache {
  /** OEM ID */
  oemId: string;

  /** Version for cache invalidation */
  version: number;

  /** When the cache was created */
  createdAt: string;

  /** When the cache was last updated */
  updatedAt: string;

  /** Full discovery result */
  discovery: DiscoveryResult;

  /** Cached selectors with stats */
  selectors: SelfHealingSelectors;

  /** Cached APIs with usage stats */
  apis: CachedApi[];

  /** Extraction statistics history (last 100) */
  statsHistory: ExtractionStats[];

  /** Aggregate statistics */
  aggregateStats: AggregateStats;
}

export interface CachedApi extends DiscoveredApi {
  /** Number of successful calls */
  hitCount: number;

  /** Number of failed calls */
  missCount: number;

  /** Average response time (ms) */
  avgResponseTimeMs: number;

  /** Last successful call */
  lastSuccess?: string;

  /** Last failure */
  lastFailure?: string;

  /** Is currently working */
  isHealthy: boolean;
}

export interface AggregateStats {
  totalExtractions: number;
  successfulExtractions: number;
  failedExtractions: number;
  totalSelectorRepairs: number;
  totalLlmCalls: number;
  avgExtractionTimeMs: number;
  lastExtraction?: string;
  successRate: number;
}

// ============================================================================
// In-Memory Cache
// ============================================================================

const memoryCache = new Map<string, DiscoveryCache>();

/**
 * Get discovery cache for an OEM
 */
export function getDiscoveryCache(oemId: string): DiscoveryCache | null {
  return memoryCache.get(oemId) || null;
}

/**
 * Set discovery cache for an OEM
 */
export function setDiscoveryCache(oemId: string, cache: DiscoveryCache): void {
  memoryCache.set(oemId, cache);
}

/**
 * Create initial cache from discovery result
 */
export function createCacheFromDiscovery(
  discovery: DiscoveryResult
): DiscoveryCache {
  const now = new Date().toISOString();

  // Convert APIs to cached format
  const cachedApis: CachedApi[] = discovery.apis.map(api => ({
    ...api,
    hitCount: 0,
    missCount: 0,
    avgResponseTimeMs: 0,
    isHealthy: true,
  }));

  return {
    oemId: discovery.oem_id,
    version: 1,
    createdAt: now,
    updatedAt: now,
    discovery,
    selectors: discovery.selfHealingSelectors || {},
    apis: cachedApis,
    statsHistory: [],
    aggregateStats: {
      totalExtractions: 0,
      successfulExtractions: 0,
      failedExtractions: 0,
      totalSelectorRepairs: 0,
      totalLlmCalls: 0,
      avgExtractionTimeMs: 0,
      successRate: 1.0,
    },
  };
}

/**
 * Update cache with extraction result
 */
export function updateCacheWithExtraction(
  oemId: string,
  stats: ExtractionStats,
  updatedSelectors?: SelfHealingSelectors
): DiscoveryCache | null {
  const cache = getDiscoveryCache(oemId);
  if (!cache) return null;

  const now = new Date().toISOString();

  // Update selectors if provided
  if (updatedSelectors) {
    cache.selectors = {
      ...cache.selectors,
      ...updatedSelectors,
    };
  }

  // Add to stats history (keep last 100)
  cache.statsHistory.push(stats);
  if (cache.statsHistory.length > 100) {
    cache.statsHistory.shift();
  }

  // Update aggregate stats
  const agg = cache.aggregateStats;
  agg.totalExtractions++;
  if (stats.success) {
    agg.successfulExtractions++;
  } else {
    agg.failedExtractions++;
  }
  agg.totalSelectorRepairs += stats.selectorsRepaired;
  agg.totalLlmCalls += stats.llmCalls;
  agg.lastExtraction = now;

  // Update average extraction time (exponential moving average)
  agg.avgExtractionTimeMs = agg.avgExtractionTimeMs * 0.9 + stats.durationMs * 0.1;

  // Update success rate
  agg.successRate = agg.successfulExtractions / agg.totalExtractions;

  cache.updatedAt = now;
  setDiscoveryCache(oemId, cache);

  return cache;
}

// ============================================================================
// Selector Cache Operations
// ============================================================================

/**
 * Get selector from cache
 */
export function getCachedSelector(
  oemId: string,
  selectorKey: string
): SelectorConfig | null {
  const cache = getDiscoveryCache(oemId);
  if (!cache) return null;

  return (cache.selectors as Record<string, SelectorConfig | undefined>)[selectorKey] || null;
}

/**
 * Update a single selector in cache
 */
export function updateCachedSelector(
  oemId: string,
  selectorKey: string,
  selector: SelectorConfig
): void {
  const cache = getDiscoveryCache(oemId);
  if (!cache) return;

  (cache.selectors as Record<string, SelectorConfig>)[selectorKey] = selector;
  cache.updatedAt = new Date().toISOString();
  setDiscoveryCache(oemId, cache);
}

/**
 * Get all selectors for an OEM
 */
export function getAllCachedSelectors(
  oemId: string
): SelfHealingSelectors | null {
  const cache = getDiscoveryCache(oemId);
  return cache?.selectors || null;
}

// ============================================================================
// API Cache Operations
// ============================================================================

/**
 * Get cached API by URL pattern
 */
export function getCachedApi(
  oemId: string,
  urlPattern: string
): CachedApi | null {
  const cache = getDiscoveryCache(oemId);
  if (!cache) return null;

  return cache.apis.find(api =>
    api.url === urlPattern || api.url.includes(urlPattern)
  ) || null;
}

/**
 * Update API stats after a call
 */
export function updateApiStats(
  oemId: string,
  apiUrl: string,
  success: boolean,
  responseTimeMs: number
): void {
  const cache = getDiscoveryCache(oemId);
  if (!cache) return;

  const api = cache.apis.find(a => a.url === apiUrl);
  if (!api) return;

  const now = new Date().toISOString();

  if (success) {
    api.hitCount++;
    api.lastSuccess = now;
    api.avgResponseTimeMs = api.avgResponseTimeMs * 0.9 + responseTimeMs * 0.1;
    api.isHealthy = true;
  } else {
    api.missCount++;
    api.lastFailure = now;
    // Mark as unhealthy if >3 consecutive failures
    if (api.missCount > 3 && (!api.lastSuccess || api.lastSuccess < api.lastFailure)) {
      api.isHealthy = false;
    }
  }

  cache.updatedAt = now;
  setDiscoveryCache(oemId, cache);
}

/**
 * Get healthy APIs for an OEM
 */
export function getHealthyApis(oemId: string): CachedApi[] {
  const cache = getDiscoveryCache(oemId);
  if (!cache) return [];

  return cache.apis.filter(api => api.isHealthy);
}

// ============================================================================
// Persistence (OpenClaw Memory Integration)
// ============================================================================

/**
 * Serialize cache to JSON for storage
 */
export function serializeCache(cache: DiscoveryCache): string {
  return JSON.stringify(cache, null, 2);
}

/**
 * Deserialize cache from JSON
 */
export function deserializeCache(json: string): DiscoveryCache | null {
  try {
    const cache = JSON.parse(json) as DiscoveryCache;
    // Validate required fields
    if (!cache.oemId || !cache.discovery) {
      return null;
    }
    return cache;
  } catch {
    return null;
  }
}

/**
 * Generate cache file path for OpenClaw memory
 */
export function getCacheFilePath(oemId: string): string {
  return `discoveries/${oemId}.json`;
}

/**
 * Load cache from file (for skill initialization)
 */
export async function loadCacheFromFile(
  readFile: (path: string) => Promise<string | null>,
  oemId: string
): Promise<DiscoveryCache | null> {
  const path = getCacheFilePath(oemId);
  const content = await readFile(path);

  if (!content) return null;

  const cache = deserializeCache(content);
  if (cache) {
    setDiscoveryCache(oemId, cache);
  }

  return cache;
}

/**
 * Save cache to file (for skill cleanup)
 */
export async function saveCacheToFile(
  writeFile: (path: string, content: string) => Promise<void>,
  oemId: string
): Promise<void> {
  const cache = getDiscoveryCache(oemId);
  if (!cache) return;

  const path = getCacheFilePath(oemId);
  const content = serializeCache(cache);
  await writeFile(path, content);
}

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Get cache health summary
 */
export function getCacheHealthSummary(oemId: string): {
  hasCache: boolean;
  selectorCount: number;
  healthySelectorCount: number;
  apiCount: number;
  healthyApiCount: number;
  successRate: number;
  lastExtraction?: string;
} {
  const cache = getDiscoveryCache(oemId);

  if (!cache) {
    return {
      hasCache: false,
      selectorCount: 0,
      healthySelectorCount: 0,
      apiCount: 0,
      healthyApiCount: 0,
      successRate: 0,
    };
  }

  const selectors = Object.values(cache.selectors).filter(Boolean) as SelectorConfig[];
  const healthySelectors = selectors.filter(s => s.successRate > 0.5);

  return {
    hasCache: true,
    selectorCount: selectors.length,
    healthySelectorCount: healthySelectors.length,
    apiCount: cache.apis.length,
    healthyApiCount: cache.apis.filter(a => a.isHealthy).length,
    successRate: cache.aggregateStats.successRate,
    lastExtraction: cache.aggregateStats.lastExtraction,
  };
}

/**
 * Clear cache for an OEM (e.g., before re-discovery)
 */
export function clearCache(oemId: string): void {
  memoryCache.delete(oemId);
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  memoryCache.clear();
}

/**
 * Get all cached OEM IDs
 */
export function getCachedOemIds(): string[] {
  return Array.from(memoryCache.keys());
}
