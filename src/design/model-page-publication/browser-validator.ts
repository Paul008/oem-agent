import type { ComposedPublicationCandidate, PublicationInteractionKind } from './composer';

export type PublicationViewportName = 'desktop' | 'tablet' | 'mobile';
export type VisualMismatchClassification = 'pass' | 'warning' | 'blocking';

export interface PublicationFinding {
  code: string;
  message: string;
  viewport?: PublicationViewportName;
  regionId?: string;
}

export interface PublicationInteractionResult {
  regionId: string;
  kind: string;
  passed: boolean;
  detail: string;
}

export interface PublicationViewportValidation {
  name: PublicationViewportName;
  mismatchPercent: number;
  horizontalOverflowPx: number;
  bodyHeight: number;
  consoleErrors: string[];
  failedRequests: string[];
  interactions: PublicationInteractionResult[];
  screenshotKey?: string;
  diffScreenshotKey?: string;
  sourceSize?: { width: number; height: number };
  candidateSize?: { width: number; height: number };
  dimensionMismatchPercent?: number;
  dimensionClassification?: VisualMismatchClassification;
  evidence?: {
    source: PublicationEvidenceRecord;
    candidate: PublicationEvidenceRecord;
    diff: PublicationEvidenceRecord;
  };
}

export interface PublicationEvidenceRecord {
  key: string;
  byteLength: number;
  sha256: string;
}

export interface PublicationEvidenceArtifact {
  key: string;
  bytes: Uint8Array;
  contentType: 'image/png';
}

export interface BrowserValidationOptions {
  browser?: Fetcher;
  /** A revision-scoped prefix supplied by the persistence orchestrator. */
  evidencePrefix?: string;
  /** Optional persistence boundary; validation itself remains storage-agnostic. */
  writeEvidence?: (artifact: PublicationEvidenceArtifact) => Promise<void>;
}

export interface BrowserPublicationValidation {
  viewports: PublicationViewportValidation[];
  blocking: PublicationFinding[];
  warnings: PublicationFinding[];
}

const VIEWPORTS = [
  { name: 'desktop' as const, width: 1440, height: 1100 },
  { name: 'tablet' as const, width: 1024, height: 900 },
  { name: 'mobile' as const, width: 390, height: 844 },
];

const PIXEL_CHANNEL_THRESHOLD = 0.1;
const DIMENSION_MISMATCH_BLOCKING_THRESHOLD = 0.01;
const RESOURCE_TIMEOUT_MS = 5_000;
const RENDER_CRITICAL_RESOURCE_TYPES = new Set(['stylesheet', 'font', 'image', 'media']);
const REVISION_EVIDENCE_PREFIX = /^model-pages\/[^/]+\/publication\/revisions\/[1-9]\d*\/evidence\/?$/;
const DISABLE_MOTION_CSS = '*,*::before,*::after{animation-delay:0s!important;animation-duration:0s!important;scroll-behavior:auto!important;transition-delay:0s!important;transition-duration:0s!important}';
export const PUBLICATION_SCREENSHOT_OPTIONS = { fullPage: false, type: 'png' as const };

export function classifyVisualMismatch(mismatchPercent: number): VisualMismatchClassification {
  if (mismatchPercent > 0.03) return 'blocking';
  if (mismatchPercent > 0.01) return 'warning';
  return 'pass';
}

export function classifyDimensionMismatch(
  source: { width: number; height: number },
  candidate: { width: number; height: number },
): { mismatchPercent: number; classification: VisualMismatchClassification } {
  const widthMismatch = Math.abs(source.width - candidate.width) / Math.max(source.width, candidate.width, 1);
  const heightMismatch = Math.abs(source.height - candidate.height) / Math.max(source.height, candidate.height, 1);
  const mismatchPercent = Math.max(widthMismatch, heightMismatch);
  return {
    mismatchPercent,
    classification: mismatchPercent > DIMENSION_MISMATCH_BLOCKING_THRESHOLD
      ? 'blocking'
      : mismatchPercent > 0 ? 'warning' : 'pass',
  };
}

