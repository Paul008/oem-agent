/**
 * Crawl Scheduler
 * 
 * Cost-controlled scheduling system for OEM page crawling.
 * Implements Section 3 (Crawl Schedule) and Section 4.3 (Change Detection) from spec.
 */

import type { OemId, PageType, SourcePage, CrawlSchedule } from '../oem/types';
import { getOemDefinition } from '../oem/registry';

// ============================================================================
// Schedule Configuration (from spec Section 3.1)
// ============================================================================

export const DEFAULT_SCHEDULE: CrawlSchedule = {
  homepage_minutes: 120,    // Every 2 hours
  offers_minutes: 240,      // Every 4 hours
  vehicles_minutes: 720,    // Every 12 hours
  news_minutes: 1440,       // Every 24 hours
};

export const PAGE_TYPE_SCHEDULE: Record<PageType, number> = {
  homepage: 120,      // 2 hours
  offers: 240,        // 4 hours
  vehicle: 720,       // 12 hours
  news: 1440,         // 24 hours
  sitemap: 1440,      // 24 hours
  price_guide: 1440,  // 24 hours
  category: 720,      // 12 hours
  build_price: 720,   // 12 hours (configurator pages)
  other: 720,         // 12 hours
};

// ============================================================================
// Cost Control Rules (from spec Section 3.3)
// ============================================================================

export interface CostControlConfig {
  /** Skip render if cheap check shows no change */
  skipRenderOnNoChange: boolean;
  /** Max 1 full render per page per N minutes */
  maxRenderIntervalMinutes: number;
  /** Monthly render cap per OEM */
  monthlyRenderCapPerOem: number;
  /** Global monthly render cap */
  globalMonthlyRenderCap: number;
  /** Backoff: reduce check frequency by 50% if no change for N days */
  backoffAfterDays: number;
  /** Backoff multiplier (0.5 = reduce by 50%) */
  backoffMultiplier: number;
}

export const DEFAULT_COST_CONTROL: CostControlConfig = {
  skipRenderOnNoChange: true,
  maxRenderIntervalMinutes: 120, // Max 1 render per 2 hours
  monthlyRenderCapPerOem: 1000,
  globalMonthlyRenderCap: 10000,
  backoffAfterDays: 7,
  backoffMultiplier: 0.5,
};

// ============================================================================
// Scheduler State
// ============================================================================

export interface SchedulerState {
  oemId: OemId;
  url: string;
  pageType: PageType;
  lastCheckedAt: Date | null;
  lastChangedAt: Date | null;
  lastRenderedAt: Date | null;
  consecutiveNoChange: number;
  currentIntervalMinutes: number;
}

// ============================================================================
// Scheduler Class
// ============================================================================

export class CrawlScheduler {
  private config: CostControlConfig;

  constructor(config: Partial<CostControlConfig> = {}) {
    this.config = { ...DEFAULT_COST_CONTROL, ...config };
  }

  /**
   * Determine if a page should be crawled based on schedule and cost controls.
   * 
   * Implements the logic from spec Section 3:
   * - Cheap check frequency based on page type
   * - Full render only if HTML hash changed
   * - Max 1 render per page per 2 hours
   * - Backoff on repeated no-change
   */
  shouldCrawl(
    page: SourcePage,
    now: Date = new Date()
  ): { shouldCrawl: boolean; reason: string; nextCheckAt: Date } {
    const scheduleMinutes = this.getScheduleForPageType(page.page_type);
    
    // Calculate effective interval (with backoff if applicable)
    let effectiveIntervalMinutes = scheduleMinutes;
    
    if (page.consecutive_no_change >= this.config.backoffAfterDays * (1440 / scheduleMinutes)) {
      // Apply backoff: reduce frequency by 50%
      effectiveIntervalMinutes = Math.floor(scheduleMinutes / this.config.backoffMultiplier);
    }

    // Check if enough time has passed since last check
    if (page.last_checked_at) {
      const lastChecked = new Date(page.last_checked_at);
      const minutesSinceLastCheck = (now.getTime() - lastChecked.getTime()) / (1000 * 60);
      
      if (minutesSinceLastCheck < effectiveIntervalMinutes) {
        const nextCheckAt = new Date(lastChecked.getTime() + effectiveIntervalMinutes * 60 * 1000);
        return {
          shouldCrawl: false,
          reason: `Too soon (checked ${Math.round(minutesSinceLastCheck)}m ago, interval: ${effectiveIntervalMinutes}m)`,
          nextCheckAt,
        };
      }
    }

    const nextCheckAt = new Date(now.getTime() + effectiveIntervalMinutes * 60 * 1000);
    return {
      shouldCrawl: true,
      reason: 'Scheduled check due',
      nextCheckAt,
    };
  }

