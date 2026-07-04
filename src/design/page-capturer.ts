/**
 * Page Capturer — Full Page Download
 *
 * Captures the rendered OEM page preserving original CSS classes and
 * external stylesheets. No computed-style extraction, no AI — just
 * the real page with nav/footer/scripts stripped and images proxied.
 *
 * 1. Puppeteer navigates to OEM model page, waits for JS render
 * 2. page.evaluate() strips nav/footer/scripts, activates tabs,
 *    resolves lazy media, collects image URLs
 * 3. External stylesheet <link> tags are preserved as-is
 * 4. Images downloaded to R2, URLs rewritten to proxy paths
 * 5. Result stored as VehicleModelPage in R2
 */

import { load, type Cheerio, type CheerioAPI } from 'cheerio';

import type { OemId, VehicleModelPage } from '../oem/types';
import { applyCloneMode, type ModeAwarePage } from './page-modes';
import { getModelPageWriteProtectedMessage, isModelPageWriteProtected } from '../model-page-protection';
import { resolveCaptureProfile, type OemCaptureProfile } from './capture-profiles';
import { evaluateCaptureCompleteness, type CaptureCompletenessVerdict } from './capture-completeness';
import { readLastGoodCapturedHeight } from './capture-diagnostics';
import { annotateCloneInteractions } from './clone-annotator';
import { buildCloneRuntimeScript, CLONE_RUNTIME_VERSION } from './clone-runtime/clone-runtime';

// ============================================================================
// Types
// ============================================================================

export interface PageCaptureResult {
  success: boolean;
  page?: VehicleModelPage;
  r2_key?: string;
  capture_time_ms: number;
  capture_backend?: CaptureBackend;
  elements_captured?: number;
  images_uploaded?: number;
  html_size_kb?: number;
  bot_blocked?: boolean;
  capture_audit?: CaptureAudit;
  completeness?: CaptureCompletenessVerdict;
  suggested_backend?: CaptureBackend;
  /** True when an SSR/initial-document fetch replaced the browser render (no hydration audit ran). */
  initial_document_preferred?: boolean;
  error?: string;
}

export type CaptureBackend = 'cloudflare-browser' | 'scrapling-stealth' | 'external-html';

export interface ExternalHtmlCaptureInput {
  html: string;
  title?: string;
  finalUrl?: string;
  stylesheetUrls?: string[];
  viewport?: {
    width: number;
    height: number;
  };
}

export interface PageCaptureOptions {
  backend?: CaptureBackend;
  externalCapture?: ExternalHtmlCaptureInput;
}

export interface DomCaptureResult {
  html: string;
  stylesheetLinks: string[];
  imageUrls: string[];
  heroUrl: string;
  title: string;
  elementCount: number;
  viewport: {
    width: number;
    height: number;
  };
  audit?: CaptureAudit;
}

export type CaptureHydrationStatus = 'stable' | 'budget-exhausted' | 'max-passes' | 'unsupported';

export interface CaptureHydrationPassSample {
  pass: number;
  scroll_height: number;
  image_count: number;
  elapsed_ms: number;
}

export interface CaptureHydrationReport {
  status: CaptureHydrationStatus;
  passes: CaptureHydrationPassSample[];
  final_scroll_height: number;
  final_image_count: number;
}

export interface CaptureAudit {
  captured_scroll_height: number;
  dom_image_count: number;
  hydration_status: CaptureHydrationStatus;
  hydration_passes: CaptureHydrationPassSample[];
  shells_checked: number;
  shells_recovered: number;
  empty_shells: string[];
}

interface InitialDocumentCapture {
  headParts: string[];
  capture?: DomCaptureResult;
}

export interface PseudoElementCaptureStyle {
  display?: string;
  color?: string;
  backgroundColor?: string;
  fontWeight?: string;
  fontSize?: string;
  lineHeight?: string;
  margin?: string;
  padding?: string;
  borderRadius?: string;
  textTransform?: string;
  letterSpacing?: string;
  visibility?: string;
  opacity?: string;
}

type StoredVehicleModelPage = VehicleModelPage & ModeAwarePage;

const R2_PREFIX = 'pages/definitions';
const R2_ASSETS_PREFIX = 'pages/assets';
const R2_SCREENSHOTS_PREFIX = 'screenshots';
const MAX_IMAGE_DOWNLOADS = 50;
const MAX_SECTION_SCREENSHOTS = 15;
const IMAGE_DOWNLOAD_TIMEOUT = 8_000;
const CAPTURE_LAZY_IMAGE_SRC_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-image-src'] as const;
export const CAPTURE_SCROLL_SWEEP_STEP_DELAY_MS = 300;
export const CAPTURE_SCROLL_SWEEP_FINAL_DELAY_MS = 500;
export const CAPTURE_SCROLL_SWEEP_TIMEOUT_MS = 10_000;
export const CAPTURE_SCROLL_SWEEP_MAX_STEPS = 30;
export const CAPTURE_FONT_READY_TIMEOUT_MS = 2_500;
export const CAPTURE_IMAGE_READY_TIMEOUT_MS = 3_000;
export const CAPTURE_DOM_QUIET_WINDOW_MS = 250;
export const CAPTURE_DOM_QUIET_TIMEOUT_MS = 1_500;
export const CAPTURE_HYDRATION_BUDGET_MS = 90_000;
export const CAPTURE_HYDRATION_STEP_DELAY_MS = 450;
export const CAPTURE_HYDRATION_MOUNT_WAIT_MS = 4_000;
export const CAPTURE_HYDRATION_STABILITY_PCT = 2;
export const CAPTURE_HYDRATION_MAX_PASSES = 4;
export const CAPTURE_STATIC_CLONE_SAFETY_CSS = `
img.imgdesktop,
img.dsktoponly,
.imgdesktop > img,
.dsktoponly > img {
  display: block !important;
}

img.imgmobile,
img.mobonly,
.imgmobile > img,
.mobonly > img {
  display: none !important;
}

.animated,
.animate__animated,
.wow,
.aos-init,
[data-aos],
[class*="fadeIn"] {
  opacity: 1 !important;
  visibility: visible !important;
  transform: none !important;
}
`.trim();
export const CAPTURE_STATIC_CAROUSEL_SAFETY_CSS = `
.slick-list,
.swiper,
.swiper-container,
.swiper-wrapper,
.splide,
.splide__track,
.splide__list,
.carousel,
.carousel-inner,
[class*="swiper"],
[class*="carousel"],
[class*="slider"] {
  max-width: 100% !important;
  overflow: hidden !important;
}

.slick-track,
.swiper-wrapper,
.splide__list,
.carousel-inner {
  width: 100% !important;
  max-width: 100% !important;
  transform: none !important;
}

.slick-slide,
.swiper-slide,
.splide__slide,
.carousel-item {
  width: 100% !important;
  max-width: 100% !important;
  flex-shrink: 0 !important;
}
`.trim();
export const CAPTURE_STATIC_MEDIA_FRAME_CSS = `
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow-x: clip !important;
}

body {
  overflow-wrap: anywhere;
}

img,
picture,
video,
canvas,
svg {
  max-width: 100% !important;
}

@media (min-width: 1024px) {
  img,
  video {
    height: auto !important;
  }
}
`.trim();

export type CaptureScrollSweepStatus = 'complete' | 'max-steps' | 'timeout' | 'unsupported';
export type CaptureFontReadyStatus = 'ready' | 'timeout' | 'unsupported';
export type CaptureImageReadyStatus = 'ready' | 'timeout' | 'unsupported' | 'no-images';
export type CaptureDomQuietStatus = 'quiet' | 'timeout' | 'unsupported';
export type CaptureLazyMediaActivationResult = {
  imageSources: number;
  sourceSets: number;
  backgrounds: number;
  eagerImages: number;
  videoSources: number;
  videoPosters: number;
};

type CaptureScrollSweepWindow = {
  innerHeight?: number;
  scrollY?: number;
  scrollTo?: (x: number, y: number) => void;
  setTimeout?: (callback: () => void, timeout?: number) => ReturnType<typeof setTimeout>;
  Date?: Pick<typeof Date, 'now'>;
  document?: {
    body?: { scrollHeight?: number };
    documentElement?: { scrollHeight?: number };
  };
};

type CaptureMutationObserver = {
  observe: (target: unknown, options: MutationObserverInit) => void;
  disconnect: () => void;
};

type CaptureMutationObserverConstructor = new (callback: () => void) => CaptureMutationObserver;