/** The same max-channel delta comparison used by scripts/oem-fidelity-report.mjs. */
export function compareRgbaChannels(
  source: Uint8ClampedArray,
  candidate: Uint8ClampedArray,
  threshold = PIXEL_CHANNEL_THRESHOLD,
): { comparedPixels: number; diffPixels: number; mismatchPercent: number } {
  const byteLength = Math.min(source.length, candidate.length) - (Math.min(source.length, candidate.length) % 4);
  const comparedPixels = byteLength / 4;
  const limit = Math.round(threshold * 255);
  let diffPixels = 0;
  for (let index = 0; index < byteLength; index += 4) {
    const delta = Math.max(
      Math.abs(source[index] - candidate[index]),
      Math.abs(source[index + 1] - candidate[index + 1]),
      Math.abs(source[index + 2] - candidate[index + 2]),
      Math.abs(source[index + 3] - candidate[index + 3]),
    );
    if (delta > limit) diffPixels += 1;
  }
  return { comparedPixels, diffPixels, mismatchPercent: comparedPixels ? diffPixels / comparedPixels : 1 };
}

function evidenceKeys(prefix: string, viewport: PublicationViewportName) {
  const root = `${prefix.replace(/\/+$/, '')}/${viewport}`;
  return {
    source: `${root}/source.png`,
    candidate: `${root}/candidate.png`,
    diff: `${root}/diff.png`,
  };
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

function failureKey(value: string): string {
  const firstToken = value.split(/\s/, 1)[0];
  return /^https?:\/\//i.test(firstToken) ? canonicalUrl(firstToken) : value;
}

function deduplicateFailures(values: string[]): string[] {
  const failures = new Map<string, string>();
  for (const value of values) {
    const key = failureKey(value);
    const current = failures.get(key);
    if (!current || value.length > current.length) failures.set(key, value);
  }
  return [...failures.values()].sort();
}

function browserResourceType(request: any): string {
  try {
    return String(request?.resourceType?.() || '').toLowerCase();
  } catch {
    return '';
  }
}

function isRenderCriticalResource(request: any): boolean {
  return RENDER_CRITICAL_RESOURCE_TYPES.has(browserResourceType(request));
}

function isExpectedMediaCancellation(request: any): boolean {
  if (browserResourceType(request) !== 'media') return false;
  try {
    return String(request?.failure?.()?.errorText || '').toUpperCase() === 'NET::ERR_ABORTED';
  } catch {
    return false;
  }
}

function syntheticViewports(candidate: ComposedPublicationCandidate): PublicationViewportValidation[] {
  const interactions = candidate.regions
    .filter(region => region.interactionKind !== 'none')
    .map(region => ({
      regionId: region.regionId,
      kind: region.interactionKind,
      passed: false,
      detail: 'Browser validation did not run',
    }));
  return VIEWPORTS.map(({ name }) => {
    return {
      name,
      mismatchPercent: 1,
      horizontalOverflowPx: 0,
      bodyHeight: 0,
      consoleErrors: [],
      failedRequests: [],
      interactions,
    };
  });
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error('Browser screenshot did not return PNG bytes');
}

function pngDataUrl(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

function dataUrlBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/^data:image\/png;base64,/, ''));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', owned.buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function evidenceRecord(key: string, bytes: Uint8Array): Promise<PublicationEvidenceRecord> {
  return { key, byteLength: bytes.byteLength, sha256: await sha256Hex(bytes) };
}

