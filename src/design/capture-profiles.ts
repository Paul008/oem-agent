/**
 * Per-OEM Capture Profiles — declarative capture settings per brand.
 *
 * Replaces call-site-only backend selection (spec §4.1): each OEM declares its
 * hydration budgets, known feature-app shell selectors, completeness config and
 * backend escalation order. Code-defined in M1 (no editing UI yet).
 *
 * NOTE on escalation: scrapling-stealth / external-html require caller-supplied
 * HTML, so the worker cannot execute escalation itself. backendOrder is used to
 * SUGGEST the next backend in failure results/diagnostics.
 */

import type { CaptureBackend } from './page-capturer';
import { DEFAULT_CAPTURE_COMPLETENESS, type CaptureCompletenessConfig } from './capture-completeness';

export interface CaptureHydrationSettings {
  budgetMs: number;
  stepDelayMs: number;
  mountWaitMs: number;
  stabilityPct: number;
  maxPasses: number;
}

export interface OemCaptureProfile {
  backendOrder: CaptureBackend[];
  hydration: CaptureHydrationSettings;
  featureAppShellSelectors: string[];
  completeness: CaptureCompletenessConfig;
}

export const DEFAULT_CAPTURE_PROFILE: OemCaptureProfile = {
  backendOrder: ['cloudflare-browser'],
  hydration: {
    budgetMs: 90_000,
    stepDelayMs: 450,
    mountWaitMs: 4_000,
    stabilityPct: 2,
    maxPasses: 4,
  },
  featureAppShellSelectors: [],
  completeness: DEFAULT_CAPTURE_COMPLETENESS,
};

const OEM_CAPTURE_PROFILE_OVERRIDES: Record<string, Partial<OemCaptureProfile>> = {
  'volkswagen-au': {
    hydration: {
      budgetMs: 120_000,
      stepDelayMs: 450,
      mountWaitMs: 5_000,
      stabilityPct: 2,
      maxPasses: 5,
    },
    featureAppShellSelectors: ['[class*="CmsFeatureAppLoader"]', '.featureAppSection'],
  },
  'toyota-au': {
    backendOrder: ['cloudflare-browser', 'scrapling-stealth'],
  },
};

export function resolveCaptureProfile(oemId: string): OemCaptureProfile {
  const override = OEM_CAPTURE_PROFILE_OVERRIDES[String(oemId)] ?? {};
  return {
    backendOrder: override.backendOrder ?? [...DEFAULT_CAPTURE_PROFILE.backendOrder],
    hydration: { ...DEFAULT_CAPTURE_PROFILE.hydration, ...(override.hydration ?? {}) },
    featureAppShellSelectors: override.featureAppShellSelectors ?? [...DEFAULT_CAPTURE_PROFILE.featureAppShellSelectors],
    completeness: { ...DEFAULT_CAPTURE_PROFILE.completeness, ...(override.completeness ?? {}) },
  };
}
