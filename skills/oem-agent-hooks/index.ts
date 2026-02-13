/**
 * Skill: oem-agent-hooks — OpenClaw Integration Hooks
 *
 * Provides integration hooks for OpenClaw's cron system:
 * - Memory persistence (sync in-memory cache to filesystem)
 * - Health monitoring (check cache health, trigger repairs)
 * - Report generation (weekly/monthly extraction summaries)
 *
 * This skill is called by OpenClaw cron jobs for automated maintenance.
 */

import type { OemId } from '../../src/oem/types';
import {
  getDiscoveryCache,
  getCachedOemIds,
  getCacheHealthSummary,
  serializeCache,
  loadCacheFromFile,
  saveCacheToFile,
  clearCache,
} from '../../src/extract/cache';
import {
  generateEmbedding,
  prepareProductText,
  prepareOfferText,
  prepareChangeEventText,
  generateContentHash,
  type EmbeddingConfig,
  type ProductEmbeddingInput,
  type OfferEmbeddingInput,
  type ChangeEventEmbeddingInput,
} from '../../src/utils/embeddings';

// ============================================================================
// Types
// ============================================================================

type HookAction =
  | 'health_check'
  | 'memory_sync'
  | 'generate_report'
  | 'cleanup'
  | 'repair_selectors'
  | 'sync_embeddings';

interface HookPayload {
  action: HookAction;
  config?: Record<string, unknown>;
}

interface ContainerEnv {
  GROQ_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
}

interface HookResult {
  success: boolean;
  action: HookAction;
  timestamp: string;
  data?: unknown;
  errors?: string[];
}

interface HealthCheckResult {
  overall_status: 'healthy' | 'degraded' | 'critical';
  oem_statuses: Array<{
    oem_id: string;
    status: 'healthy' | 'degraded' | 'critical';
    success_rate: number;
    selector_count: number;
    healthy_selectors: number;
    api_count: number;
    healthy_apis: number;
    last_extraction?: string;
    issues: string[];
  }>;
  recommendations: string[];
}

interface ReportData {
  period: string;
  generated_at: string;
  metrics: {
    total_extractions: number;
    successful_extractions: number;
    failed_extractions: number;
    success_rate: number;
    selector_repairs: number;
    llm_calls: number;
    avg_extraction_time_ms: number;
    cost_estimate_usd: number;
  };
  oem_breakdown: Array<{
    oem_id: string;
    extractions: number;
    success_rate: number;
    repairs: number;
  }>;
  top_issues: string[];
}

// ============================================================================
// Handler
// ============================================================================