export async function waitForPublicationResources(
  options: { timeoutMs: number },
): Promise<{ timedOut: boolean; stalledResources: string[] }> {
  const pending = new Set<string>();
  const waits: Promise<void>[] = [];
  for (const image of Array.from(document.images)) {
    if (image.complete) continue;
    const label = image.currentSrc || image.src || 'image';
    pending.add(label);
    waits.push(new Promise<void>(resolve => {
      const settle = () => { pending.delete(label); resolve(); };
      image.addEventListener('load', settle, { once: true });
      image.addEventListener('error', settle, { once: true });
    }));
  }
  if (document.fonts?.ready) {
    const label = 'document.fonts';
    pending.add(label);
    waits.push(Promise.resolve(document.fonts.ready).then(() => { pending.delete(label); }));
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = await Promise.race([
    Promise.all(waits).then(() => false),
    new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(true), options.timeoutMs); }),
  ]);
  if (timer) clearTimeout(timer);
  return { timedOut, stalledResources: [...pending] };
}

/**
 * Autoplay video is inherently timing-dependent in screenshot comparisons. Freeze each video on
 * its poster and explicitly decode that poster so source and candidate captures start from the same
 * stable visual frame. Removing media sources also avoids downloading multi-megabyte video during
 * a publication gate that only compares a fixed viewport screenshot.
 */
export async function stabilizePublicationMedia(): Promise<{ posterFailures: string[] }> {
  const posterUrls = new Set<string>();
  for (const media of Array.from(document.querySelectorAll('video,audio'))) {
    if (!(media instanceof HTMLMediaElement)) continue;
    media.pause();
    media.autoplay = false;
    media.preload = 'none';
    media.removeAttribute('src');
    for (const source of Array.from(media.querySelectorAll('source'))) source.removeAttribute('src');
    if (media instanceof HTMLVideoElement && media.poster) posterUrls.add(media.poster);
    media.load();
  }
  const posterFailures: string[] = [];
  await Promise.all([...posterUrls].map(async (url) => {
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
    } catch {
      posterFailures.push(url);
    }
  }));
  return { posterFailures: posterFailures.sort() };
}

export function auditPublicationPage(): { horizontalOverflowPx: number; bodyHeight: number; brokenMedia: string[] } {
    const root = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(root?.scrollWidth || 0, body?.scrollWidth || 0);
    const bodyHeight = Math.max(root?.scrollHeight || 0, body?.scrollHeight || 0);
    const brokenMedia = Array.from(document.querySelectorAll('img,video,audio,source'))
      .filter(element => {
        if (element instanceof HTMLImageElement) return element.complete && element.naturalWidth === 0;
        if (element instanceof HTMLMediaElement) return element.error !== null;
        return false;
      })
      .map(element => element.getAttribute('src') || element.getAttribute('srcset') || element.tagName.toLowerCase());
    const documentClipsOverflow = [root, body].some(element => {
      if (!element) return false;
      const overflowX = getComputedStyle(element).overflowX;
      return overflowX === 'hidden' || overflowX === 'clip';
    });
    return {
      // Wide carousel tracks legitimately extend beyond the viewport inside clipped containers.
      // Count only user-scrollable page overflow, not content the document explicitly clips.
      horizontalOverflowPx: documentClipsOverflow ? 0 : Math.max(0, scrollWidth - window.innerWidth),
      bodyHeight,
      brokenMedia,
    };
}

async function auditPage(page: any): Promise<{ horizontalOverflowPx: number; bodyHeight: number; brokenMedia: string[] }> {
  return page.evaluate(auditPublicationPage);
}