export function activateLazyMediaForCapture(options?: {
  doc?: {
    location?: { href?: string; origin?: string };
    querySelectorAll?: (selector: string) => ArrayLike<any>;
  };
}): CaptureLazyMediaActivationResult {
  const activeDocument = options?.doc ?? (typeof document !== 'undefined'
    ? document
    : undefined);
  const result: CaptureLazyMediaActivationResult = {
    imageSources: 0,
    sourceSets: 0,
    backgrounds: 0,
    eagerImages: 0,
    videoSources: 0,
    videoPosters: 0,
  };

  if (!activeDocument || typeof activeDocument.querySelectorAll !== 'function')
    return result;

  const baseHref = activeDocument.location?.href || activeDocument.location?.origin || '';

  function abs(url: string): string {
    const trimmed = String(url || '').trim();
    if (!trimmed || /^https?:/i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:'))
      return trimmed;
    if (trimmed.startsWith('//'))
      return `https:${trimmed}`;

    try {
      return new URL(trimmed, baseHref).href;
    } catch {
      return trimmed;
    }
  }

  function normalizeSrcset(srcset: string): string {
    return String(srcset || '')
      .split(',')
      .map((entry) => {
        const parts = entry.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0)
          return '';

        const url = abs(parts.shift() || '');
        return [url, ...parts].filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join(', ');
  }

  const lazyImageAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-image-src'];

  Array.from(activeDocument.querySelectorAll('img')).forEach((img: any) => {
    for (const attr of lazyImageAttrs) {
      const value = typeof img.getAttribute === 'function' ? img.getAttribute(attr) : null;
      if (!value)
        continue;

      const src = abs(value);
      if (src) {
        img.src = src;
        if (typeof img.setAttribute === 'function')
          img.setAttribute('src', src);
      }
      if (typeof img.removeAttribute === 'function')
        img.removeAttribute(attr);
      result.imageSources++;
      break;
    }

    if (img.loading === 'lazy') {
      img.loading = 'eager';
      result.eagerImages++;
    }
  });

  Array.from(activeDocument.querySelectorAll('img[data-srcset], source[data-srcset]')).forEach((el: any) => {
    const value = typeof el.getAttribute === 'function' ? el.getAttribute('data-srcset') : null;
    if (!value)
      return;

    const srcset = normalizeSrcset(value);
    if (srcset) {
      el.srcset = srcset;
      if (typeof el.setAttribute === 'function')
        el.setAttribute('srcset', srcset);
    }
    if (typeof el.removeAttribute === 'function')
      el.removeAttribute('data-srcset');
    result.sourceSets++;
  });

  Array.from(activeDocument.querySelectorAll('[data-bg], [data-background-image]')).forEach((el: any) => {
    const attr = typeof el.getAttribute === 'function' && el.getAttribute('data-bg')
      ? 'data-bg'
      : 'data-background-image';
    const value = typeof el.getAttribute === 'function' ? el.getAttribute(attr) : null;
    if (!value)
      return;

    const backgroundUrl = abs(value);
    if (backgroundUrl) {
      el.style = el.style || {};
      el.style.backgroundImage = `url("${backgroundUrl}")`;
    }
    if (typeof el.removeAttribute === 'function')
      el.removeAttribute(attr);
    result.backgrounds++;
  });

  Array.from(activeDocument.querySelectorAll('video')).forEach((video: any) => {
    const directDataSrc = typeof video.getAttribute === 'function'
      ? video.getAttribute('data-src')
      : null;
    const directSrc = directDataSrc || (typeof video.getAttribute === 'function'
      ? video.getAttribute('src')
      : null) || video.src;
    if (directSrc && !String(directSrc).startsWith('data:') && !String(directSrc).startsWith('blob:')) {
      const resolvedSrc = abs(directSrc);
      if (resolvedSrc && (directDataSrc || resolvedSrc !== directSrc)) {
        video.src = resolvedSrc;
        if (typeof video.setAttribute === 'function')
          video.setAttribute('src', resolvedSrc);
        result.videoSources++;
      }
      if (directDataSrc && typeof video.removeAttribute === 'function')
        video.removeAttribute('data-src');
    }

    if (typeof video.querySelectorAll === 'function') {
      Array.from(video.querySelectorAll('source')).forEach((source: any) => {
        const value = typeof source.getAttribute === 'function'
          ? source.getAttribute('data-src')
          : null;
        if (!value)
          return;

        const src = abs(value);
        if (src) {
          source.src = src;
          if (typeof source.setAttribute === 'function')
            source.setAttribute('src', src);
        }
        if (typeof source.removeAttribute === 'function')
          source.removeAttribute('data-src');
        result.videoSources++;
      });
    }

    const dataPoster = typeof video.getAttribute === 'function'
      ? video.getAttribute('data-poster')
      : null;
    const poster = dataPoster || (typeof video.getAttribute === 'function'
      ? video.getAttribute('poster')
      : null) || video.poster;
    if (!poster)
      return;

    const resolvedPoster = abs(poster);
    if (resolvedPoster) {
      video.poster = resolvedPoster;
      if (typeof video.setAttribute === 'function')
        video.setAttribute('poster', resolvedPoster);
    }
    if (dataPoster && typeof video.removeAttribute === 'function')
      video.removeAttribute('data-poster');
    result.videoPosters++;
  });

  return result;
}

export async function sweepCaptureScrollForCapture(options?: {
  stepDelayMs?: number;
  finalDelayMs?: number;
  timeoutMs?: number;
  maxSteps?: number;
  win?: CaptureScrollSweepWindow;
}): Promise<CaptureScrollSweepStatus> {
  const activeWindow = options?.win ?? (typeof window !== 'undefined'
    ? window as unknown as CaptureScrollSweepWindow
    : undefined);
  const activeDocument = activeWindow?.document ?? (typeof document !== 'undefined'
    ? document as unknown as CaptureScrollSweepWindow['document']
    : undefined);
  const viewportHeight = Number(activeWindow?.innerHeight ?? 0);
  const scrollTo = activeWindow?.scrollTo;

  if (!activeWindow || !activeDocument || typeof scrollTo !== 'function' || !Number.isFinite(viewportHeight) || viewportHeight <= 0)
    return 'unsupported';

  const stepDelayMs = Math.max(0, options?.stepDelayMs ?? 300);
  const finalDelayMs = Math.max(0, options?.finalDelayMs ?? 500);
  const timeoutMs = Math.max(0, options?.timeoutMs ?? 10000);
  const maxSteps = Math.max(1, options?.maxSteps ?? 30);
  const clock = activeWindow.Date ?? Date;
  const sleep = (delayMs: number) => new Promise<void>((resolve) => {
    const timer = activeWindow.setTimeout ?? setTimeout;
    timer(resolve, delayMs);
  });
  const scrollHeight = () => Math.max(
    0,
    Number(activeDocument.documentElement?.scrollHeight ?? 0),
    Number(activeDocument.body?.scrollHeight ?? 0),
  );
  const startedAt = clock.now();

  try {
    let y = Math.max(0, Number(activeWindow.scrollY ?? 0));
    let steps = 0;

    while (true) {
      if (clock.now() - startedAt >= timeoutMs)
        return 'timeout';

      const maxY = Math.max(0, scrollHeight() - viewportHeight);
      if (y >= maxY)
        return 'complete';

      if (steps >= maxSteps)
        return 'max-steps';

      y = Math.min(y + viewportHeight, maxY);
      scrollTo.call(activeWindow, 0, y);
      steps++;
      await sleep(stepDelayMs);
    }
  } finally {
    scrollTo.call(activeWindow, 0, 0);
    await sleep(finalDelayMs);
  }
}

/**
 * Multi-pass scroll sweep that keeps sweeping until the page stops growing.
 * Unlike sweepCaptureScrollForCapture (single pass, hard 10s cap), this paces
 * each step and grants a bounded extra wait whenever a step mounts new content
 * (scroll-triggered OEM feature apps need seconds to fetch + render).
 */
export async function runPacedHydrationSweepForCapture(options?: {
  budgetMs?: number;
  stepDelayMs?: number;
  mountWaitMs?: number;
  stabilityPct?: number;
  maxPasses?: number;
  win?: CaptureScrollSweepWindow;
}): Promise<CaptureHydrationReport> {
  const activeWindow = options?.win ?? (typeof window !== 'undefined'
    ? window as unknown as CaptureScrollSweepWindow
    : undefined);
  const activeDocument = activeWindow?.document ?? (typeof document !== 'undefined'
    ? document as unknown as CaptureScrollSweepWindow['document']
    : undefined);
  const viewportHeight = Number(activeWindow?.innerHeight ?? 0);
  const scrollTo = activeWindow?.scrollTo;

  const report: CaptureHydrationReport = {
    status: 'unsupported',
    passes: [],
    final_scroll_height: 0,
    final_image_count: 0,
  };

  if (!activeWindow || !activeDocument || typeof scrollTo !== 'function' || !Number.isFinite(viewportHeight) || viewportHeight <= 0)
    return report;

  const budgetMs = Math.max(0, options?.budgetMs ?? 90_000);
  const stepDelayMs = Math.max(0, options?.stepDelayMs ?? 450);
  const mountWaitMs = Math.max(0, options?.mountWaitMs ?? 4_000);
  const stabilityPct = Math.max(0, options?.stabilityPct ?? 2);
  const maxPasses = Math.max(1, options?.maxPasses ?? 4);
  const clock = activeWindow.Date ?? Date;
  const timer = activeWindow.setTimeout ?? setTimeout;
  const sleep = (delayMs: number) => new Promise<void>((resolve) => {
    timer(resolve, delayMs);
  });
  const scrollHeight = () => Math.max(
    0,
    Number(activeDocument.documentElement?.scrollHeight ?? 0),
    Number(activeDocument.body?.scrollHeight ?? 0),
  );
  const imageCount = () => {
    try {
      const doc = activeDocument as unknown as { querySelectorAll?: (selector: string) => ArrayLike<unknown> };
      return Number(doc.querySelectorAll?.('img')?.length ?? 0);
    } catch {
      return 0;
    }
  };
  const startedAt = clock.now();
  const budgetLeft = () => budgetMs - (clock.now() - startedAt);
  const snapshotFinals = () => {
    report.final_scroll_height = scrollHeight();
    report.final_image_count = imageCount();
  };

  let previousHeight = scrollHeight();
  try {
    for (let pass = 1; pass <= maxPasses; pass++) {
      scrollTo.call(activeWindow, 0, 0);
      let y = 0;

      while (true) {
        if (budgetLeft() <= 0) {
          report.status = 'budget-exhausted';
          snapshotFinals();
          return report;
        }

        const maxY = Math.max(0, scrollHeight() - viewportHeight);
        if (y >= maxY)
          break;

        const beforeHeight = scrollHeight();
        const beforeImages = imageCount();
        y = Math.min(y + viewportHeight, maxY);
        scrollTo.call(activeWindow, 0, y);
        await sleep(stepDelayMs);

        if (scrollHeight() > beforeHeight || imageCount() > beforeImages) {
          // This step mounted new content — give it a bounded settle window.
          const mountDeadline = clock.now() + Math.min(mountWaitMs, Math.max(0, budgetLeft()));
          let lastHeight = scrollHeight();
          let lastImages = imageCount();
          while (clock.now() < mountDeadline) {
            await sleep(stepDelayMs);
            const nextHeight = scrollHeight();
            const nextImages = imageCount();
            if (nextHeight === lastHeight && nextImages === lastImages)
              break;
            lastHeight = nextHeight;
            lastImages = nextImages;
          }
        }
      }

      const passHeight = scrollHeight();
      report.passes.push({
        pass,
        scroll_height: passHeight,
        image_count: imageCount(),
        elapsed_ms: clock.now() - startedAt,
      });

      const growthPct = previousHeight > 0 ? ((passHeight - previousHeight) / previousHeight) * 100 : 100;
      if (growthPct <= stabilityPct) {
        report.status = 'stable';
        snapshotFinals();
        return report;
      }

      previousHeight = passHeight;
      if (budgetLeft() <= 0) {
        report.status = 'budget-exhausted';
        snapshotFinals();
        return report;
      }
    }

    report.status = 'max-passes';
    snapshotFinals();
    return report;
  } finally {
    scrollTo.call(activeWindow, 0, 0);
  }
}

export interface CaptureFeatureAppMountReport {
  checked: number;
  recovered: number;
  still_empty: string[];
}

/**
 * Some OEM feature apps (e.g. VW CmsFeatureAppLoader) render an empty shell
 * until their bundle mounts. After the hydration sweep, give each still-empty
 * shell one bounded, scrolled-into-view second chance and report the holdouts —
 * the completeness gate uses still_empty to refuse publishing a gutted page.
 */
export async function waitForFeatureAppMountsForCapture(options?: {
  shellSelectors?: string[];
  mountWaitMs?: number;
  budgetMs?: number;
  pollDelayMs?: number;
  win?: {
    document?: { querySelectorAll?: (selector: string) => ArrayLike<unknown> };
    Date?: { now: () => number };
    setTimeout?: typeof setTimeout;
    scrollTo?: (x: number, y: number) => void;
  };
}): Promise<CaptureFeatureAppMountReport> {
  const activeWindow = options?.win ?? (typeof window !== 'undefined' ? window as any : undefined);
  const activeDocument = activeWindow?.document ?? (typeof document !== 'undefined' ? document as any : undefined);
  const report: CaptureFeatureAppMountReport = { checked: 0, recovered: 0, still_empty: [] };
  const selectors = (options?.shellSelectors ?? [])
    .map(selector => String(selector || '').trim())
    .filter(Boolean);

  if (!activeDocument || typeof activeDocument.querySelectorAll !== 'function' || selectors.length === 0)
    return report;

  const mountWaitMs = Math.max(0, options?.mountWaitMs ?? 4_000);
  const budgetMs = Math.max(0, options?.budgetMs ?? 20_000);
  const pollDelayMs = Math.max(1, options?.pollDelayMs ?? 250);
  const clock = activeWindow?.Date ?? Date;
  const timer = activeWindow?.setTimeout ?? setTimeout;
  const sleep = (delayMs: number) => new Promise<void>((resolve) => {
    timer(resolve, delayMs);
  });
  const startedAt = clock.now();
  const budgetLeft = () => budgetMs - (clock.now() - startedAt);

  const isEmptyShell = (element: any): boolean => {
    try {
      if (typeof element?.querySelector === 'function'
        && element.querySelector('img, picture, video, iframe, canvas, svg, button, a, input, select, textarea'))
        return false;
      return String(element?.textContent ?? '').trim().length < 40;
    } catch {
      return true;
    }
  };

  for (const selector of selectors) {
    let shells: any[] = [];
    try {
      shells = Array.from(activeDocument.querySelectorAll(selector));
    } catch {
      continue;
    }

    for (let index = 0; index < shells.length; index++) {
      const shell = shells[index];
      if (!isEmptyShell(shell))
        continue;

      report.checked++;
      try {
        shell.scrollIntoView?.({ block: 'center' });
      } catch { /* fake elements may not implement scrollIntoView options */ }

      const deadline = clock.now() + Math.min(mountWaitMs, Math.max(0, budgetLeft()));
      while (clock.now() < deadline && isEmptyShell(shell))
        await sleep(pollDelayMs);

      if (isEmptyShell(shell))
        report.still_empty.push(`${selector} [${index}]`);
      else
        report.recovered++;
    }
  }

  try {
    activeWindow?.scrollTo?.(0, 0);
  } catch { /* ignore */ }

  return report;
}

export async function waitForCaptureImagesForCapture(
  timeoutMs = 3000,
  doc?: { images?: ArrayLike<{ complete?: boolean; decode?: () => Promise<unknown> }> },
): Promise<CaptureImageReadyStatus> {
  const activeDocument = doc ?? (typeof document !== 'undefined' ? document : undefined);
  const images = activeDocument?.images;
  if (!images)
    return 'unsupported';

  const imageList = Array.from(images);
  if (imageList.length === 0)
    return 'no-images';

  const pendingDecodes = imageList
    .filter(img => img.complete !== true && typeof img.decode === 'function')
    .map(img => img.decode!().catch(() => undefined));

  if (pendingDecodes.length === 0)
    return 'ready';

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<CaptureImageReadyStatus>([
      Promise.allSettled(pendingDecodes).then(() => 'ready' as CaptureImageReadyStatus),
      new Promise<CaptureImageReadyStatus>((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), Math.max(0, timeoutMs));
      }),
    ]);
  } finally {
    if (timeoutId)
      clearTimeout(timeoutId);
  }
}

export async function waitForCaptureDomQuietForCapture(
  quietWindowMs = 250,
  timeoutMs = 1500,
  options?: {
    target?: unknown;
    MutationObserverCtor?: CaptureMutationObserverConstructor;
  },
): Promise<CaptureDomQuietStatus> {
  const activeDocument = typeof document !== 'undefined' ? document : undefined;
  const target = options?.target ?? activeDocument?.body;
  const ObserverCtor: CaptureMutationObserverConstructor | undefined = options?.MutationObserverCtor
    ?? (typeof MutationObserver !== 'undefined'
      ? MutationObserver as unknown as CaptureMutationObserverConstructor
      : undefined);

  if (!target || !ObserverCtor)
    return 'unsupported';

  return new Promise<CaptureDomQuietStatus>((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = (status: CaptureDomQuietStatus) => {
      if (settled)
        return;

      settled = true;
      observer.disconnect();
      if (quietTimer)
        clearTimeout(quietTimer);
      if (timeoutTimer)
        clearTimeout(timeoutTimer);
      resolve(status);
    };

    const scheduleQuiet = () => {
      if (settled)
        return;
      if (quietTimer)
        clearTimeout(quietTimer);
      quietTimer = setTimeout(() => cleanup('quiet'), Math.max(0, quietWindowMs));
    };

    const observer = new ObserverCtor(() => scheduleQuiet());
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    timeoutTimer = setTimeout(() => cleanup('timeout'), Math.max(0, timeoutMs));
    scheduleQuiet();
  });
}