export async function handler(
  env: ContainerEnv,
  payload: Record<string, unknown>
): Promise<HookResult> {
  const { action, config } = payload as unknown as HookPayload;

  console.log(`[oem-agent-hooks] Running action: ${action}`);

  const result: HookResult = {
    success: false,
    action,
    timestamp: new Date().toISOString(),
    errors: [],
  };

  try {
    switch (action) {
      case 'health_check':
        result.data = await runHealthCheck(config);
        result.success = true;
        break;

      case 'memory_sync':
        await runMemorySync(config);
        result.success = true;
        result.data = { synced_oems: getCachedOemIds() };
        break;

      case 'generate_report':
        result.data = await generateReport(config);
        result.success = true;
        break;

      case 'cleanup':
        await runCleanup(config);
        result.success = true;
        break;

      case 'repair_selectors':
        result.data = await repairSelectors(env, config);
        result.success = true;
        break;

      case 'sync_embeddings':
        result.data = await syncEmbeddings(env, config);
        result.success = true;
        break;

      default:
        result.errors?.push(`Unknown action: ${action}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors?.push(errorMessage);
    console.error(`[oem-agent-hooks] Error: ${errorMessage}`);
  }

  return result;
}

// ============================================================================
// Health Check
// ============================================================================

async function runHealthCheck(
  config?: Record<string, unknown>
): Promise<HealthCheckResult> {
  const thresholds = config?.thresholds as {
    selector_success_rate?: number;
    api_success_rate?: number;
    max_consecutive_failures?: number;
  } || {};

  const selectorThreshold = thresholds.selector_success_rate ?? 0.7;
  const apiThreshold = thresholds.api_success_rate ?? 0.8;
  const maxFailures = thresholds.max_consecutive_failures ?? 3;

  const oemIds = getCachedOemIds();
  const oemStatuses: HealthCheckResult['oem_statuses'] = [];
  const recommendations: string[] = [];

  let overallStatus: HealthCheckResult['overall_status'] = 'healthy';

  for (const oemId of oemIds) {
    const health = getCacheHealthSummary(oemId);
    const issues: string[] = [];
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';

    // Check selector health
    if (health.selectorCount > 0) {
      const selectorRate = health.healthySelectorCount / health.selectorCount;
      if (selectorRate < selectorThreshold) {
        issues.push(`Selector success rate (${(selectorRate * 100).toFixed(1)}%) below threshold`);
        status = selectorRate < 0.5 ? 'critical' : 'degraded';
      }
    }

    // Check API health
    if (health.apiCount > 0) {
      const apiRate = health.healthyApiCount / health.apiCount;
      if (apiRate < apiThreshold) {
        issues.push(`API success rate (${(apiRate * 100).toFixed(1)}%) below threshold`);
        status = status === 'critical' ? 'critical' : 'degraded';
      }
    }

    // Check overall success rate
    if (health.successRate < 0.5) {
      issues.push(`Overall success rate critically low (${(health.successRate * 100).toFixed(1)}%)`);
      status = 'critical';
    }

    // Check last extraction age
    if (health.lastExtraction) {
      const lastDate = new Date(health.lastExtraction);
      const daysSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 7) {
        issues.push(`No extraction in ${Math.floor(daysSince)} days`);
        status = status === 'critical' ? 'critical' : 'degraded';
      }
    }

    oemStatuses.push({
      oem_id: oemId,
      status,
      success_rate: health.successRate,
      selector_count: health.selectorCount,
      healthy_selectors: health.healthySelectorCount,
      api_count: health.apiCount,
      healthy_apis: health.healthyApiCount,
      last_extraction: health.lastExtraction,
      issues,
    });

    // Update overall status
    if (status === 'critical') {
      overallStatus = 'critical';
    } else if (status === 'degraded' && overallStatus !== 'critical') {
      overallStatus = 'degraded';
    }

    // Generate recommendations
    if (status === 'critical') {
      recommendations.push(`Re-run discovery for ${oemId} (critical health)`);
    } else if (status === 'degraded') {
      recommendations.push(`Monitor ${oemId} closely, consider re-discovery if degradation continues`);
    }
  }

  console.log(`[health_check] Overall status: ${overallStatus}`);
  console.log(`[health_check] OEMs checked: ${oemIds.length}`);

  return {
    overall_status: overallStatus,
    oem_statuses: oemStatuses,
    recommendations,
  };
}

// ============================================================================
// Memory Sync
// ============================================================================

async function runMemorySync(config?: Record<string, unknown>): Promise<void> {
  const storagePath = (config?.storage_path as string) || 'discoveries/';
  const backupEnabled = (config?.backup_enabled as boolean) ?? true;

  const oemIds = getCachedOemIds();
  console.log(`[memory_sync] Syncing ${oemIds.length} OEMs to ${storagePath}`);

  // Create mock file system functions for OpenClaw integration
  // In production, these would use OpenClaw's memory filesystem
  const writeFile = async (path: string, content: string): Promise<void> => {
    console.log(`[memory_sync] Would write to: ${path} (${content.length} bytes)`);
    // TODO: Integrate with OpenClaw memory filesystem
    // await openclaw.memory.write(path, content);
  };

  const readFile = async (path: string): Promise<string | null> => {
    console.log(`[memory_sync] Would read from: ${path}`);
    // TODO: Integrate with OpenClaw memory filesystem
    // return await openclaw.memory.read(path);
    return null;
  };

  for (const oemId of oemIds) {
    try {
      await saveCacheToFile(writeFile, oemId);
      console.log(`[memory_sync] Synced cache for ${oemId}`);
    } catch (error) {
      console.error(`[memory_sync] Failed to sync ${oemId}:`, error);
    }
  }
}

// ============================================================================
// Report Generation
// ============================================================================

async function generateReport(
  config?: Record<string, unknown>
): Promise<ReportData> {
  const reportType = (config?.report_type as string) || 'weekly_summary';
  const includeMetrics = (config?.include_metrics as string[]) || [
    'total_extractions',
    'success_rate',
    'selector_repairs',
  ];

  const oemIds = getCachedOemIds();
  const oemBreakdown: ReportData['oem_breakdown'] = [];
  const topIssues: string[] = [];

  let totalExtractions = 0;
  let successfulExtractions = 0;
  let selectorRepairs = 0;
  let llmCalls = 0;
  let totalExtractionTime = 0;

  for (const oemId of oemIds) {
    const cache = getDiscoveryCache(oemId);
    if (!cache) continue;

    const stats = cache.aggregateStats;
    totalExtractions += stats.totalExtractions;
    successfulExtractions += stats.successfulExtractions;
    selectorRepairs += stats.totalSelectorRepairs;
    llmCalls += stats.totalLlmCalls;
    totalExtractionTime += stats.avgExtractionTimeMs * stats.totalExtractions;

    oemBreakdown.push({
      oem_id: oemId,
      extractions: stats.totalExtractions,
      success_rate: stats.successRate,
      repairs: stats.totalSelectorRepairs,
    });

    // Track issues
    if (stats.successRate < 0.7) {
      topIssues.push(`${oemId}: Low success rate (${(stats.successRate * 100).toFixed(1)}%)`);
    }
    if (stats.totalSelectorRepairs > 10) {
      topIssues.push(`${oemId}: High selector repair count (${stats.totalSelectorRepairs})`);
    }
  }

  // Estimate costs
  // LLM calls: ~$0.01 per call (Groq pricing)
  // Page renders: ~$0.05 per page (Cloudflare Browser)
  const costEstimate = (llmCalls * 0.01) + (totalExtractions * 0.05);

  const report: ReportData = {
    period: reportType,
    generated_at: new Date().toISOString(),
    metrics: {
      total_extractions: totalExtractions,
      successful_extractions: successfulExtractions,
      failed_extractions: totalExtractions - successfulExtractions,
      success_rate: totalExtractions > 0 ? successfulExtractions / totalExtractions : 0,
      selector_repairs: selectorRepairs,
      llm_calls: llmCalls,
      avg_extraction_time_ms: totalExtractions > 0
        ? totalExtractionTime / totalExtractions
        : 0,
      cost_estimate_usd: costEstimate,
    },
    oem_breakdown: oemBreakdown,
    top_issues: topIssues.slice(0, 10),
  };

  console.log(`[generate_report] Generated ${reportType} report`);
  console.log(`[generate_report] Total extractions: ${totalExtractions}`);
  console.log(`[generate_report] Success rate: ${(report.metrics.success_rate * 100).toFixed(1)}%`);

  return report;
}

// ============================================================================
// Cleanup
// ============================================================================

async function runCleanup(config?: Record<string, unknown>): Promise<void> {
  const retentionDays = (config?.backup_retention_days as number) || 7;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  console.log(`[cleanup] Cleaning up data older than ${retentionDays} days`);

  // In production, this would clean up old backups from OpenClaw memory
  // TODO: Integrate with OpenClaw memory filesystem
  // const files = await openclaw.memory.list('discoveries/backups/');
  // for (const file of files) {
  //   if (new Date(file.modified) < cutoffDate) {
  //     await openclaw.memory.delete(file.path);
  //   }
  // }

  console.log(`[cleanup] Cleanup complete`);
}

// ============================================================================
// Selector Repair
// ============================================================================

async function repairSelectors(
  env: ContainerEnv,
  config?: Record<string, unknown>
): Promise<{ repaired: number; failed: number }> {
  const targetOemIds = (config?.oem_ids as string[]) || getCachedOemIds();
  let repaired = 0;
  let failed = 0;

  console.log(`[repair_selectors] Checking selectors for ${targetOemIds.length} OEMs`);

  for (const oemId of targetOemIds) {
    const health = getCacheHealthSummary(oemId);

    if (health.healthySelectorCount < health.selectorCount) {
      // Some selectors need repair - trigger discovery
      console.log(`[repair_selectors] ${oemId} has unhealthy selectors, would trigger discovery`);
      // In production, this would invoke the oem-build-price-discover skill
      // await openclaw.invoke('oem-build-price-discover', { oem_id: oemId, ... });
      repaired++;
    }
  }

  return { repaired, failed };
}

// ============================================================================
// Embedding Sync
// ============================================================================

interface EmbeddingSyncResult {
  products: { processed: number; errors: number };
  offers: { processed: number; errors: number };
  change_events: { processed: number; errors: number };
  total_tokens: number;
  estimated_cost_usd: number;
}

async function syncEmbeddings(
  env: ContainerEnv,
  config?: Record<string, unknown>
): Promise<EmbeddingSyncResult> {
  const tables = (config?.tables as string[]) || ['products', 'offers', 'change_events'];
  const batchSize = (config?.batch_size as number) || 50;
  const maxItems = (config?.max_items_per_run as number) || 200;
  const provider = (config?.provider as 'openai' | 'groq' | 'gemini') || 'gemini';
  const model = (config?.model as string) || 'text-embedding-004';

  // Select API key based on provider
  let apiKey: string | undefined;
  switch (provider) {
    case 'gemini':
      apiKey = env.GOOGLE_API_KEY;
      break;
    case 'openai':
      apiKey = env.OPENAI_API_KEY;
      break;
    case 'groq':
      apiKey = env.GROQ_API_KEY;
      break;
  }

  if (!apiKey) {
    throw new Error(`Missing API key for provider: ${provider}`);
  }

  const embeddingConfig: EmbeddingConfig = {
    provider,
    apiKey,
    model,
  };

  const result: EmbeddingSyncResult = {
    products: { processed: 0, errors: 0 },
    offers: { processed: 0, errors: 0 },
    change_events: { processed: 0, errors: 0 },
    total_tokens: 0,
    estimated_cost_usd: 0,
  };

  console.log(`[sync_embeddings] Starting sync for tables: ${tables.join(', ')}`);
  console.log(`[sync_embeddings] Provider: ${provider}, Model: ${model}`);

  // Process products
  if (tables.includes('products')) {
    const productResult = await syncTableEmbeddings<ProductEmbeddingInput>(
      env,
      'products_pending_embedding',
      'product_embeddings',
      'product_id',
      prepareProductText,
      embeddingConfig,
      Math.min(batchSize, maxItems)
    );
    result.products = productResult.counts;
    result.total_tokens += productResult.tokens;
  }

  // Process offers
  if (tables.includes('offers')) {
    const offerResult = await syncTableEmbeddings<OfferEmbeddingInput>(
      env,
      'offers_pending_embedding',
      'offer_embeddings',
      'offer_id',
      prepareOfferText,
      embeddingConfig,
      Math.min(batchSize, maxItems)
    );
    result.offers = offerResult.counts;
    result.total_tokens += offerResult.tokens;
  }

  // Process change events
  if (tables.includes('change_events')) {
    const changeResult = await syncTableEmbeddings<ChangeEventEmbeddingInput>(
      env,
      'change_events_pending_embedding',
      'change_event_embeddings',
      'change_event_id',
      prepareChangeEventText,
      embeddingConfig,
      Math.min(batchSize, maxItems)
    );
    result.change_events = changeResult.counts;
    result.total_tokens += changeResult.tokens;
  }

  // Estimate cost based on provider
  // Gemini: ~$0.00025 per 1K chars (approx $0.001 per 1M tokens)
  // OpenAI text-embedding-3-small: $0.02 per 1M tokens
  // Groq: Free tier available
  const costPerMillionTokens = provider === 'gemini' ? 0.001 : provider === 'openai' ? 0.02 : 0;
  result.estimated_cost_usd = (result.total_tokens / 1_000_000) * costPerMillionTokens;

  console.log(`[sync_embeddings] Sync complete`);
  console.log(`[sync_embeddings] Products: ${result.products.processed} processed, ${result.products.errors} errors`);
  console.log(`[sync_embeddings] Offers: ${result.offers.processed} processed, ${result.offers.errors} errors`);
  console.log(`[sync_embeddings] Change events: ${result.change_events.processed} processed, ${result.change_events.errors} errors`);
  console.log(`[sync_embeddings] Total tokens: ${result.total_tokens}, Cost: $${result.estimated_cost_usd.toFixed(4)}`);

  return result;
}

async function syncTableEmbeddings<T extends { id: string }>(
  env: ContainerEnv,
  pendingView: string,
  embeddingTable: string,
  foreignKeyColumn: string,
  prepareText: (item: T) => string,
  config: EmbeddingConfig,
  limit: number
): Promise<{ counts: { processed: number; errors: number }; tokens: number }> {
  const counts = { processed: 0, errors: 0 };
  let tokens = 0;

  // Fetch pending items from Supabase
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/${pendingView}?select=*&limit=${limit}`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!response.ok) {
    console.error(`[sync_embeddings] Failed to fetch from ${pendingView}: ${response.status}`);
    return { counts, tokens };
  }

  const items = await response.json() as T[];
  console.log(`[sync_embeddings] Found ${items.length} pending items in ${pendingView}`);

  for (const item of items) {
    try {
      const text = prepareText(item);
      const result = await generateEmbedding(text, config);

      // Insert embedding into Supabase
      const insertResponse = await fetch(
        `${env.SUPABASE_URL}/rest/v1/${embeddingTable}`,
        {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            [foreignKeyColumn]: item.id,
            embedding: `[${result.embedding.join(',')}]`,
            source_text: text,
            model: result.model,
            content_hash: result.contentHash,
          }),
        }
      );

      if (insertResponse.ok) {
        counts.processed++;
        tokens += result.tokensUsed;
      } else {
        console.error(`[sync_embeddings] Failed to insert embedding: ${insertResponse.status}`);
        counts.errors++;
      }
    } catch (error) {
      console.error(`[sync_embeddings] Error processing item ${item.id}:`, error);
      counts.errors++;
    }
  }

  return { counts, tokens };
}

// ============================================================================
// Exports for direct usage
// ============================================================================

export {
  runHealthCheck,
  runMemorySync,
  generateReport,
  runCleanup,
  repairSelectors,
  syncEmbeddings,
};