export async function evaluatePublicationInteractions(
  declaredRegions: Array<{ regionId: string; interactionKind: PublicationInteractionKind }>,
): Promise<PublicationInteractionResult[]> {
    const visible = (element: Element | null): boolean => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const enabled = (element: Element): boolean => {
      const control = element as HTMLButtonElement;
      return !control.disabled && element.getAttribute('aria-disabled') !== 'true';
    };
    const findRegion = (regionId: string): Element | undefined => Array.from(document.querySelectorAll('[data-oem-region-id]'))
      .find(element => element.getAttribute('data-oem-region-id') === regionId);
    const firstEnabled = (region: Element, selectors: string): HTMLElement | undefined => Array.from(region.querySelectorAll(selectors))
      .find(enabled) as HTMLElement | undefined;
    const carouselState = (region: Element): string => {
      const indexed = region.matches('[data-clone-carousel-index]') ? region : region.querySelector('[data-clone-carousel-index]');
      const index = indexed?.getAttribute('data-clone-carousel-index') || '';
      const track = region.querySelector('[data-clone-carousel-track],[data-carousel-track],[style*="transform"]');
      return `${index}|${track instanceof Element ? getComputedStyle(track).transform : ''}`;
    };
    const results: PublicationInteractionResult[] = [];
    for (const declared of declaredRegions) {
      const region = findRegion(declared.regionId);
      if (!region) {
        results.push({ regionId: declared.regionId, kind: declared.interactionKind, passed: false, detail: 'Declared region was not found' });
        continue;
      }
      if (declared.interactionKind === 'accordion' || declared.interactionKind === 'modal') {
        const trigger = firstEnabled(region, '[aria-expanded],button,[role="button"]');
        if (!trigger) {
          results.push({ regionId: declared.regionId, kind: declared.interactionKind, passed: false, detail: 'No enabled trigger was found' });
          continue;
        }
        const before = trigger.getAttribute('aria-expanded');
        trigger.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        const after = trigger.getAttribute('aria-expanded');
        const passed = (before === 'true' || before === 'false')
          && (after === 'true' || after === 'false')
          && before !== after;
        results.push({ regionId: declared.regionId, kind: declared.interactionKind, passed, detail: `aria-expanded changed from ${before} to ${after}` });
        continue;
      }
      if (declared.interactionKind === 'tabs') {
        const tabCandidates = Array.from(region.querySelectorAll('[role="tab"],[aria-selected]')).filter(enabled) as HTMLElement[];
        const trigger = tabCandidates.find(tab => tab.getAttribute('aria-selected') !== 'true') || tabCandidates[0];
        if (!trigger) {
          results.push({ regionId: declared.regionId, kind: declared.interactionKind, passed: false, detail: 'No enabled tab trigger was found' });
          continue;
        }
        const panelId = trigger.getAttribute('aria-controls');
        const panel = panelId ? document.getElementById(panelId) : null;
        const before = `${trigger.getAttribute('aria-selected')}|${visible(panel)}`;
        trigger.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        const after = `${trigger.getAttribute('aria-selected')}|${visible(panel)}`;
        const passed = before !== after && trigger.getAttribute('aria-selected') === 'true' && visible(panel);
        results.push({ regionId: declared.regionId, kind: declared.interactionKind, passed, detail: `tab state changed from ${before} to ${after}` });
        continue;
      }
      const trigger = firstEnabled(region, '[data-carousel-next],[data-clone-action="next"],[aria-label*="next" i],[x-on\\:click*="next"],[\\@click*="next"]');
      if (!trigger) {
        results.push({ regionId: declared.regionId, kind: declared.interactionKind, passed: false, detail: 'No enabled slide trigger was found' });
        continue;
      }
      const before = carouselState(region);
      trigger.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const after = carouselState(region);
      results.push({ regionId: declared.regionId, kind: declared.interactionKind, passed: before !== after, detail: `slide state changed from ${before} to ${after}` });
    }
    return results;
}

async function exerciseInteractions(
  page: any,
  regions: Array<{ regionId: string; interactionKind: PublicationInteractionKind }>,
): Promise<PublicationInteractionResult[]> {
  return page.evaluate(evaluatePublicationInteractions, regions);
}