export async function waitForCaptureFontsForCapture(
  timeoutMs = 2500,
  doc?: { fonts?: { ready?: Promise<unknown> } },
): Promise<CaptureFontReadyStatus> {
  const activeDocument = doc ?? (typeof document !== 'undefined' ? document : undefined);
  const fonts = activeDocument?.fonts;
  if (!fonts?.ready || typeof fonts.ready.then !== 'function')
    return 'unsupported';

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<CaptureFontReadyStatus>([
      fonts.ready.then(() => 'ready' as CaptureFontReadyStatus),
      new Promise<CaptureFontReadyStatus>((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), Math.max(0, timeoutMs));
      }),
    ]);
  } finally {
    if (timeoutId)
      clearTimeout(timeoutId);
  }
}

export function isCaptureBlockedBySecurityPage(input: { html: string; title?: string }): boolean {
  const rawHaystack = `${input.title ?? ''}\n${input.html}`
    .replace(/\s+/g, ' ')
    .toLowerCase();
  let visibleHaystack = rawHaystack;
  try {
    const $ = load(input.html);
    $('script, style, noscript, template').remove();
    visibleHaystack = `${input.title ?? ''}\n${$('body').text() || $.text()}`
      .replace(/\s+/g, ' ')
      .toLowerCase();
  } catch {
    visibleHaystack = rawHaystack;
  }

  if (!visibleHaystack.trim() && !rawHaystack.trim())
    return false;

  const highConfidenceSignals = [
    'performing security verification',
    'security service to protect against malicious bots',
    'this page is displayed while the website verifies you are not a bot',
    'checking if the site connection is secure',
    'verify you are human',
  ];

  if (highConfidenceSignals.some(signal => visibleHaystack.includes(signal)))
    return true;

  const rawChallengeSignals = [
    'cf-challenge',
    'cf-turnstile',
    'cloudflare turnstile',
    'challenge-platform',
  ];
  if (rawChallengeSignals.some(signal => rawHaystack.includes(signal)))
    return true;

  const hasCloudflareContext = visibleHaystack.includes('cloudflare') || rawHaystack.includes('cf-ray');
  const hasChallengeCopy = visibleHaystack.includes('just a moment')
    || visibleHaystack.includes('attention required')
    || visibleHaystack.includes('please stand by')
    || visibleHaystack.includes('browser check');

  return hasCloudflareContext && hasChallengeCopy;
}

/**
 * Worker-side (cheerio) check for empty feature-app shells in raw HTML. Used when an
 * SSR/initial-document capture is being considered as a fallback for a browser
 * capture that failed its completeness gate: SSR markup never runs the browser
 * hydration sweep, so it deserves the same emptiness scrutiny before it's trusted
 * over a rejected render. Mirrors waitForFeatureAppMountsForCapture's heuristic
 * (no media/interactive descendant + under 40 chars of text), but runs statically.
 */
export function countEmptyFeatureAppShellsInHtml(html: string, shellSelectors: string[]): string[] {
  const selectors = (shellSelectors ?? [])
    .map(selector => String(selector || '').trim())
    .filter(Boolean);

  if (!html || selectors.length === 0)
    return [];

  const $ = load(html);
  const emptyShells: string[] = [];

  for (const selector of selectors) {
    try {
      $(selector).each((index, el) => {
        const $el = $(el);
        const hasInteractiveOrMedia = $el
          .find('img, picture, video, iframe, canvas, svg, button, a, input, select, textarea')
          .length > 0;
        if (!hasInteractiveOrMedia && $el.text().trim().length < 40)
          emptyShells.push(`${selector} [${index}]`);
      });
    } catch {
      continue;
    }
  }

  return emptyShells;
}