  /**
   * Determine if a full browser render should be performed.
   *
   * Priority order:
   * 1. Always respect render rate limits (prevent abuse)
   * 2. OEMs that require browser rendering always render (cheap check unreliable)
   * 3. For other OEMs, skip if hash unchanged (cost control)
   */
  shouldRender(
    page: SourcePage,
    currentHtmlHash: string,
    now: Date = new Date()
  ): { shouldRender: boolean; reason: string } {
    // Check max render interval first (Rule 2 - always respect rate limits)
    if (page.last_rendered_at) {
      const lastRendered = new Date(page.last_rendered_at);
      const minutesSinceLastRender = (now.getTime() - lastRendered.getTime()) / (1000 * 60);

      if (minutesSinceLastRender < this.config.maxRenderIntervalMinutes) {
        return {
          shouldRender: false,
          reason: `Render rate limit (last render ${Math.round(minutesSinceLastRender)}m ago, min interval: ${this.config.maxRenderIntervalMinutes}m)`,
        };
      }
    }

    // Check if OEM requires browser rendering (e.g., Ford with Akamai protection)
    // For these OEMs, the cheap check is unreliable (may get blocked/garbage HTML)
    const oemDef = getOemDefinition(page.oem_id);
    if (oemDef?.flags.requiresBrowserRendering) {
      return {
        shouldRender: true,
        reason: 'Browser rendering required for this OEM',
      };
    }

    // For other OEMs, check if hash has changed from last cheap check (cost control)
    if (page.last_hash === currentHtmlHash) {
      if (this.config.skipRenderOnNoChange) {
        return {
          shouldRender: false,
          reason: 'HTML hash unchanged - skipping render (cost control)',
        };
      }
    }

    return {
      shouldRender: true,
      reason: 'HTML hash changed and render interval satisfied',
    };
  }

  /**
   * Calculate the next check time for a page.
   */
  getNextCheckTime(page: SourcePage): Date {
    const scheduleMinutes = this.getScheduleForPageType(page.page_type);
    let effectiveIntervalMinutes = scheduleMinutes;
    
    // Apply backoff if page hasn't changed in a while
    if (page.consecutive_no_change >= this.config.backoffAfterDays * (1440 / scheduleMinutes)) {
      effectiveIntervalMinutes = Math.floor(scheduleMinutes / this.config.backoffMultiplier);
    }

    const baseTime = page.last_checked_at 
      ? new Date(page.last_checked_at) 
      : new Date();
    
    return new Date(baseTime.getTime() + effectiveIntervalMinutes * 60 * 1000);
  }

  /**
   * Update page state after a crawl.
   */
  updateAfterCrawl(
    page: SourcePage,
    htmlChanged: boolean,
    wasRendered: boolean,
    now: Date = new Date()
  ): Partial<SourcePage> {
    const updates: Partial<SourcePage> = {
      last_checked_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    if (htmlChanged) {
      updates.last_changed_at = now.toISOString();
      updates.consecutive_no_change = 0;
    } else {
      updates.consecutive_no_change = (page.consecutive_no_change || 0) + 1;
    }

    if (wasRendered) {
      updates.last_rendered_at = now.toISOString();
    }

    return updates;
  }

  /**
   * Get the schedule interval for a page type.
   */
  private getScheduleForPageType(pageType: PageType): number {
    return PAGE_TYPE_SCHEDULE[pageType] || DEFAULT_SCHEDULE.vehicles_minutes;
  }

  /**
   * Check if monthly render cap would be exceeded.
   * 
   * Implements spec Section 3.3 Rules 3-4.
   */
  checkRenderBudget(
    oemId: OemId,
    monthlyRenderCount: number,
    globalRenderCount: number
  ): { allowed: boolean; reason?: string } {
    if (monthlyRenderCount >= this.config.monthlyRenderCapPerOem) {
      return {
        allowed: false,
        reason: `OEM ${oemId} monthly render cap (${this.config.monthlyRenderCapPerOem}) exceeded`,
      };
    }

    if (globalRenderCount >= this.config.globalMonthlyRenderCap) {
      return {
        allowed: false,
        reason: `Global monthly render cap (${this.config.globalMonthlyRenderCap}) exceeded`,
      };
    }

    // Alert if approaching limits (80% threshold)
    if (monthlyRenderCount >= this.config.monthlyRenderCapPerOem * 0.8) {
      return {
        allowed: true,
        reason: `WARNING: OEM ${oemId} approaching monthly render cap (${monthlyRenderCount}/${this.config.monthlyRenderCapPerOem})`,
      };
    }

    return { allowed: true };
  }
}

// ============================================================================
// Priority Queue for Crawl Jobs
// ============================================================================

export interface CrawlJob {
  oemId: OemId;
  url: string;
  pageType: PageType;
  priority: number;
  scheduledAt: Date;
  attemptCount: number;
}

export class CrawlPriorityQueue {
  private jobs: CrawlJob[] = [];