export async function compareScreenshotsInPage(
  { sourceUrl, candidateUrl, threshold }: { sourceUrl: string; candidateUrl: string; threshold: number },
): Promise<{
  mismatchPercent: number;
  sourceSize: { width: number; height: number };
  candidateSize: { width: number; height: number };
  diffDataUrl: string;
}> {
    const loadImage = async (url: string): Promise<HTMLImageElement> => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };
    const [sourceImage, candidateImage] = await Promise.all([loadImage(sourceUrl), loadImage(candidateUrl)]);
    const width = Math.max(sourceImage.naturalWidth, candidateImage.naturalWidth);
    const height = Math.max(sourceImage.naturalHeight, candidateImage.naturalHeight);
    const draw = (image: HTMLImageElement): ImageData => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D canvas context is unavailable');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, width, height);
    };
    const sourceData = draw(sourceImage);
    const candidateData = draw(candidateImage);
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = width;
    diffCanvas.height = height;
    const diffContext = diffCanvas.getContext('2d');
    if (!diffContext) throw new Error('2D canvas context is unavailable');
    const diff = diffContext.createImageData(width, height);
    const limit = Math.round(threshold * 255);
    let diffPixels = 0;
    for (let index = 0; index < sourceData.data.length; index += 4) {
      const delta = Math.max(
        Math.abs(sourceData.data[index] - candidateData.data[index]),
        Math.abs(sourceData.data[index + 1] - candidateData.data[index + 1]),
        Math.abs(sourceData.data[index + 2] - candidateData.data[index + 2]),
        Math.abs(sourceData.data[index + 3] - candidateData.data[index + 3]),
      );
      if (delta > limit) {
        diffPixels += 1;
        diff.data.set([255, 32, 32, 220], index);
      } else {
        const gray = Math.round((sourceData.data[index] + sourceData.data[index + 1] + sourceData.data[index + 2]) / 3);
        diff.data.set([gray, gray, gray, 80], index);
      }
    }
    diffContext.putImageData(diff, 0, 0);
    return {
      mismatchPercent: width && height ? diffPixels / (width * height) : 1,
      sourceSize: { width: sourceImage.naturalWidth, height: sourceImage.naturalHeight },
      candidateSize: { width: candidateImage.naturalWidth, height: candidateImage.naturalHeight },
      diffDataUrl: diffCanvas.toDataURL('image/png'),
    };
}

async function compareScreenshots(page: any, source: Uint8Array, candidate: Uint8Array): Promise<{
  mismatchPercent: number;
  sourceSize: { width: number; height: number };
  candidateSize: { width: number; height: number };
  diffBytes: Uint8Array;
}> {
  const result = await page.evaluate(compareScreenshotsInPage, {
    sourceUrl: pngDataUrl(source),
    candidateUrl: pngDataUrl(candidate),
    threshold: PIXEL_CHANNEL_THRESHOLD,
  });
  return {
    mismatchPercent: result.mismatchPercent,
    sourceSize: result.sourceSize,
    candidateSize: result.candidateSize,
    diffBytes: dataUrlBytes(result.diffDataUrl),
  };
}

async function captureDocument(browser: any, html: string, viewport: { width: number; height: number }) {
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedAssets = new Map<string, { message: string; priority: number }>();
  const recordAssetFailure = (urlValue: string, message: string, priority: number) => {
    const url = canonicalUrl(urlValue);
    const current = failedAssets.get(url);
    if (!current || priority > current.priority) failedAssets.set(url, { message: `${url} ${message}`, priority });
  };
  page.on('console', (message: any) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request: any) => {
    if (!isRenderCriticalResource(request)) return;
    if (isExpectedMediaCancellation(request)) return;
    recordAssetFailure(request.url(), `${request.failure()?.errorText || 'request failed'} (${browserResourceType(request)})`, 1);
  });
  page.on('response', (response: any) => {
    const status = Number(response.status());
    const request = response.request();
    if (status < 400 || !isRenderCriticalResource(request)) return;
    const statusText = String(response.statusText?.() || '').trim();
    recordAssetFailure(response.url(), `${status}${statusText ? ` ${statusText}` : ''} (${browserResourceType(request)})`, 2);
  });
  await page.setViewport(viewport);
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const media = await page.evaluate(stabilizePublicationMedia);
  for (const poster of media.posterFailures) recordAssetFailure(poster, 'poster decode failed (image)', 1);
  await page.addStyleTag({ content: DISABLE_MOTION_CSS });
  try {
    await page.waitForNetworkIdle({ idleTime: 100, timeout: RESOURCE_TIMEOUT_MS });
  } catch (error) {
    failedRequests.push(`network-settle ${error instanceof Error ? error.message : String(error)}`);
  }
  const readiness = await page.evaluate(waitForPublicationResources, { timeoutMs: RESOURCE_TIMEOUT_MS });
  if (readiness.timedOut) failedRequests.push(`resource-readiness ${readiness.stalledResources.join(',') || 'timeout'}`);
  return { page, consoleErrors, failedRequests: [...failedAssets.values()].map(item => item.message).concat(failedRequests) };
}

