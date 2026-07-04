/**
 * Capture Completeness Gate — decides whether a browser capture is complete
 * enough to publish. Evaluated in captureModelPage() BEFORE any R2 write, so
 * a half-hydrated page can never replace a good clone (spec §4.1 "fail loud").
 */

// Structural subset of CaptureAudit (page-capturer.ts). Kept structural so this
// module has no runtime dependency on page-capturer (avoids an import cycle via
// capture-profiles). Task 4 aliases the real type here via `import type`.
export interface CaptureCompletenessAuditInput {
  captured_scroll_height: number;
  dom_image_count: number;
  hydration_status: 'stable' | 'budget-exhausted' | 'max-passes' | 'unsupported';
  empty_shells: string[];
}

export interface CaptureCompletenessConfig {
  /** Feature-app shells allowed to remain empty. Default 0. */
  maxEmptyShells: number;
  /** Captured height must be at least this % of the last good capture. Default 80. */
  minHeightVsLastGoodPct: number;
  /** Require the hydration sweep to have converged. Default true. */
  requireHydrationStable: boolean;
}

export const DEFAULT_CAPTURE_COMPLETENESS: CaptureCompletenessConfig = {
  maxEmptyShells: 0,
  minHeightVsLastGoodPct: 80,
  requireHydrationStable: true,
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