export function normalizePseudoElementContentForCapture(content: string | null | undefined): string | null {
  const raw = String(content ?? '').trim();
  if (!raw)
    return null;

  const lower = raw.toLowerCase();
  if (
    lower === 'none'
    || lower === 'normal'
    || lower === 'open-quote'
    || lower === 'close-quote'
    || lower === 'no-open-quote'
    || lower === 'no-close-quote'
    || lower.startsWith('url(')
    || lower.startsWith('counter(')
    || lower.startsWith('counters(')
    || lower.startsWith('attr(')
  ) {
    return null;
  }

  const quote = raw.charAt(0);
  if ((quote !== '"' && quote !== '\'') || raw.charAt(raw.length - 1) !== quote)
    return null;

  const value = raw
    .slice(1, -1)
    .replace(/\\A\s?/gi, '\n')
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_match, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : '';
    })
    .replace(/\\+(["'\\])/g, '$1')
    .trim();

  return value ? value : null;
}

export function pseudoElementInlineStyleForCapture(style: PseudoElementCaptureStyle): string {
  const out: string[] = [];

  function clean(value: string | undefined): string {
    return String(value ?? '').trim().replace(/[;<>"']/g, '');
  }

  function push(prop: string, value: string | undefined, skip: string[] = []) {
    const cleaned = clean(value);
    if (!cleaned)
      return;
    if (skip.some(v => cleaned.toLowerCase() === v))
      return;
    out.push(`${prop}:${cleaned}`);
  }

  push('display', style.display, ['none']);
  push('color', style.color);
  push('background-color', style.backgroundColor, ['transparent', 'rgba(0, 0, 0, 0)']);
  push('font-weight', style.fontWeight, ['normal', '400']);
  push('font-size', style.fontSize);
  push('line-height', style.lineHeight, ['normal']);
  push('margin', style.margin);
  push('padding', style.padding);
  push('border-radius', style.borderRadius, ['0px']);
  push('text-transform', style.textTransform, ['none']);
  push('letter-spacing', style.letterSpacing, ['normal', '0px']);

  return out.join(';');
}

export function materializePseudoElementTextForCapture(): number {
  function normalizeContent(content: string | null | undefined): string | null {
    const raw = String(content ?? '').trim();
    if (!raw)
      return null;

    const lower = raw.toLowerCase();
    if (
      lower === 'none'
      || lower === 'normal'
      || lower === 'open-quote'
      || lower === 'close-quote'
      || lower === 'no-open-quote'
      || lower === 'no-close-quote'
      || lower.startsWith('url(')
      || lower.startsWith('counter(')
      || lower.startsWith('counters(')
      || lower.startsWith('attr(')
    ) {
      return null;
    }

    const quote = raw.charAt(0);
    if ((quote !== '"' && quote !== '\'') || raw.charAt(raw.length - 1) !== quote)
      return null;

    const value = raw
      .slice(1, -1)
      .replace(/\\A\s?/gi, '\n')
      .replace(/\\([0-9a-fA-F]{1,6})\s?/g, function (_match, hex) {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : '';
      })
      .replace(/\\+(["'\\])/g, '$1')
      .trim();

    return value ? value : null;
  }

  function inlineStyle(style: CSSStyleDeclaration): string {
    const out: string[] = [];

    function clean(value: string | undefined): string {
      return String(value ?? '').trim().replace(/[;<>"']/g, '');
    }

    function push(prop: string, value: string | undefined, skip: string[] = []) {
      const cleaned = clean(value);
      if (!cleaned)
        return;
      if (skip.some(v => cleaned.toLowerCase() === v))
        return;
      out.push(`${prop}:${cleaned}`);
    }

    push('display', style.display, ['none']);
    push('color', style.color);
    push('background-color', style.backgroundColor, ['transparent', 'rgba(0, 0, 0, 0)']);
    push('font-weight', style.fontWeight, ['normal', '400']);
    push('font-size', style.fontSize);
    push('line-height', style.lineHeight, ['normal']);
    push('margin', style.margin);
    push('padding', style.padding);
    push('border-radius', style.borderRadius, ['0px']);
    push('text-transform', style.textTransform, ['none']);
    push('letter-spacing', style.letterSpacing, ['normal', '0px']);

    return out.join(';');
  }

  function isVisible(style: CSSStyleDeclaration): boolean {
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  let added = 0;
  document.querySelectorAll('*').forEach((el) => {
    if (!(el instanceof HTMLElement))
      return;
    if (el.hasAttribute('data-oem-pseudo-capture'))
      return;

    for (const pseudo of ['before', 'after']) {
      const style = window.getComputedStyle(el, `::${pseudo}`);
      if (!isVisible(style))
        continue;

      const text = normalizeContent(style.content);
      if (!text)
        continue;

      const existing = el.querySelector(`:scope > [data-oem-pseudo="${pseudo}"][data-oem-pseudo-capture="true"]`);
      if (existing)
        continue;

      const span = document.createElement('span');
      span.setAttribute('data-oem-pseudo', pseudo);
      span.setAttribute('data-oem-pseudo-capture', 'true');
      span.textContent = text;

      const styleText = inlineStyle(style);
      if (styleText)
        span.setAttribute('style', styleText);

      if (pseudo === 'before')
        el.insertBefore(span, el.firstChild);
      else
        el.appendChild(span);
      added++;
    }
  });

  return added;
}

function extractStylesheetHref(linkTag: string): string | null {
  const match = linkTag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);

  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function extractHtmlAttribute(tag: string, attrName: string): string | null {
  const escapedName = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));

  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function absolutizeCaptureUrl(url: string, sourceUrl: string): string {
  const trimmed = url.trim();
  if (!trimmed || /^https?:/i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:'))
    return trimmed;
  if (trimmed.startsWith('//'))
    return `https:${trimmed}`;

  try {
    return new URL(trimmed, sourceUrl).href;
  } catch {
    return trimmed;
  }
}

function isDataOrBlobCaptureUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return lower.startsWith('data:') || lower.startsWith('blob:');
}

function isHttpCaptureUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeCaptureSrcset(srcset: string, sourceUrl: string, imageUrls: Set<string>): string {
  return srcset
    .split(',')
    .map((entry) => {
      const parts = entry.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0)
        return '';

      parts[0] = absolutizeCaptureUrl(parts[0], sourceUrl);
      if (!parts[0] || isLikelyCaptureDocumentUrl(parts[0], sourceUrl))
        return '';
      if (isDataOrBlobCaptureUrl(parts[0]))
        return parts.join(' ');
      if (!isHttpCaptureUrl(parts[0]))
        return '';
      if (parts[0])
        imageUrls.add(parts[0]);

      return parts.join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

function normalizeCaptureStyleUrls(style: string, sourceUrl: string, imageUrls: Set<string>): string {
  return String(style || '').replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s][^)]*?))\s*\)/gi, (match, doubleQuoted, singleQuoted, bare) => {
    const rawUrl = String(doubleQuoted ?? singleQuoted ?? bare ?? '').trim();
    if (!rawUrl)
      return match;

    const absoluteUrl = absolutizeCaptureUrl(rawUrl, sourceUrl);
    if (!absoluteUrl || isDataOrBlobCaptureUrl(absoluteUrl))
      return match;
    if (!isHttpCaptureUrl(absoluteUrl))
      return '';
    if (isLikelyCaptureDocumentUrl(absoluteUrl, sourceUrl))
      return 'none';

    imageUrls.add(absoluteUrl);
    return `url("${absoluteUrl.replace(/"/g, '%22')}")`;
  });
}

function bestCaptureSrcsetUrl(srcset: string): string {
  return srcset.split(',').pop()?.trim().split(/\s+/)[0] ?? '';
}

function normalizeComparableUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed)
    return '';
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return trimmed.replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

function isLikelyCaptureDocumentUrl(url: string, sourceUrl: string): boolean {
  const absoluteUrl = absolutizeCaptureUrl(url, sourceUrl);
  if (normalizeComparableUrl(absoluteUrl) === normalizeComparableUrl(sourceUrl))
    return true;

  try {
    const parsed = new URL(absoluteUrl);
    const source = new URL(sourceUrl);
    if (parsed.origin !== source.origin)
      return false;

    const sourcePath = source.pathname.replace(/\/+$/, '') || '/';
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    if (sourcePath === '/' || !path.startsWith(`${sourcePath}/`))
      return false;

    const extraPath = path.slice(sourcePath.length + 1);
    return /^\d{4}(?:\/.*)?$/.test(extraPath);
  } catch {
    return false;
  }
}

function isNonRenderableCaptureMediaUrl(url: string, sourceUrl: string): boolean {
  const trimmed = url.trim();
  if (!trimmed)
    return true;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('blob:'))
    return true;

  const absoluteUrl = absolutizeCaptureUrl(trimmed, sourceUrl);
  return !isHttpCaptureUrl(absoluteUrl) || isLikelyCaptureDocumentUrl(absoluteUrl, sourceUrl);
}

function firstCaptureLazyImageSrc(el: Cheerio<any>): string {
  return CAPTURE_LAZY_IMAGE_SRC_ATTRS
    .map(attrName => (el.attr(attrName) || '').trim())
    .find(Boolean) || '';
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const SAFE_STYLESHEET_LINK_ATTRS = ['media', 'crossorigin', 'integrity', 'referrerpolicy'] as const;
const SAFE_INLINE_STYLE_ATTRS = ['media', 'title', 'data-styled', 'data-styled-version'] as const;

function stylesheetLinkTag(input: string, sourceUrl: string): string | null {
  const trimmed = input.trim();
  if (!trimmed)
    return null;

  const href = trimmed.startsWith('<')
    ? extractStylesheetHref(trimmed)
    : trimmed;
  if (!href)
    return null;

  const absoluteHref = absolutizeCaptureUrl(href, sourceUrl);
  if (!absoluteHref || !isHttpCaptureUrl(absoluteHref))
    return null;

  const attrs: Array<[string, string]> = [
    ['rel', 'stylesheet'],
    ['href', absoluteHref],
  ];

  if (trimmed.startsWith('<')) {
    for (const attrName of SAFE_STYLESHEET_LINK_ATTRS) {
      const value = extractHtmlAttribute(trimmed, attrName);
      if (value != null)
        attrs.push([attrName, value]);
    }
  }

  return `<link ${attrs.map(([name, value]) => `${name}="${escapeHtmlAttribute(value)}"`).join(' ')}>`;
}

function sanitizeCaptureHeadStyleCss(css: string, sourceUrl: string): string {
  const normalizedCss = normalizeCaptureStyleUrls(
    String(css || '').replace(/\/\*[\s\S]*?\*\//g, ''),
    sourceUrl,
    new Set(),
  );

  return normalizedCss
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/-moz-binding\s*:[^;]*;?/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/<\/style/gi, '<\\/style')
    .trim();
}

function inlineStyleTag($: CheerioAPI, node: any, sourceUrl: string): string | null {
  const css = sanitizeCaptureHeadStyleCss($(node).html() || '', sourceUrl);
  if (!css)
    return null;

  const attrs = node.attribs ?? {};
  const attrPairs: Array<[string, string]> = [];
  for (const attrName of SAFE_INLINE_STYLE_ATTRS) {
    const value = attrs[attrName];
    if (value != null)
      attrPairs.push([attrName, value]);
  }

  const attrSource = attrPairs.length
    ? ` ${attrPairs.map(([name, value]) => `${name}="${escapeHtmlAttribute(value)}"`).join(' ')}`
    : '';

  return `<style${attrSource}>${css}</style>`;
}

function captureHeadPartIdentity(part: string): string {
  const href = extractStylesheetHref(part);
  if (href)
    return `link:${href}`;

  const dataStyled = extractHtmlAttribute(part, 'data-styled');
  const dataStyledVersion = extractHtmlAttribute(part, 'data-styled-version');
  if (dataStyled != null)
    return `style:data-styled:${dataStyled}:${dataStyledVersion ?? ''}`;

  return `style:${part}`;
}

export function collectCaptureHeadPartsFromHtml(
  html: string,
  sourceUrl: string,
  stylesheetUrls: string[] = [],
): string[] {
  const $ = load(html);
  const stylesheetLinks = new Map<string, string>();

  for (const url of stylesheetUrls) {
    const tag = stylesheetLinkTag(url, sourceUrl);
    const href = tag ? extractStylesheetHref(tag) : null;
    if (tag && href)
      stylesheetLinks.set(href, tag);
  }

  $('link[rel~="stylesheet"]').each((_idx, node) => {
    const href = $(node).attr('href') || '';
    const linkHtml = $.html(node);
    const tag = stylesheetLinkTag(linkHtml || href, sourceUrl);
    const absoluteHref = tag ? extractStylesheetHref(tag) : null;
    if (tag && absoluteHref)
      stylesheetLinks.set(absoluteHref, tag);
  });

  $('head style').each((_idx, node) => {
    const tag = inlineStyleTag($, node, sourceUrl);
    if (tag)
      stylesheetLinks.set(captureHeadPartIdentity(tag), tag);
  });

  return [...stylesheetLinks.values()];
}

function mergeCaptureHeadParts(primary: string[], fallback: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const part of [...fallback, ...primary]) {
    const identity = captureHeadPartIdentity(part);
    if (seen.has(identity))
      continue;
    seen.add(identity);
    merged.push(part);
  }

  return merged;
}

function captureCssText(capture: DomCaptureResult): string {
  return capture.stylesheetLinks.join('\n');
}

function captureHtmlClassNames(html: string): string[] {
  const classNames = new Set<string>();
  for (const match of String(html || '').matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)) {
    for (const className of match[1].split(/\s+/)) {
      const trimmed = className.trim();
      if (trimmed)
        classNames.add(trimmed);
    }
  }
  return [...classNames];
}

function cssContainsClass(css: string, className: string): boolean {
  const escaped = className.replace(/([!"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, '\\$1');
  return css.includes(`.${className}`) || css.includes(`.${escaped}`);
}

function captureStyledClassMatchCount(capture: DomCaptureResult): number {
  const css = captureCssText(capture);
  if (!css.includes('data-styled'))
    return 0;

  return captureHtmlClassNames(capture.html)
    .filter(className => cssContainsClass(css, className))
    .length;
}

export function shouldPreferInitialDocumentCapture(
  browserCapture: DomCaptureResult,
  initialCapture: DomCaptureResult,
): boolean {
  const initialCss = captureCssText(initialCapture);
  if (!initialCss.includes('data-styled'))
    return false;

  const browserMatches = captureStyledClassMatchCount(browserCapture);
  const initialMatches = captureStyledClassMatchCount(initialCapture);

  return initialMatches >= 20 && initialMatches > browserMatches * 2;
}

function collectSrcsetUrls(srcset: string, sourceUrl: string, imageUrls: Set<string>): string {
  return normalizeCaptureSrcset(srcset, sourceUrl, imageUrls);
}

function bestImageSrcUrl(el: Cheerio<any>, sourceUrl: string): string {
  const src = (el.attr('src') || '').trim();
  const lazySrc = firstCaptureLazyImageSrc(el);
  if (lazySrc && isNonRenderableCaptureMediaUrl(src, sourceUrl))
    return absolutizeCaptureUrl(lazySrc, sourceUrl);

  if (src && !isNonRenderableCaptureMediaUrl(src, sourceUrl))
    return absolutizeCaptureUrl(src, sourceUrl);

  return '';
}

function bestElementImageUrl($: CheerioAPI, node: any, sourceUrl: string): string {
  const el = $(node);
  const tagName = (node.tagName || node.name || '').toLowerCase();

  if (tagName === 'picture') {
    const sourceSrcset = (el.find('source[srcset], source[data-srcset]').first().attr('srcset')
      || el.find('source[srcset], source[data-srcset]').first().attr('data-srcset')
      || '').trim();
    if (sourceSrcset) {
      const best = bestCaptureSrcsetUrl(collectSrcsetUrls(sourceSrcset, sourceUrl, new Set()));
      if (best)
        return best;
    }

    const img = el.find('img').first();
    const imgSrc = bestImageSrcUrl(img as Cheerio<any>, sourceUrl);
    if (imgSrc)
      return imgSrc;

    const imgSrcset = (img.attr('srcset') || img.attr('data-srcset') || '').trim();
    if (imgSrcset) {
      const best = bestCaptureSrcsetUrl(collectSrcsetUrls(imgSrcset, sourceUrl, new Set()));
      if (best)
        return best;
    }
  }

  if (tagName === 'img') {
    const src = bestImageSrcUrl(el, sourceUrl);
    if (src)
      return src;

    const srcset = (el.attr('srcset') || el.attr('data-srcset') || '').trim();
    if (srcset) {
      const best = bestCaptureSrcsetUrl(collectSrcsetUrls(srcset, sourceUrl, new Set()));
      if (best)
        return best;
    }
  }

  return '';
}

function stripExternalCaptureChrome($: CheerioAPI): void {
  const stripSelectors = [
    'script',
    'noscript',
    'meta',
    'base',
    'link[rel="preload"]',
    'link[rel="prefetch"]',
    'link[rel="dns-prefetch"]',
    'link[rel="preconnect"]',
    'nav',
    '[role="navigation"]',
    '[class*="navbar"]',
    '[class*="site-header"]',
    '[class*="main-header"]',
    'footer',
    '[role="contentinfo"]',
    '[class*="footer"]',
    '[id*="footer"]',
    '[class*="cookie"]',
    '[class*="consent"]',
    '[class*="gdpr"]',
    '[id*="cookie"]',
    '[id*="consent"]',
    '[id*="onetrust"]',
    '[class*="onetrust"]',
    'iframe',
    'img[width="1"]',
    'img[height="1"]',
    '[class*="tracking"]',
    '[data-tracking]',
    'form',
    '[class*="enquir"]',
    '[class*="chat"]',
    '[class*="livechat"]',
    '[class*="intercom"]',
    '[class*="modal"]',
    '[class*="popup"]',
    'object',
    'embed',
    'canvas',
  ];

  for (const selector of stripSelectors) {
    try {
      $(selector).remove();
    } catch {}
  }

  $('header').each((_idx, node) => {
    const header = $(node);
    if (header.find('nav, [role="navigation"]').length > 0)
      header.remove();
  });

  $('[hidden], [aria-hidden="true"]').remove();
  $('[style]').each((_idx, node) => {
    const el = $(node);
    const style = (el.attr('style') || '').toLowerCase();
    if (/(^|;)\s*display\s*:\s*none\b/.test(style) || /(^|;)\s*visibility\s*:\s*hidden\b/.test(style))
      el.remove();
  });
}

function removeDangerousAttributes($: CheerioAPI, container: Cheerio<any>): void {
  container.find('*').each((_idx, node) => {
    const el = $(node);
    const attrs = node.attribs ?? {};
    for (const attrName of Object.keys(attrs)) {
      const lowerName = attrName.toLowerCase();
      const value = attrs[attrName] ?? '';
      if (lowerName.startsWith('on')) {
        el.removeAttr(attrName);
        continue;
      }
      if ((lowerName === 'href' || lowerName === 'src') && value.trim().toLowerCase().startsWith('javascript:')) {
        el.removeAttr(attrName);
      }
    }
  });
}

export function buildDomCaptureFromHtml(input: ExternalHtmlCaptureInput, sourceUrl: string): DomCaptureResult | { bot_blocked: true } {
  if (isCaptureBlockedBySecurityPage({ html: input.html, title: input.title }))
    return { bot_blocked: true };

  const $ = load(input.html);
  stripExternalCaptureChrome($);

  const title = (input.title || $('h1').first().text() || $('title').first().text() || '').replace(/\s+/g, ' ').trim();
  if (isCaptureBlockedBySecurityPage({ html: $.html(), title }))
    return { bot_blocked: true };

  const stylesheetLinks = collectCaptureHeadPartsFromHtml(input.html, sourceUrl, input.stylesheetUrls ?? []);

  const containerSelectors = ['main', '[role="main"]', '#content', '#main-content', '.main-content', '.page-content', '.site-content', 'article'];
  let container: Cheerio<any> = $('body') as Cheerio<any>;
  for (const selector of containerSelectors) {
    const candidate = $(selector).first();
    if (candidate.length > 0 && (candidate.html() || '').length > 1000) {
      container = candidate as Cheerio<any>;
      break;
    }
  }

  removeDangerousAttributes($, container);

  const imageUrls = new Set<string>();

  container.find('img').each((_idx, node) => {
    const img = $(node);

    const dataSrc = firstCaptureLazyImageSrc(img as Cheerio<any>);
    if (dataSrc && !(img.attr('src') || '').trim())
      img.attr('src', dataSrc);

    const srcset = (img.attr('srcset') || img.attr('data-srcset') || '').trim();
    if (srcset) {
      const normalizedSrcset = collectSrcsetUrls(srcset, sourceUrl, imageUrls);
      img.attr('srcset', normalizedSrcset);
      if (!(img.attr('src') || '').trim()) {
        const best = bestCaptureSrcsetUrl(normalizedSrcset);
        if (best)
          img.attr('src', best);
      }
    }

    const src = (img.attr('src') || '').trim();
    if (src && !isDataOrBlobCaptureUrl(src)) {
      const absoluteSrc = absolutizeCaptureUrl(src, sourceUrl);
      if (!isHttpCaptureUrl(absoluteSrc)) {
        img.removeAttr('src');
        return;
      }
      img.attr('src', absoluteSrc);
      imageUrls.add(absoluteSrc);
    }
  });

  container.find('source[srcset], source[data-srcset]').each((_idx, node) => {
    const source = $(node);
    const srcset = (source.attr('srcset') || source.attr('data-srcset') || '').trim();
    if (!srcset)
      return;
    source.attr('srcset', collectSrcsetUrls(srcset, sourceUrl, imageUrls));
  });

  container.find('video').each((_idx, node) => {
    const video = $(node);
    const videoSrc = (video.attr('src') || video.attr('data-src') || '').trim();
    if (videoSrc && !isDataOrBlobCaptureUrl(videoSrc)) {
      const absoluteVideoSrc = absolutizeCaptureUrl(videoSrc, sourceUrl);
      if (isHttpCaptureUrl(absoluteVideoSrc) && !isLikelyCaptureDocumentUrl(absoluteVideoSrc, sourceUrl)) {
        video.attr('src', absoluteVideoSrc);
        imageUrls.add(absoluteVideoSrc);
      } else {
        video.removeAttr('src');
      }
    }
    const poster = (video.attr('poster') || video.attr('data-poster') || '').trim();
    if (poster && !isDataOrBlobCaptureUrl(poster)) {
      const absolutePoster = absolutizeCaptureUrl(poster, sourceUrl);
      if (isHttpCaptureUrl(absolutePoster) && !isLikelyCaptureDocumentUrl(absolutePoster, sourceUrl)) {
        video.attr('poster', absolutePoster);
        imageUrls.add(absolutePoster);
      } else {
        video.removeAttr('poster');
      }
    }
    video.find('source').each((_sourceIdx, sourceNode) => {
      const source = $(sourceNode);
      const src = (source.attr('src') || source.attr('data-src') || '').trim();
      if (src && !isDataOrBlobCaptureUrl(src)) {
        const absoluteSourceSrc = absolutizeCaptureUrl(src, sourceUrl);
        if (isHttpCaptureUrl(absoluteSourceSrc) && !isLikelyCaptureDocumentUrl(absoluteSourceSrc, sourceUrl)) {
          source.attr('src', absoluteSourceSrc);
          imageUrls.add(absoluteSourceSrc);
        } else {
          source.removeAttr('src');
        }
      }
    });
    video.attr('autoplay', '');
    video.attr('muted', '');
    video.attr('playsinline', '');
    video.attr('loop', '');
  });

  container.find('[style]').each((_idx, node) => {
    const el = $(node);
    const style = el.attr('style') || '';
    const normalizedStyle = normalizeCaptureStyleUrls(style, sourceUrl, imageUrls);
    if (normalizedStyle !== style)
      el.attr('style', normalizedStyle);
  });

  let heroUrl = '';
  for (const node of container.find('picture, img').toArray()) {
    heroUrl = bestElementImageUrl($, node, sourceUrl);
    if (heroUrl)
      break;
  }
  if (heroUrl)
    imageUrls.add(heroUrl);

  const result = normalizeCapturedLazyMedia({
    html: container.html() || '',
    stylesheetLinks,
    imageUrls: [...imageUrls],
    heroUrl,
    title,
    elementCount: container.find('*').length,
    viewport: input.viewport ?? { width: 1440, height: 1080 },
  }, sourceUrl);

  if (isCaptureBlockedBySecurityPage({ html: result.html, title: result.title }))
    return { bot_blocked: true };

  return result;
}

export function normalizeCapturedLazyMedia(result: DomCaptureResult, sourceUrl: string): DomCaptureResult {
  const $ = load(result.html, {}, false);
  const imageUrls = new Set<string>();
  for (const url of result.imageUrls) {
    const absoluteUrl = absolutizeCaptureUrl(url.trim(), sourceUrl);
    if (absoluteUrl && !isNonRenderableCaptureMediaUrl(absoluteUrl, sourceUrl))
      imageUrls.add(absoluteUrl);
  }

  $('source[data-srcset], img[data-srcset]').each((_idx, node) => {
    const el = $(node);
    const srcset = (el.attr('srcset') || el.attr('data-srcset') || '').trim();
    if (!srcset)
      return;

    el.attr('srcset', normalizeCaptureSrcset(srcset, sourceUrl, imageUrls));
    el.removeAttr('data-srcset');
  });

  $('picture').each((_idx, node) => {
    const picture = $(node);
    const source = picture.find('source').first();
    const img = picture.find('img').first();
    if (img.length === 0)
      return;

    const sourceSrcset = (source.attr('srcset') || source.attr('data-srcset') || '').trim();
    const imgSrcset = (img.attr('srcset') || img.attr('data-srcset') || '').trim();
    const fallbackSrcset = imgSrcset || sourceSrcset;
    if (!fallbackSrcset)
      return;

    const normalizedSrcset = normalizeCaptureSrcset(fallbackSrcset, sourceUrl, imageUrls);
    if (source.length > 0 && !(source.attr('srcset') || '').trim())
      source.attr('srcset', normalizedSrcset);
    if (source.length > 0)
      source.removeAttr('data-srcset');
    if (!(img.attr('srcset') || '').trim())
      img.attr('srcset', normalizedSrcset);
    img.removeAttr('data-srcset');
    if (!(img.attr('src') || '').trim()) {
      const best = bestCaptureSrcsetUrl(normalizedSrcset);
      if (best)
        img.attr('src', best);
    }
  });

  $('img').each((_idx, node) => {
    const img = $(node);
    const srcset = (img.attr('srcset') || '').trim();
    if (srcset) {
      const normalizedSrcset = normalizeCaptureSrcset(srcset, sourceUrl, imageUrls);
      img.attr('srcset', normalizedSrcset);
      if (!(img.attr('src') || '').trim()) {
        const best = bestCaptureSrcsetUrl(normalizedSrcset);
        if (best)
          img.attr('src', best);
      }
    }

    const currentSrc = (img.attr('src') || '').trim();
    const recoverableSrc = firstCaptureLazyImageSrc(img as Cheerio<any>);
    if (recoverableSrc && isNonRenderableCaptureMediaUrl(currentSrc, sourceUrl)) {
      img.attr('src', recoverableSrc);
      for (const attrName of CAPTURE_LAZY_IMAGE_SRC_ATTRS)
        img.removeAttr(attrName);
    }

    const src = (img.attr('src') || '').trim();
    if (src && !isDataOrBlobCaptureUrl(src)) {
      const absoluteSrc = absolutizeCaptureUrl(src, sourceUrl);
      if (!isHttpCaptureUrl(absoluteSrc)) {
        img.removeAttr('src');
        return;
      }
      if (isLikelyCaptureDocumentUrl(absoluteSrc, sourceUrl) && !(img.attr('srcset') || '').trim()) {
        img.remove();
        return;
      }
      img.attr('src', absoluteSrc);
      imageUrls.add(absoluteSrc);
      if (recoverableSrc && normalizeComparableUrl(absoluteSrc) === normalizeComparableUrl(absolutizeCaptureUrl(recoverableSrc, sourceUrl))) {
        for (const attrName of CAPTURE_LAZY_IMAGE_SRC_ATTRS)
          img.removeAttr(attrName);
      }
    }
  });

  $('img').each((_idx, node) => {
    const img = $(node);
    const hasRenderableSource = (img.attr('src') || img.attr('srcset') || '').trim();
    const hasRecoverableSource = (img.attr('data-srcset') || firstCaptureLazyImageSrc(img as Cheerio<any>)).trim();
    if (!hasRenderableSource && !hasRecoverableSource)
      img.remove();
  });

  $('source[srcset]').each((_idx, node) => {
    const source = $(node);
    const srcset = (source.attr('srcset') || '').trim();
    if (srcset)
      source.attr('srcset', normalizeCaptureSrcset(srcset, sourceUrl, imageUrls));
  });

  $('video').each((_idx, node) => {
    const video = $(node);
    const currentSrc = (video.attr('src') || '').trim();
    const recoverableSrc = (video.attr('data-src') || '').trim();
    const src = recoverableSrc && isNonRenderableCaptureMediaUrl(currentSrc, sourceUrl)
      ? recoverableSrc
      : currentSrc || recoverableSrc;
    if (src && !isNonRenderableCaptureMediaUrl(src, sourceUrl)) {
      const absoluteSrc = absolutizeCaptureUrl(src, sourceUrl);
      video.attr('src', absoluteSrc);
      video.removeAttr('data-src');
      imageUrls.add(absoluteSrc);
    } else if (src && !isDataOrBlobCaptureUrl(src)) {
      video.removeAttr('src');
      if (recoverableSrc)
        video.removeAttr('data-src');
    }

    const currentPoster = (video.attr('poster') || '').trim();
    const recoverablePoster = (video.attr('data-poster') || '').trim();
    const poster = recoverablePoster && isNonRenderableCaptureMediaUrl(currentPoster, sourceUrl)
      ? recoverablePoster
      : currentPoster || recoverablePoster;
    if (poster && !isNonRenderableCaptureMediaUrl(poster, sourceUrl)) {
      const absolutePoster = absolutizeCaptureUrl(poster, sourceUrl);
      video.attr('poster', absolutePoster);
      video.removeAttr('data-poster');
      imageUrls.add(absolutePoster);
    } else if (poster && !isDataOrBlobCaptureUrl(poster)) {
      video.removeAttr('poster');
      if (recoverablePoster)
        video.removeAttr('data-poster');
    }

    video.find('source').each((_sourceIdx, sourceNode) => {
      const source = $(sourceNode);
      const currentSourceSrc = (source.attr('src') || '').trim();
      const recoverableSourceSrc = (source.attr('data-src') || '').trim();
      const sourceSrc = recoverableSourceSrc && isNonRenderableCaptureMediaUrl(currentSourceSrc, sourceUrl)
        ? recoverableSourceSrc
        : currentSourceSrc || recoverableSourceSrc;
      if (!sourceSrc)
        return;
      if (isNonRenderableCaptureMediaUrl(sourceSrc, sourceUrl)) {
        if (!isDataOrBlobCaptureUrl(sourceSrc))
          source.removeAttr('src');
        if (recoverableSourceSrc)
          source.removeAttr('data-src');
        return;
      }
      const absoluteSourceSrc = absolutizeCaptureUrl(sourceSrc, sourceUrl);
      source.attr('src', absoluteSourceSrc);
      source.removeAttr('data-src');
      imageUrls.add(absoluteSourceSrc);
    });
  });

  $('[data-bg], [data-background-image]').each((_idx, node) => {
    const el = $(node);
    const backgroundUrl = (el.attr('data-bg') || el.attr('data-background-image') || '').trim();
    if (backgroundUrl) {
      const absoluteBackgroundUrl = absolutizeCaptureUrl(backgroundUrl, sourceUrl);
      if (absoluteBackgroundUrl && !isNonRenderableCaptureMediaUrl(absoluteBackgroundUrl, sourceUrl)) {
        const currentStyle = (el.attr('style') || '').trim();
        const separator = currentStyle && !currentStyle.endsWith(';') ? '; ' : '';
        el.attr('style', `${currentStyle}${separator}background-image:url("${absoluteBackgroundUrl.replace(/"/g, '%22')}")`);
        imageUrls.add(absoluteBackgroundUrl);
      }
    }
    el.removeAttr('data-bg');
    el.removeAttr('data-background-image');
  });

  $('[style]').each((_idx, node) => {
    const el = $(node);
    const style = el.attr('style') || '';
    const normalizedStyle = normalizeCaptureStyleUrls(style, sourceUrl, imageUrls);
    if (normalizedStyle !== style)
      el.attr('style', normalizedStyle);
  });

  let heroUrl = result.heroUrl ? absolutizeCaptureUrl(result.heroUrl, sourceUrl) : result.heroUrl;
  if (!heroUrl || isNonRenderableCaptureMediaUrl(heroUrl, sourceUrl)) {
    heroUrl = '';
    for (const node of $('picture, img').toArray()) {
      heroUrl = bestElementImageUrl($, node, sourceUrl);
      if (heroUrl)
        break;
    }
  }
  if (heroUrl && !isNonRenderableCaptureMediaUrl(heroUrl, sourceUrl))
    imageUrls.add(heroUrl);

  return {
    ...result,
    html: $.html(),
    imageUrls: [...imageUrls],
    heroUrl,
  };
}

export function prioritizeCaptureImageUrls(
  imageUrls: string[],
  options: { heroUrl?: string; limit?: number } = {},
): string[] {
  const limit = options.limit ?? imageUrls.length;
  const heroUrl = options.heroUrl || '';
  const unique = [...new Set(imageUrls)];

  function priority(url: string): number {
    const lower = url.toLowerCase();
    if (heroUrl && url === heroUrl)
      return 0;
    if (lower.includes('hero') || lower.includes('header') || lower.includes('banner'))
      return 1;
    if (lower.includes('background') || lower.includes('bg'))
      return 2;
    if (/(^|[-_/])showroom([-_/]|$)/i.test(lower))
      return 3;
    return 4;
  }

  return unique
    .map((url, index) => ({ url, index, priority: priority(url) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(item => item.url);
}

// ============================================================================
// PageCapturer Class
// ============================================================================

export class PageCapturer {
  private r2Bucket: R2Bucket;
  private browser: Fetcher;

  constructor(deps: { r2Bucket: R2Bucket; browser: Fetcher }) {
    this.r2Bucket = deps.r2Bucket;
    this.browser = deps.browser;
  }

  async captureModelPage(
    oemId: OemId,
    modelSlug: string,
    sourceUrl: string,
    modelName?: string,
    options: PageCaptureOptions = {},
  ): Promise<PageCaptureResult> {
    const startTime = Date.now();
    const backend = options.backend ?? 'cloudflare-browser';

    try {
      if (isModelPageWriteProtected(oemId)) {
        return {
          success: false,
          capture_time_ms: Date.now() - startTime,
          capture_backend: backend,
          error: getModelPageWriteProtectedMessage(oemId),
        };
      }

      if (backend === 'scrapling-stealth' && oemId !== 'toyota-au') {
        return {
          success: false,
          capture_time_ms: Date.now() - startTime,
          capture_backend: backend,
          error: 'scrapling-stealth capture backend is currently allowlisted only for toyota-au',
        };
      }

      if ((backend === 'scrapling-stealth' || backend === 'external-html') && !options.externalCapture?.html) {
        return {
          success: false,
          capture_time_ms: Date.now() - startTime,
          capture_backend: backend,
          error: `${backend} capture backend requires external captured_html input`,
        };
      }

      const profile = resolveCaptureProfile(oemId);
      let capture = backend === 'scrapling-stealth' || backend === 'external-html'
        ? buildDomCaptureFromHtml(options.externalCapture!, options.externalCapture?.finalUrl || sourceUrl)
        : await this.captureDom(sourceUrl, profile);
      if ('bot_blocked' in capture) {
        return {
          success: false,
          capture_time_ms: Date.now() - startTime,
          capture_backend: backend,
          bot_blocked: true,
          error: 'Security verification page detected; existing page was not overwritten',
        };
      }

      const lastGoodScrollHeight = await readLastGoodCapturedHeight(this.r2Bucket, oemId, modelSlug);
      const browserGate = evaluateCaptureCompleteness(
        { audit: ('audit' in capture ? capture.audit : undefined), lastGoodScrollHeight },
        profile.completeness,
      );

      let initialDocumentPreferred = false;
      if (backend === 'cloudflare-browser') {
        const initialDocument = await this.fetchInitialDocumentCapture(sourceUrl);
        const ssrPreferred = Boolean(
          initialDocument.capture && shouldPreferInitialDocumentCapture(capture, initialDocument.capture),
        );

        if (ssrPreferred && !browserGate.passed) {
          // The hydrated browser render already failed its own completeness gate —
          // only then is trading it for SSR HTML worth considering. SSR markup never
          // ran the hydration sweep, so give it the same emptiness scrutiny before
          // trusting it over a render we just rejected.
          const emptyShells = countEmptyFeatureAppShellsInHtml(
            initialDocument.capture!.html,
            profile.featureAppShellSelectors,
          );

          if (emptyShells.length <= profile.completeness.maxEmptyShells) {
            capture = initialDocument.capture!;
            initialDocumentPreferred = true;
          } else {
            const suggestedBackend = profile.backendOrder.find(candidate => candidate !== backend);
            const browserAudit = 'audit' in capture ? capture.audit : undefined;
            const errorMessage = `Capture completeness gate failed: browser render: ${browserGate.reasons.join('; ')}; initial-document fallback also incomplete: ${emptyShells.length} empty feature-app shell(s)`;
            console.warn(`[PageCapturer] ${errorMessage}`);
            return {
              success: false,
              capture_time_ms: Date.now() - startTime,
              capture_backend: backend,
              capture_audit: browserAudit,
              completeness: browserGate,
              suggested_backend: suggestedBackend,
              error: errorMessage,
            };
          }
        }

        // Browser render already passing its gate (even if SSR "wins" the styled-class
        // preference contest) or SSR simply not preferred: never swap it away. Still
        // merge SSR head parts so CSS enrichment applies to the kept browser render.
        if (!initialDocumentPreferred && initialDocument.headParts.length > 0) {
          capture.stylesheetLinks = mergeCaptureHeadParts(capture.stylesheetLinks, initialDocument.headParts);
        }
      }

      const captureAudit = 'audit' in capture ? capture.audit : undefined;
      const completeness = initialDocumentPreferred
        ? evaluateCaptureCompleteness({ audit: captureAudit, lastGoodScrollHeight }, profile.completeness)
        : browserGate;
      if (initialDocumentPreferred) {
        completeness.reasons.push('initial-document capture preferred over browser render; hydration audit not applicable');
      }
      if (!completeness.passed) {
        const suggestedBackend = profile.backendOrder.find(candidate => candidate !== backend);
        console.warn(`[PageCapturer] Completeness gate FAILED for ${oemId}/${modelSlug}: ${completeness.reasons.join('; ')}`);
        return {
          success: false,
          capture_time_ms: Date.now() - startTime,
          capture_backend: backend,
          capture_audit: captureAudit,
          completeness,
          suggested_backend: suggestedBackend,
          initial_document_preferred: initialDocumentPreferred || undefined,
          error: `Capture completeness gate failed: ${completeness.reasons.join('; ')}${suggestedBackend ? ` — suggested fallback backend: ${suggestedBackend}` : ''}`,
        };
      }

      console.log(`[PageCapturer] Captured via ${backend}: "${capture.title}", ${capture.elementCount} elements, ${capture.imageUrls.length} images`);

      // Download images to R2
      const imageUrls = prioritizeCaptureImageUrls(capture.imageUrls, {
        heroUrl: capture.heroUrl,
        limit: MAX_IMAGE_DOWNLOADS,
      });
      const urlMapping = await this.downloadImages(oemId, modelSlug, imageUrls);

      // Rewrite image URLs in HTML
      let html = capture.html;
      for (const [originalUrl, proxyPath] of urlMapping) {
        html = html.replaceAll(originalUrl, proxyPath);
      }

      // Recognize interactive regions and stamp Alpine directives (attributes
      // only — the runtime script ships separately in clone.runtime_js).
      const annotated = annotateCloneInteractions(html);
      html = annotated.html;
      if (annotated.interactions.length > 0)
        console.log(`[PageCapturer] Clone runtime: stamped ${annotated.interactions.length} region(s): ${annotated.interactions.map(entry => entry.type).join(', ')}`);

      const heroUrl = urlMapping.get(capture.heroUrl) || capture.heroUrl;

      // Assemble: stylesheet links + static clone safety overrides + cleaned HTML body
      const stylesheetHtml = capture.stylesheetLinks.join('\n');
      const overrideCss = [
        // Keep tab containers paintable without overriding active/inactive panel state.
        '.tab_contents,.tab-content,.tab_content{visibility:visible!important;opacity:1!important;}',
        CAPTURE_STATIC_CLONE_SAFETY_CSS,
        CAPTURE_STATIC_CAROUSEL_SAFETY_CSS,
        CAPTURE_STATIC_MEDIA_FRAME_CSS,
        // Basic resets for iframe context
        'img{max-width:100%;height:auto;} :root{overflow-x:hidden;}',
      ].join('\n');

      const assembledHtml = [
        stylesheetHtml,
        `<style>${overrideCss}</style>`,
        html,
      ].filter(Boolean).join('\n');

      // Build VehicleModelPage and store in R2
      const name = modelName || capture.title;
      const latestKey = `${R2_PREFIX}/${oemId}/${modelSlug}/latest.json`;
      const existingObj = await this.r2Bucket.get(latestKey);
      let existingPage: StoredVehicleModelPage | undefined;

      if (existingObj) {
        try {
          existingPage = (await existingObj.json()) as StoredVehicleModelPage;
        } catch (err) {
          console.warn(`[PageCapturer] Failed to parse existing page at ${latestKey}; refreshing clone from scratch`, err);
        }
      }

      const fallbackSlides = heroUrl ? [{
        heading: capture.title || name,
        sub_heading: '',
        button: '',
        desktop: heroUrl,
        mobile: heroUrl,
        bottom_strip: [],
      }] : [];
      const existingContent = existingPage?.content;
      const basePage: StoredVehicleModelPage = {
        ...(existingPage ?? {}),
        id: `${oemId}-${modelSlug}`,
        slug: modelSlug,
        name,
        oem_id: oemId,
        header: {
          ...(existingPage?.header ?? {}),
          slides: existingPage?.header?.slides?.length
            ? existingPage.header.slides
            : fallbackSlides,
        },
        content: {
          ...(existingContent ?? {}),
          rendered: existingContent?.rendered ?? '',
          sections: Array.isArray(existingContent?.sections) ? existingContent.sections : [],
          modes: existingContent?.modes,
        },
        form: existingPage?.form ?? false,
        variant_link: existingPage?.variant_link ?? `/models/${modelSlug}/variants`,
        generated_at: new Date().toISOString(),
        source_url: sourceUrl,
        version: typeof existingPage?.version === 'number' ? existingPage.version + 1 : 3,
      };

      const pageData = applyCloneMode(basePage, {
        rendered: assembledHtml,
        source_url: sourceUrl,
        viewport: capture.viewport,
        asset_map: Object.fromEntries(urlMapping),
        stylesheet_urls: capture.stylesheetLinks
          .map(extractStylesheetHref)
          .filter((href): href is string => Boolean(href)),
        section_index: [],
        warnings: [],
        interactions: annotated.interactions,
        runtime_js: annotated.interactions.length > 0 ? buildCloneRuntimeScript() : undefined,
        runtime_version: annotated.interactions.length > 0 ? CLONE_RUNTIME_VERSION : undefined,
      }, { activate: !existingPage || !existingPage.active_mode }) as VehicleModelPage;

      const versionKey = `${R2_PREFIX}/${oemId}/${modelSlug}/v${Date.now()}.json`;
      const jsonStr = JSON.stringify(pageData);

      await Promise.all([
        this.r2Bucket.put(latestKey, jsonStr, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { pipeline: 'full-page-v1', oem_id: oemId, model_slug: modelSlug, capture_backend: backend },
        }),
        this.r2Bucket.put(versionKey, jsonStr, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { pipeline: 'full-page-v1', capture_backend: backend },
        }),
      ]);

      console.log(`[PageCapturer] Stored at ${latestKey}`);

      return {
        success: true,
        page: pageData,
        r2_key: latestKey,
        capture_time_ms: Date.now() - startTime,
        capture_backend: backend,
        elements_captured: capture.elementCount,
        images_uploaded: urlMapping.size,
        html_size_kb: Math.round(html.length / 1024),
        capture_audit: captureAudit,
        completeness,
        initial_document_preferred: initialDocumentPreferred || undefined,
      };
    } catch (err: any) {
      console.error(`[PageCapturer] Error:`, err);
      return {
        success: false,
        capture_time_ms: Date.now() - startTime,
        error: err.message || String(err),
      };
    }
  }

  // ============================================================================
  // DOM Capture via Puppeteer
  // ============================================================================

  private async fetchInitialDocumentCapture(sourceUrl: string): Promise<InitialDocumentCapture> {
    try {
      const response = await fetch(sourceUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-AU,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        },
        signal: AbortSignal.timeout(12_000),
      });

      if (!response.ok)
        return { headParts: [] };

      const contentType = response.headers.get('content-type') || '';
      if (contentType && !contentType.toLowerCase().includes('html'))
        return { headParts: [] };

      const html = await response.text();
      if (isCaptureBlockedBySecurityPage({ html }))
        return { headParts: [] };

      const capture = buildDomCaptureFromHtml({ html, finalUrl: sourceUrl }, sourceUrl);
      if ('bot_blocked' in capture)
        return { headParts: collectCaptureHeadPartsFromHtml(html, sourceUrl) };

      return {
        headParts: capture.stylesheetLinks,
        capture,
      };
    } catch (error) {
      console.warn('[PageCapturer] Initial document CSS merge failed:', error);
      return { headParts: [] };
    }
  }

  private async captureDom(
    sourceUrl: string,
    profile: OemCaptureProfile,
  ): Promise<DomCaptureResult | { bot_blocked: true }> {
    const puppeteerModule = await import('@cloudflare/puppeteer');
    const puppeteer = puppeteerModule.default;
    const browser = await puppeteer.launch(this.browser as any);

    try {
      const page = await browser.newPage();

      // Anti-bot mitigations
      const viewportWidth = 1440 + Math.floor(Math.random() * 480);
      await page.setViewport({ width: viewportWidth, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      );
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-AU,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      });
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      console.log(`[PageCapturer] Navigating to ${sourceUrl}`);
      await page.goto(sourceUrl, { waitUntil: 'networkidle2', timeout: 45_000 });
      await new Promise(r => setTimeout(r, 3000));

      // Bot/security check. Keep this broad enough to catch OEM-branded challenge pages, not only
      // small Cloudflare interstitials, so failed captures cannot overwrite good R2 pages.
      const rawHtml = await page.content();
      const rawTitle = await page.title().catch(() => '');
      if (isCaptureBlockedBySecurityPage({ html: rawHtml, title: rawTitle })) {
        return { bot_blocked: true };
      }

      // Phase 0: Activate hidden tabs/sections + resolve lazy media BEFORE scrolling
      // This ensures the browser's IntersectionObserver can detect images in
      // newly-visible panels when we scroll.
      await page.evaluate(() => {
        // Activate tab panels
        const TAB_SELS = [
          '.tab_contents', '.tab-content', '.tab-panel', '.tab_content',
          '[role="tabpanel"]', '[class*="tabpanel"]',
          // Common accordion/section patterns
          '.accordion-content', '.collapse-content', '[class*="accordion"]',
          '.section-content', '[class*="section-body"]',
        ];
        for (const sel of TAB_SELS) {
          try {
            document.querySelectorAll(sel).forEach(el => {
              const he = el as HTMLElement;
              he.style.setProperty('display', 'block', 'important');
              he.style.setProperty('opacity', '1', 'important');
              he.style.setProperty('visibility', 'visible', 'important');
              he.style.setProperty('height', 'auto', 'important');
              he.style.setProperty('max-height', 'none', 'important');
              he.style.setProperty('overflow', 'visible', 'important');
            });
          } catch {}
        }
      });

      const lazyMediaActivation = await page.evaluate(activateLazyMediaForCapture as any);
      console.log(`[PageCapturer] Lazy media activation: images=${lazyMediaActivation.imageSources}, srcsets=${lazyMediaActivation.sourceSets}, backgrounds=${lazyMediaActivation.backgrounds}, eager=${lazyMediaActivation.eagerImages}, videoSources=${lazyMediaActivation.videoSources}, videoPosters=${lazyMediaActivation.videoPosters}`);

      // Wait a moment for the DOM changes to take effect
      await new Promise(r => setTimeout(r, 500));

      // Paced multi-pass hydration sweep: keep sweeping until the page stops
      // growing so scroll-mounted feature apps exist before we serialize.
      const hydrationReport = await page.evaluate(runPacedHydrationSweepForCapture as any, {
        budgetMs: profile.hydration.budgetMs,
        stepDelayMs: profile.hydration.stepDelayMs,
        mountWaitMs: profile.hydration.mountWaitMs,
        stabilityPct: profile.hydration.stabilityPct,
        maxPasses: profile.hydration.maxPasses,
      }) as CaptureHydrationReport;
      console.log(`[PageCapturer] Hydration sweep: ${hydrationReport.status} after ${hydrationReport.passes.length} pass(es), height=${hydrationReport.final_scroll_height}, images=${hydrationReport.final_image_count}`);

      // Give known still-empty feature-app shells a bounded second chance.
      const featureAppReport = await page.evaluate(waitForFeatureAppMountsForCapture as any, {
        shellSelectors: profile.featureAppShellSelectors,
        mountWaitMs: profile.hydration.mountWaitMs,
      }) as CaptureFeatureAppMountReport;
      console.log(`[PageCapturer] Feature apps: checked=${featureAppReport.checked}, recovered=${featureAppReport.recovered}, stillEmpty=${featureAppReport.still_empty.length}`);

      // Wait for images to finish loading after scroll
      await new Promise(r => setTimeout(r, 2000));

      const imageReadyStatus = await page.evaluate(waitForCaptureImagesForCapture as any, CAPTURE_IMAGE_READY_TIMEOUT_MS);
      console.log(`[PageCapturer] Image readiness: ${imageReadyStatus}`);

      const fontReadyStatus = await page.evaluate(waitForCaptureFontsForCapture as any, CAPTURE_FONT_READY_TIMEOUT_MS);
      console.log(`[PageCapturer] Font readiness: ${fontReadyStatus}`);

      const domQuietStatus = await page.evaluate(waitForCaptureDomQuietForCapture as any, CAPTURE_DOM_QUIET_WINDOW_MS, CAPTURE_DOM_QUIET_TIMEOUT_MS);
      console.log(`[PageCapturer] DOM quiet: ${domQuietStatus}`);

      const auditSnapshot = await page.evaluate(() => ({
        scroll_height: Math.max(
          Number(document.documentElement?.scrollHeight ?? 0),
          Number(document.body?.scrollHeight ?? 0),
        ),
        image_count: document.querySelectorAll('img').length,
      })) as { scroll_height: number; image_count: number };

      // Materialize simple CSS ::before/::after text before serializing the DOM. This preserves
      // OEM badges/labels that would otherwise disappear when Clone Studio strips page CSS scripts.
      await page.evaluate(materializePseudoElementTextForCapture as any);

      // Main DOM capture
      const result = await page.evaluate(() => {
        const baseUrl = document.location.origin;

        // ====== Helpers ======

        function abs(url: string): string {
          if (!url || url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
          if (url.startsWith('//')) return 'https:' + url;
          try { return new URL(url, document.location.href).href; } catch { return baseUrl + '/' + url; }
        }

        function getImageUrl(el: Element): string {
          if (el.tagName === 'PICTURE') {
            const source = el.querySelector('source[srcset]') as HTMLSourceElement;
            if (source?.srcset) {
              const best = source.srcset.split(',').pop()?.trim().split(/\s+/)[0];
              if (best) return abs(best);
            }
            const img = el.querySelector('img') as HTMLImageElement;
            if (img?.src) return abs(img.src);
            if (img?.srcset) {
              const best = img.srcset.split(',').pop()?.trim().split(/\s+/)[0];
              if (best) return abs(best);
            }
          }
          if (el.tagName === 'IMG') {
            const img = el as HTMLImageElement;
            if (img.srcset) {
              const best = img.srcset.split(',').pop()?.trim().split(/\s+/)[0];
              if (best) return abs(best);
            }
            if (img.src) return abs(img.src);
          }
          if (el instanceof HTMLElement) {
            const bg = window.getComputedStyle(el).backgroundImage;
            const m = bg?.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
            if (m) return m[1];
          }
          return '';
        }

        // ====== Phase A: Detect hero BEFORE stripping ======

        let heroUrl = '';
        const mainContainer = document.querySelector('main') || document.body;

        for (const pic of mainContainer.querySelectorAll('picture')) {
          const rect = pic.getBoundingClientRect();
          if (rect.width > 600 && rect.top < 800) {
            heroUrl = getImageUrl(pic);
            if (heroUrl) break;
          }
        }
        if (!heroUrl) {
          for (const img of mainContainer.querySelectorAll('img')) {
            const rect = img.getBoundingClientRect();
            if (rect.width > 600 && rect.top < 800) {
              heroUrl = getImageUrl(img);
              if (heroUrl) break;
            }
          }
        }
        if (!heroUrl) {
          for (const sel of ['.hero', '.banner', '[class*="hero"]', '[class*="banner"]', '[class*="kv-"]', '.splash']) {
            try {
              const el = mainContainer.querySelector(sel) as HTMLElement;
              if (el) {
                heroUrl = getImageUrl(el);
                if (heroUrl) break;
                const pic = el.querySelector('picture');
                if (pic) { heroUrl = getImageUrl(pic); if (heroUrl) break; }
                const img = el.querySelector('img');
                if (img) { heroUrl = getImageUrl(img); if (heroUrl) break; }
              }
            } catch {}
          }
        }

        // ====== Phase B: Strip unwanted elements ======

        const STRIP_SELECTORS = [
          'script', 'noscript', 'link[rel="preload"]', 'link[rel="prefetch"]',
          'link[rel="dns-prefetch"]', 'link[rel="preconnect"]', 'meta', 'base',
          'nav', 'header:has(nav)', '[role="navigation"]',
          '[class*="nav-"]', '[class*="navbar"]', '[class*="site-header"]',
          '[class*="main-header"]',
          'footer', '[role="contentinfo"]', '[class*="footer"]', '[id*="footer"]',
          '[class*="cookie"]', '[class*="consent"]', '[class*="gdpr"]',
          '[id*="cookie"]', '[id*="consent"]', '[id*="onetrust"]', '[class*="onetrust"]',
          'iframe', 'img[width="1"]', 'img[height="1"]',
          '[class*="tracking"]', '[data-tracking]',
          'form', '[class*="enquir"]', '[class*="chat"]', '[class*="livechat"]',
          '[class*="intercom"]',
          '[class*="modal"]', '[class*="popup"]',
          'object', 'embed', 'canvas',
        ];

        for (const sel of STRIP_SELECTORS) {
          try {
            document.querySelectorAll(sel).forEach(el => el.remove());
          } catch {}
        }

        // ====== Phase B2: Activate hidden tab panels ======

        const TAB_PANEL_SELS = [
          '.tab_contents', '.tab-content', '.tab-panel', '.tab_content',
          '[role="tabpanel"]', '[class*="tabpanel"]',
        ];
        for (const sel of TAB_PANEL_SELS) {
          try {
            document.querySelectorAll(sel).forEach(el => {
              const he = el as HTMLElement;
              he.style.setProperty('display', 'block', 'important');
              he.style.setProperty('opacity', '1', 'important');
              he.style.setProperty('visibility', 'visible', 'important');
            });
          } catch {}
        }

        // ====== Phase B3: Resolve any remaining lazy-loaded media ======

        const LAZY_IMG_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-image-src'];
        document.querySelectorAll('img').forEach(img => {
          for (const attr of LAZY_IMG_ATTRS) {
            const val = img.getAttribute(attr);
            if (val) {
              (img as HTMLImageElement).src = abs(val);
              img.removeAttribute(attr);
              break;
            }
          }
        });

        // Resolve data-src on video sources
        document.querySelectorAll('video').forEach(video => {
          const videoDataSrc = video.getAttribute('data-src');
          if (videoDataSrc) {
            video.setAttribute('src', abs(videoDataSrc));
            video.removeAttribute('data-src');
          } else {
            const videoSrc = video.getAttribute('src');
            if (videoSrc && !videoSrc.startsWith('http') && !videoSrc.startsWith('data:') && !videoSrc.startsWith('blob:')) {
              video.setAttribute('src', abs(videoSrc));
            }
          }
          video.querySelectorAll('source').forEach(source => {
            const dataSrc = source.getAttribute('data-src');
            if (dataSrc) {
              source.setAttribute('src', abs(dataSrc));
              source.removeAttribute('data-src');
            }
          });
          const dataPoster = video.getAttribute('data-poster');
          if (dataPoster && !video.poster) {
            video.poster = abs(dataPoster);
          } else if (video.poster && !video.poster.startsWith('http')) {
            video.poster = abs(video.poster);
          }
        });

        // ====== Phase B4: Remove hidden elements ======
        // Skip style/link/video/source — they're non-visual or media elements
        const SKIP_TAGS = new Set(['STYLE', 'LINK', 'HEAD', 'TITLE', 'VIDEO', 'SOURCE']);
        document.querySelectorAll('*').forEach(el => {
          if (!(el instanceof HTMLElement)) return;
          if (SKIP_TAGS.has(el.tagName)) return;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') el.remove();
        });

        // ====== Phase C: Collect external stylesheets ======

        const seenHrefs = new Set<string>();
        const stylesheetLinks: string[] = [];

        function escapeAttr(value: string): string {
          return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        }

        function sanitizeStyleCss(css: string): string {
          return String(css || '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/@import[^;]*;?/gi, '')
            .replace(/expression\s*\([^)]*\)/gi, '')
            .replace(/-moz-binding\s*:[^;]*;?/gi, '')
            .replace(/javascript\s*:/gi, '')
            .replace(/vbscript\s*:/gi, '')
            .replace(/url\((["']?)(.*?)\1\)/gi, (_match, _quote, rawUrl) => {
              const url = String(rawUrl || '').trim();
              if (!url)
                return '';
              if (/^data:image\/(?:png|jpe?g|gif|webp|avif)(?:;[^,]*)?,/i.test(url))
                return `url("${url.replace(/"/g, '%22')}")`;
              try {
                const absoluteUrl = new URL(url, document.location.href);
                if (absoluteUrl.protocol !== 'http:' && absoluteUrl.protocol !== 'https:')
                  return '';
                return `url("${absoluteUrl.href.replace(/"/g, '%22')}")`;
              } catch {
                return '';
              }
            })
            .replace(/<\/style/gi, '<\\/style')
            .trim();
        }

        function inlineStyleTag(style: HTMLStyleElement): string | null {
          const css = sanitizeStyleCss(style.textContent || '');
          if (!css)
            return null;

          const attrs: Array<[string, string]> = [];
          for (const name of ['media', 'title', 'data-styled', 'data-styled-version']) {
            const value = style.getAttribute(name);
            if (value != null)
              attrs.push([name, value]);
          }

          return '<style' + (attrs.length ? ' ' + attrs.map(([name, value]) => name + '="' + escapeAttr(value) + '"').join(' ') : '') + '>' + css + '</style>';
        }

        document.querySelectorAll('link[rel~="stylesheet"]').forEach(link => {
          const htmlLink = link as HTMLLinkElement;
          const href = htmlLink.href;
          let parsedHref: URL | null = null;
          try { parsedHref = href ? new URL(href) : null; } catch {}
          if (!parsedHref || (parsedHref.protocol !== 'http:' && parsedHref.protocol !== 'https:') || seenHrefs.has(href))
            return;

          const attrs: Array<[string, string]> = [
            ['rel', 'stylesheet'],
            ['href', href],
          ];
          const media = link.getAttribute('media');
          if (media != null)
            attrs.push(['media', media]);
          const crossorigin = link.getAttribute('crossorigin');
          if (crossorigin != null)
            attrs.push(['crossorigin', crossorigin]);
          const integrity = link.getAttribute('integrity');
          if (integrity != null)
            attrs.push(['integrity', integrity]);
          const referrerpolicy = link.getAttribute('referrerpolicy');
          if (referrerpolicy != null)
            attrs.push(['referrerpolicy', referrerpolicy]);

          seenHrefs.add(href);
          stylesheetLinks.push('<link ' + attrs.map(([name, value]) => name + '="' + escapeAttr(value) + '"').join(' ') + '>');
        });
        document.querySelectorAll('head style').forEach(style => {
          const tag = inlineStyleTag(style as HTMLStyleElement);
          if (tag)
            stylesheetLinks.push(tag);
        });
        for (const sheet of document.styleSheets) {
          if (sheet.href && !seenHrefs.has(sheet.href)) {
            seenHrefs.add(sheet.href);
            stylesheetLinks.push(`<link rel="stylesheet" href="${escapeAttr(sheet.href)}">`);
          }
        }
        // @import URLs from inline <style> tags
        document.querySelectorAll('style').forEach(style => {
          const imports = style.textContent?.match(/@import\s+url\(["']?([^"')]+)["']?\)/g);
          if (imports) {
            for (const imp of imports) {
              const m = imp.match(/@import\s+url\(["']?([^"')]+)["']?\)/);
              if (m?.[1]) {
                const url = abs(m[1]);
                if (!seenHrefs.has(url)) {
                  seenHrefs.add(url);
                  stylesheetLinks.push(`<link rel="stylesheet" href="${escapeAttr(url)}">`);
                }
              }
            }
          }
        });

        // ====== Phase D: Find content container ======

        const CONTAINER_SELS = ['main', '[role="main"]', '#content', '#main-content',
          '.main-content', '.page-content', '.site-content', 'article'];
        let container: Element = document.body;
        for (const sel of CONTAINER_SELS) {
          try {
            const el = document.querySelector(sel);
            if (el && el.innerHTML.length > 1000) { container = el; break; }
          } catch {}
        }

        // ====== Phase E: Collect image URLs + fix to absolute ======

        const imageUrls = new Set<string>();

        container.querySelectorAll('img').forEach(img => {
          if (img.src && !img.src.startsWith('data:')) {
            img.src = abs(img.src);
            imageUrls.add(img.src);
          }
          if (img.srcset) {
            img.srcset = img.srcset.split(',').map(entry => {
              const parts = entry.trim().split(/\s+/);
              parts[0] = abs(parts[0]);
              imageUrls.add(parts[0]);
              return parts.join(' ');
            }).join(', ');
          }
          // If img has srcset but no src, also set src to the best srcset entry
          // so the image works even if browser doesn't parse srcset
          if (!img.src && img.srcset) {
            const best = img.srcset.split(',').pop()?.trim().split(/\s+/)[0];
            if (best) img.src = best;
          }
        });

        container.querySelectorAll('source[srcset]').forEach(src => {
          const source = src as HTMLSourceElement;
          source.srcset = source.srcset.split(',').map(entry => {
            const parts = entry.trim().split(/\s+/);
            parts[0] = abs(parts[0]);
            imageUrls.add(parts[0]);
            return parts.join(' ');
          }).join(', ');
        });

        // Background images
        container.querySelectorAll('*').forEach(el => {
          if (!(el instanceof HTMLElement)) return;
          const bg = getComputedStyle(el).backgroundImage;
          const m = bg?.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
          if (m) imageUrls.add(m[1]);
        });

        // Video posters + autoplay setup
        container.querySelectorAll('video').forEach(video => {
          if (video.src && !video.src.startsWith('data:') && !video.src.startsWith('blob:')) {
            video.src = abs(video.src);
            imageUrls.add(video.src);
          }
          video.querySelectorAll('source').forEach(source => {
            if (source.src && !source.src.startsWith('data:') && !source.src.startsWith('blob:')) {
              source.src = abs(source.src);
              imageUrls.add(source.src);
            }
          });
          if (video.poster) {
            video.poster = abs(video.poster);
            imageUrls.add(video.poster);
          }
          video.setAttribute('autoplay', '');
          video.setAttribute('muted', '');
          video.setAttribute('playsinline', '');
          video.setAttribute('loop', '');
        });

        if (heroUrl) imageUrls.add(heroUrl);

        // ====== Phase F: Clean dangerous attributes only ======
        // Keep original classes/ids/styles but strip event handlers and tracking

        container.querySelectorAll('*').forEach(el => {
          const toRemove: string[] = [];
          for (const attr of el.attributes) {
            const name = attr.name.toLowerCase();
            // Remove event handlers
            if (name.startsWith('on')) { toRemove.push(attr.name); continue; }
            // Remove javascript: URLs
            if (name === 'href' && attr.value.trim().startsWith('javascript:')) {
              toRemove.push(attr.name); continue;
            }
          }
          for (const name of toRemove) {
            el.removeAttribute(name);
          }
        });

        // Count visible elements
        let elementCount = 0;
        container.querySelectorAll('*').forEach(el => {
          if (el instanceof HTMLElement) elementCount++;
        });

        const h1 = container.querySelector('h1');
        const title = h1?.textContent?.trim() || document.title.split('|')[0].trim();

        return {
          html: container.innerHTML,
          stylesheetLinks,
          imageUrls: [...imageUrls],
          heroUrl,
          title,
          elementCount,
        };
      });

      (result as DomCaptureResult).audit = {
        captured_scroll_height: auditSnapshot.scroll_height,
        dom_image_count: auditSnapshot.image_count,
        hydration_status: hydrationReport.status,
        hydration_passes: hydrationReport.passes,
        shells_checked: featureAppReport.checked,
        shells_recovered: featureAppReport.recovered,
        empty_shells: featureAppReport.still_empty,
      };

      const resultWithViewport: DomCaptureResult = {
        ...result,
        viewport: { width: viewportWidth, height: 1080 },
      };

      const normalized = normalizeCapturedLazyMedia(resultWithViewport, sourceUrl);
      if (isCaptureBlockedBySecurityPage({ html: normalized.html, title: normalized.title })) {
        return { bot_blocked: true };
      }

      return normalized;
    } finally {
      await browser.close();
    }
  }

  // ============================================================================
  // Image Download
  // ============================================================================

  private async downloadImages(
    oemId: OemId,
    modelSlug: string,
    imageUrls: string[],
  ): Promise<Map<string, string>> {
    const urlMapping = new Map<string, string>();
    const seenFilenames = new Set<string>();

    const oemHeaders: Record<string, Record<string, string>> = {
      'kia-au': { Origin: 'https://www.kia.com', Referer: 'https://www.kia.com/au/' },
      'kgm-au': { Origin: 'https://kgm.com.au', Referer: 'https://kgm.com.au/' },
      'gwm-au': { Origin: 'https://www.gwmanz.com', Referer: 'https://www.gwmanz.com/' },
      'isuzu-au': { Origin: 'https://www.isuzuute.com.au', Referer: 'https://www.isuzuute.com.au/' },
      'nissan-au': { Origin: 'https://www.nissan.com.au', Referer: 'https://www.nissan.com.au/' },
      'hyundai-au': { Origin: 'https://www.hyundai.com', Referer: 'https://www.hyundai.com/au/en/' },
      'mazda-au': { Origin: 'https://www.mazda.com.au', Referer: 'https://www.mazda.com.au/' },
      'ford-au': { Origin: 'https://www.ford.com.au', Referer: 'https://www.ford.com.au/' },
      'suzuki-au': { Origin: 'https://www.suzuki.com.au', Referer: 'https://www.suzuki.com.au/' },
      'toyota-au': { Origin: 'https://www.toyota.com.au', Referer: 'https://www.toyota.com.au/' },
      'mitsubishi-au': { Origin: 'https://www.mitsubishi-motors.com.au', Referer: 'https://www.mitsubishi-motors.com.au/' },
      'subaru-au': { Origin: 'https://www.subaru.com.au', Referer: 'https://www.subaru.com.au/' },
      'volkswagen-au': { Origin: 'https://www.volkswagen.com.au', Referer: 'https://www.volkswagen.com.au/' },
      'ldv-au': { Origin: 'https://www.ldvautomotive.com.au', Referer: 'https://www.ldvautomotive.com.au/' },
    };

    const uniqueUrls = [...new Set(imageUrls)].filter(url => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    });

    console.log(`[PageCapturer] Downloading ${uniqueUrls.length} images for ${oemId}/${modelSlug}`);

    let failCount = 0;
    const extraHeaders = oemHeaders[oemId] || {};

    const batchSize = 5;
    for (let i = 0; i < uniqueUrls.length; i += batchSize) {
      const batch = uniqueUrls.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (originalUrl, batchIdx) => {
          try {
            const urlObj = new URL(originalUrl);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            // Storyblok CDN URLs end with /m/WIDTHxHEIGHT (resize params).
            // Walk backwards to find the first segment with a file extension.
            let filename = pathParts[pathParts.length - 1] || 'image';
            for (let pi = pathParts.length - 1; pi >= 0; pi--) {
              if (/\.\w{2,5}$/.test(pathParts[pi])) {
                filename = pathParts[pi];
                break;
              }
            }
            filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

            if (seenFilenames.has(filename)) {
              const ext = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';
              const base = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename;
              filename = `${base}_${i}_${batchIdx}${ext}`;
            }
            seenFilenames.add(filename);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT);

            const response = await fetch(originalUrl, {
              headers: {
                'Accept': 'image/webp,image/avif,image/png,image/jpeg,image/*,*/*',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
                ...extraHeaders,
              },
              signal: controller.signal,
            });

            clearTimeout(timeoutId);
            if (!response.ok) { failCount++; return; }

            const contentType = response.headers.get('content-type') || 'image/jpeg';
            if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
              failCount++;
              return;
            }

            const imageData = await response.arrayBuffer();
            if (imageData.byteLength < 500) return;

            const r2Key = `${R2_ASSETS_PREFIX}/${oemId}/${modelSlug}/${filename}`;
            await this.r2Bucket.put(r2Key, imageData, {
              httpMetadata: { contentType },
            });

            const proxyPath = `/media/${r2Key}`;
            urlMapping.set(originalUrl, proxyPath);
          } catch {
            failCount++;
          }
        }),
      );
    }

    console.log(`[PageCapturer] Uploaded ${urlMapping.size}/${uniqueUrls.length} images (${failCount} failed)`);
    return urlMapping;
  }

  // ============================================================================
  // Section Screenshots (Phase 3: Adaptive Pipeline)
  // ============================================================================

  /**
   * Capture element-level screenshots for major page sections.
   * Returns a map of sectionId → R2 key for the stored screenshot.
   */
  async captureSectionScreenshots(
    sourceUrl: string,
    oemId: OemId,
    modelSlug: string,
  ): Promise<Map<string, string>> {
    const screenshots = new Map<string, string>();

    if (isModelPageWriteProtected(oemId)) {
      console.warn(`[PageCapturer] Skipping section screenshots for protected model page writes: ${oemId}/${modelSlug}`);
      return screenshots;
    }

    const puppeteerModule = await import('@cloudflare/puppeteer');
    const puppeteer = puppeteerModule.default;
    const browser = await puppeteer.launch(this.browser as any);

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      );
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      console.log(`[PageCapturer] Capturing section screenshots from ${sourceUrl}`);
      await page.goto(sourceUrl, { waitUntil: 'networkidle2', timeout: 45_000 });
      await new Promise(r => setTimeout(r, 3000));

      // Bot check
      const rawHtml = await page.content();
      if (rawHtml.length < 5000 && (rawHtml.includes('cf-challenge') || rawHtml.includes('Just a moment'))) {
        console.warn('[PageCapturer] Bot blocked during section screenshot capture');
        return screenshots;
      }

      // Hydrate before measuring sections — same helpers as the main capture
      // path with a reduced budget (screenshots tolerate a partial tail).
      await page.evaluate(activateLazyMediaForCapture as any);
      const sectionHydration = await page.evaluate(runPacedHydrationSweepForCapture as any, {
        budgetMs: 20_000,
        stepDelayMs: CAPTURE_HYDRATION_STEP_DELAY_MS,
        mountWaitMs: 2_000,
        stabilityPct: CAPTURE_HYDRATION_STABILITY_PCT,
        maxPasses: 2,
      }) as CaptureHydrationReport;
      console.log(`[PageCapturer] Section screenshot hydration: ${sectionHydration.status}`);

      // Find major sections via common selectors
      const sectionSelectors = [
        'section',
        '[class*="section"]',
        '[class*="hero"]',
        '[class*="gallery"]',
        '[class*="banner"]',
        '[class*="feature"]',
        '[class*="spec"]',
        '[class*="colour"]',
        '[class*="color"]',
        '[class*="tab-"]',
        '[class*="video"]',
        '[class*="cta"]',
      ];

      const selectorString = sectionSelectors.join(', ');

      // Get visible section elements with their bounding rects
      const sectionInfoList = await page.evaluate((sel: string) => {
        const elements = document.querySelectorAll(sel);
        const results: Array<{ index: number; tag: string; className: string; rect: DOMRect }> = [];
        const seen = new Set<Element>();

        elements.forEach((el) => {
          // Skip if contained within an already-captured element
          let parent = el.parentElement;
          while (parent) {
            if (seen.has(parent)) return;
            parent = parent.parentElement;
          }

          const rect = el.getBoundingClientRect();
          // Skip tiny or offscreen elements
          if (rect.width < 300 || rect.height < 100) return;
          if (rect.top + rect.height < 0 || rect.top > document.body.scrollHeight) return;

          seen.add(el);
          results.push({
            index: results.length,
            tag: el.tagName.toLowerCase(),
            className: (el as HTMLElement).className?.toString().substring(0, 100) || '',
            rect: JSON.parse(JSON.stringify(rect)),
          });
        });

        return results;
      }, selectorString);

      // Limit to MAX_SECTION_SCREENSHOTS
      const sections = sectionInfoList.slice(0, MAX_SECTION_SCREENSHOTS);
      console.log(`[PageCapturer] Found ${sectionInfoList.length} sections, capturing ${sections.length}`);

      for (const section of sections) {
        try {
          const sectionId = `section-${section.index}`;
          const clip = {
            x: Math.max(0, section.rect.x),
            y: Math.max(0, section.rect.y),
            width: Math.min(section.rect.width, 1440),
            height: Math.min(section.rect.height, 2000), // Cap height to prevent huge screenshots
          };

          const screenshotBuffer = await page.screenshot({
            type: 'jpeg',
            quality: 75,
            clip,
          });

          const r2Key = `${R2_SCREENSHOTS_PREFIX}/${oemId}/${modelSlug}/${sectionId}.jpg`;
          await this.r2Bucket.put(r2Key, screenshotBuffer, {
            httpMetadata: { contentType: 'image/jpeg' },
            customMetadata: {
              oem_id: oemId,
              model_slug: modelSlug,
              section_index: String(section.index),
              section_class: section.className,
            },
          });

          screenshots.set(sectionId, r2Key);
        } catch (err) {
          console.warn(`[PageCapturer] Failed to screenshot section ${section.index}:`, err);
        }
      }

      console.log(`[PageCapturer] Captured ${screenshots.size} section screenshots`);
    } finally {
      await browser.close();
    }

    return screenshots;
  }
}