export async function validateInBrowser(
  candidate: ComposedPublicationCandidate,
  options: BrowserValidationOptions = {},
): Promise<BrowserPublicationValidation> {
  if (!options.browser) {
    return {
      viewports: syntheticViewports(candidate),
      blocking: [{ code: 'browser-unavailable', message: 'Browser binding is required for publication validation' }],
      warnings: [],
    };
  }
  if (!options.evidencePrefix || !REVISION_EVIDENCE_PREFIX.test(options.evidencePrefix) || !options.writeEvidence) {
    return {
      viewports: [],
      blocking: [{ code: 'evidence-required', message: 'Browser validation requires a revision-scoped evidence prefix and writer' }],
      warnings: [],
    };
  }
  const prefix = options.evidencePrefix;
  const writeEvidence = options.writeEvidence;

  let browser: any;
  try {
    const puppeteerModule = await import('@cloudflare/puppeteer');
    browser = await puppeteerModule.default.launch(options.browser as any);
    const viewports: PublicationViewportValidation[] = [];
    const blocking: PublicationFinding[] = [];
    const warnings: PublicationFinding[] = [];
    const declaredInteractions = candidate.regions
      .filter(region => region.interactionKind !== 'none')
      .map(region => ({ regionId: region.regionId, interactionKind: region.interactionKind }));

    for (const viewport of VIEWPORTS) {
      const sourceCapture = await captureDocument(browser, candidate.referenceBody, viewport);
      const candidateCapture = await captureDocument(browser, candidate.body, viewport);
      let comparisonPage: any;
      try {
        const [sourceBytes, candidateBytes] = await Promise.all([
          sourceCapture.page.screenshot(PUBLICATION_SCREENSHOT_OPTIONS).then(asBytes),
          candidateCapture.page.screenshot(PUBLICATION_SCREENSHOT_OPTIONS).then(asBytes),
        ]);
        const audit = await auditPage(candidateCapture.page);
        const interactionResults = await exerciseInteractions(candidateCapture.page, declaredInteractions);
        comparisonPage = await browser.newPage();
        const comparison = await compareScreenshots(comparisonPage, sourceBytes, candidateBytes);
        const keys = evidenceKeys(prefix, viewport.name);
        const [sourceEvidence, candidateEvidence, diffEvidence] = await Promise.all([
          evidenceRecord(keys.source, sourceBytes),
          evidenceRecord(keys.candidate, candidateBytes),
          evidenceRecord(keys.diff, comparison.diffBytes),
        ]);
        await writeEvidence({ key: keys.source, bytes: sourceBytes, contentType: 'image/png' });
        await writeEvidence({ key: keys.candidate, bytes: candidateBytes, contentType: 'image/png' });
        await writeEvidence({ key: keys.diff, bytes: comparison.diffBytes, contentType: 'image/png' });
        const consoleErrors = sortedUnique([...sourceCapture.consoleErrors, ...candidateCapture.consoleErrors]);
        const failedRequests = deduplicateFailures([...sourceCapture.failedRequests, ...candidateCapture.failedRequests, ...audit.brokenMedia]);
        const dimension = classifyDimensionMismatch(comparison.sourceSize, comparison.candidateSize);
        const result: PublicationViewportValidation = {
          name: viewport.name,
          mismatchPercent: comparison.mismatchPercent,
          horizontalOverflowPx: audit.horizontalOverflowPx,
          bodyHeight: audit.bodyHeight,
          consoleErrors,
          failedRequests,
          interactions: interactionResults,
          screenshotKey: keys.candidate,
          diffScreenshotKey: keys.diff,
          sourceSize: comparison.sourceSize,
          candidateSize: comparison.candidateSize,
          dimensionMismatchPercent: dimension.mismatchPercent,
          dimensionClassification: dimension.classification,
          evidence: { source: sourceEvidence, candidate: candidateEvidence, diff: diffEvidence },
        };
        viewports.push(result);

        const classification = classifyVisualMismatch(result.mismatchPercent);
        if (classification === 'blocking') blocking.push({ code: 'visual-mismatch', viewport: viewport.name, message: `Visual mismatch ${(result.mismatchPercent * 100).toFixed(2)}% exceeds the 3% publication limit` });
        if (classification === 'warning') warnings.push({ code: 'visual-mismatch', viewport: viewport.name, message: `Visual mismatch ${(result.mismatchPercent * 100).toFixed(2)}% exceeds the 1% pixel-stable target` });
        if (dimension.classification !== 'pass') {
          const finding = { code: 'screenshot-dimension-mismatch', viewport: viewport.name, message: `Screenshot dimensions differ by ${(dimension.mismatchPercent * 100).toFixed(2)}%: source ${comparison.sourceSize.width}x${comparison.sourceSize.height}, candidate ${comparison.candidateSize.width}x${comparison.candidateSize.height}` };
          if (dimension.classification === 'blocking') blocking.push(finding);
          else warnings.push(finding);
        }
        if (result.horizontalOverflowPx > 0) blocking.push({ code: 'horizontal-overflow', viewport: viewport.name, message: `Page overflows horizontally by ${result.horizontalOverflowPx}px` });
        if (!Number.isFinite(result.bodyHeight) || result.bodyHeight <= 0) blocking.push({ code: 'invalid-body-height', viewport: viewport.name, message: 'Page body height is not a positive finite number' });
        const readinessFailures = result.failedRequests.filter(item => /^(?:network-settle|resource-readiness) /.test(item));
        const mediaFailures = result.failedRequests.filter(item => !/^(?:network-settle|resource-readiness) /.test(item));
        if (readinessFailures.length) blocking.push({ code: 'resource-readiness-failed', viewport: viewport.name, message: `${readinessFailures.length} resource readiness check(s) failed` });
        if (mediaFailures.length) blocking.push({ code: 'media-request-failed', viewport: viewport.name, message: `${mediaFailures.length} media or network request(s) failed` });
        if (result.consoleErrors.length) blocking.push({ code: 'console-error', viewport: viewport.name, message: `${result.consoleErrors.length} browser console error(s) occurred` });
        for (const interaction of result.interactions.filter(item => !item.passed)) {
          blocking.push({ code: 'interaction-failed', viewport: viewport.name, regionId: interaction.regionId, message: `${interaction.kind} interaction failed: ${interaction.detail}` });
        }
      } finally {
        await Promise.all([
          sourceCapture.page.close().catch(() => {}),
          candidateCapture.page.close().catch(() => {}),
          comparisonPage?.close().catch(() => {}),
        ]);
      }
    }
    return { viewports, blocking, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      viewports: syntheticViewports(candidate),
      blocking: [{ code: 'browser-validation-failed', message: `Browser validation failed: ${message}` }],
      warnings: [],
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
