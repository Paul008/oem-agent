/**
 * Capture Completeness Gate — decides whether a browser capture is complete
 * enough to publish. Evaluated in captureModelPage() BEFORE any R2 write, so
 * a half-hydrated page can never replace a good clone (spec §4.1 "fail loud").
 */

import type { CaptureAudit } from './page-capturer';

export type CaptureCompletenessAuditInput = Pick<
  CaptureAudit,
  'captured_scroll_height' | 'dom_image_count' | 'hydration_status' | 'empty_shells'
>;

export interface CaptureCompletenessConfig {
  /** Feature-app shells allowed to remain empty. Default 0. */
  maxEmptyShells: number;
  /** Captured height must be at least this % of the last good capture. Default 80. */
  minHeightVsLastGoodPct: number;
  /** Require the hydration sweep to have converged. Default true. */
  requireHydrationStable: boolean;
  /**
   * Absolute floor: no real OEM model page renders under this height, so a
   * stable capture below it is a stump regardless of baseline history
   * (bot shells and JS-disabled fallbacks hydrate "stable" at ~1-3k px).
   * 0 disables. Default 3000.
   */
  minHeightPx: number;
  /** Absolute floor on <img> elements in the captured DOM. 0 disables. Default 5. */
  minImages: number;
}

export const DEFAULT_CAPTURE_COMPLETENESS: CaptureCompletenessConfig = {
  maxEmptyShells: 0,
  minHeightVsLastGoodPct: 80,
  requireHydrationStable: true,
  minHeightPx: 3000,
  minImages: 5,
};

export interface CaptureCompletenessVerdict {
  passed: boolean;
  reasons: string[];
}

export function evaluateCaptureCompleteness(
  input: { audit?: CaptureCompletenessAuditInput; lastGoodScrollHeight?: number },
  config: CaptureCompletenessConfig = DEFAULT_CAPTURE_COMPLETENESS,
): CaptureCompletenessVerdict {
  const { audit } = input;
  if (!audit)
    return { passed: true, reasons: ['no capture audit (non-browser backend or initial-document capture); gate skipped'] };

  const failures: string[] = [];

  if (audit.captured_scroll_height <= 0)
    failures.push('capture measured zero page height — measurement or capture is broken');
  else if (config.minHeightPx > 0 && audit.captured_scroll_height < config.minHeightPx)
    failures.push(`captured height ${audit.captured_scroll_height}px is below the ${config.minHeightPx}px minimum for a model page`);

  if (config.minImages > 0 && audit.dom_image_count < config.minImages)
    failures.push(`captured DOM has ${audit.dom_image_count} image(s), below the minimum ${config.minImages}`);

  if (config.requireHydrationStable && audit.hydration_status !== 'stable' && audit.hydration_status !== 'unsupported')
    failures.push(`hydration did not stabilize (status=${audit.hydration_status})`);

  if (audit.empty_shells.length > config.maxEmptyShells)
    failures.push(`${audit.empty_shells.length} feature-app shell(s) never mounted: ${audit.empty_shells.slice(0, 5).join(', ')}`);

  const lastGood = Number(input.lastGoodScrollHeight ?? 0);
  if (lastGood > 0 && audit.captured_scroll_height > 0) {
    const pct = (audit.captured_scroll_height / lastGood) * 100;
    if (pct < config.minHeightVsLastGoodPct)
      failures.push(`captured height ${audit.captured_scroll_height}px is ${Math.round(pct)}% of last good ${lastGood}px (minimum ${config.minHeightVsLastGoodPct}%)`);
  }

  return failures.length === 0 ? { passed: true, reasons: [] } : { passed: false, reasons: failures };
}