  enqueue(job: CrawlJob): void {
    this.jobs.push(job);
    this.jobs.sort((a, b) => b.priority - a.priority);
  }

  dequeue(): CrawlJob | undefined {
    return this.jobs.shift();
  }

  peek(): CrawlJob | undefined {
    return this.jobs[0];
  }

  get length(): number {
    return this.jobs.length;
  }

  getJobsForOem(oemId: OemId): CrawlJob[] {
    return this.jobs.filter(j => j.oemId === oemId);
  }

  remove(url: string): boolean {
    const index = this.jobs.findIndex(j => j.url === url);
    if (index >= 0) {
      this.jobs.splice(index, 1);
      return true;
    }
    return false;
  }
}

// ============================================================================
// Schedule Estimation (from spec Section 3.2)
// ============================================================================

export interface MonthlyEstimate {
  oemId: OemId;
  pagesMonitored: number;
  cheapChecksPerMonth: number;
  estimatedFullRendersPerMonth: number;
  estimatedCostUsd: number;
}

/**
 * Estimate monthly crawl costs for an OEM.
 * 
 * Based on spec Section 3.2 assumptions:
 * - ~20% of cheap checks trigger a full render
 * - Browser Rendering costs ~$0.50 per 1K renders (estimated)
 */
export function estimateMonthlyCosts(
  oemId: OemId,
  pagesMonitored: number,
  costPerRenderUsd: number = 0.05 // Estimated Browser Rendering cost
): MonthlyEstimate {
  const schedule = DEFAULT_SCHEDULE;
  
  // Calculate cheap checks per month (assuming evenly distributed page types)
  // This is a rough estimate - real implementation would use actual page type breakdown
  const avgIntervalMinutes = (
    schedule.homepage_minutes + 
    schedule.offers_minutes + 
    schedule.vehicles_minutes + 
    schedule.news_minutes
  ) / 4;
  
  const cheapChecksPerMonth = Math.round(
    (pagesMonitored * 30 * 24 * 60) / avgIntervalMinutes
  );
  
  // ~20% of cheap checks trigger full render
  const estimatedFullRendersPerMonth = Math.round(cheapChecksPerMonth * 0.2);
  
  const estimatedCostUsd = estimatedFullRendersPerMonth * costPerRenderUsd;

  return {
    oemId,
    pagesMonitored,
    cheapChecksPerMonth,
    estimatedFullRendersPerMonth,
    estimatedCostUsd,
  };
}

/**
 * Total estimate for all OEMs.
 */
export function estimateTotalMonthlyCosts(
  oemEstimates: MonthlyEstimate[]
): {
  totalPages: number;
  totalCheapChecks: number;
  totalRenders: number;
  totalCostUsd: number;
} {
  return oemEstimates.reduce(
    (acc, est) => ({
      totalPages: acc.totalPages + est.pagesMonitored,
      totalCheapChecks: acc.totalCheapChecks + est.cheapChecksPerMonth,
      totalRenders: acc.totalRenders + est.estimatedFullRendersPerMonth,
      totalCostUsd: acc.totalCostUsd + est.estimatedCostUsd,
    }),
    { totalPages: 0, totalCheapChecks: 0, totalRenders: 0, totalCostUsd: 0 }
  );
}
