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
  screenshotKey: string;
  diffScreenshotKey: string;
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
const DISABLE_MOTION_CSS = '*,*::before,*::after{animation-delay:0s!important;animation-duration:0s!important;scroll-behavior:auto!important;transition-delay:0s!important;transition-duration:0s!important}';

export function classifyVisualMismatch(mismatchPercent: number): VisualMismatchClassification {
  if (mismatchPercent > 0.35) return 'blocking';
  if (mismatchPercent >= 0.20) return 'warning';
  return 'pass';
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

function syntheticViewports(candidate: ComposedPublicationCandidate, prefix: string): PublicationViewportValidation[] {
  const interactions = candidate.regions
    .filter(region => region.interactionKind !== 'none')
    .map(region => ({
      regionId: region.regionId,
      kind: region.interactionKind,
      passed: false,
      detail: 'Browser validation did not run',
    }));
  return VIEWPORTS.map(({ name }) => {
    const keys = evidenceKeys(prefix, name);
    return {
      name,
      mismatchPercent: 1,
      horizontalOverflowPx: 0,
      bodyHeight: 0,
      consoleErrors: [],
      failedRequests: [],
      interactions,
      screenshotKey: keys.candidate,
      diffScreenshotKey: keys.diff,
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

async function waitForFontsAndImages(page: any): Promise<void> {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(image => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>(resolve => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }));
  });
}

async function auditPage(page: any): Promise<{ horizontalOverflowPx: number; bodyHeight: number; brokenMedia: string[] }> {
  return page.evaluate(() => {
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
    return {
      horizontalOverflowPx: Math.max(0, scrollWidth - window.innerWidth),
      bodyHeight,
      brokenMedia,
    };
  });
}

async function exerciseInteractions(
  page: any,
  regions: Array<{ regionId: string; interactionKind: PublicationInteractionKind }>,
): Promise<PublicationInteractionResult[]> {
  return page.evaluate(async (declaredRegions: Array<{ regionId: string; interactionKind: PublicationInteractionKind }>) => {
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
        results.push({ regionId: declared.regionId, kind: declared.interactionKind, passed: before !== after && after !== null, detail: `aria-expanded changed from ${before} to ${after}` });
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
        results.push({ regionId: declared.regionId, kind: declared.interactionKind, passed: before !== after, detail: `tab state changed from ${before} to ${after}` });
        continue;
      }
      const trigger = firstEnabled(region, '[data-carousel-next],[data-clone-action="next"],[aria-label*="next" i],button,[role="button"]');
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
  }, regions);
}

async function compareScreenshots(page: any, source: Uint8Array, candidate: Uint8Array): Promise<{ mismatchPercent: number; diffBytes: Uint8Array }> {
  const result = await page.evaluate(async ({ sourceUrl, candidateUrl, threshold }: { sourceUrl: string; candidateUrl: string; threshold: number }) => {
    const loadImage = async (url: string): Promise<HTMLImageElement> => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };
    const [sourceImage, candidateImage] = await Promise.all([loadImage(sourceUrl), loadImage(candidateUrl)]);
    const width = Math.min(sourceImage.naturalWidth, candidateImage.naturalWidth);
    const height = Math.min(sourceImage.naturalHeight, candidateImage.naturalHeight);
    const draw = (image: HTMLImageElement): ImageData => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D canvas context is unavailable');
      context.drawImage(image, 0, 0, width, height);
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
      diffDataUrl: diffCanvas.toDataURL('image/png'),
    };
  }, {
    sourceUrl: pngDataUrl(source),
    candidateUrl: pngDataUrl(candidate),
    threshold: PIXEL_CHANNEL_THRESHOLD,
  });
  return { mismatchPercent: result.mismatchPercent, diffBytes: dataUrlBytes(result.diffDataUrl) };
}

async function captureDocument(browser: any, html: string, viewport: { width: number; height: number }) {
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message: any) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request: any) => {
    failedRequests.push(`${request.url()} ${request.failure()?.errorText || 'request failed'}`);
  });
  await page.setViewport(viewport);
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.addStyleTag({ content: DISABLE_MOTION_CSS });
  await waitForFontsAndImages(page);
  return { page, consoleErrors, failedRequests };
}

export async function validateInBrowser(
  candidate: ComposedPublicationCandidate,
  options: BrowserValidationOptions = {},
): Promise<BrowserPublicationValidation> {
  const prefix = options.evidencePrefix || `model-pages/publication/candidates/${candidate.sha256}/evidence`;
  if (!options.browser) {
    return {
      viewports: syntheticViewports(candidate, prefix),
      blocking: [{ code: 'browser-unavailable', message: 'Browser binding is required for publication validation' }],
      warnings: [],
    };
  }

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
          sourceCapture.page.screenshot({ fullPage: true, type: 'png' }).then(asBytes),
          candidateCapture.page.screenshot({ fullPage: true, type: 'png' }).then(asBytes),
        ]);
        const audit = await auditPage(candidateCapture.page);
        const interactionResults = await exerciseInteractions(candidateCapture.page, declaredInteractions);
        comparisonPage = await browser.newPage();
        const comparison = await compareScreenshots(comparisonPage, sourceBytes, candidateBytes);
        const keys = evidenceKeys(prefix, viewport.name);
        if (options.writeEvidence) {
          await options.writeEvidence({ key: keys.source, bytes: sourceBytes, contentType: 'image/png' });
          await options.writeEvidence({ key: keys.candidate, bytes: candidateBytes, contentType: 'image/png' });
          await options.writeEvidence({ key: keys.diff, bytes: comparison.diffBytes, contentType: 'image/png' });
        }
        const consoleErrors = sortedUnique([...sourceCapture.consoleErrors, ...candidateCapture.consoleErrors]);
        const failedRequests = sortedUnique([...sourceCapture.failedRequests, ...candidateCapture.failedRequests, ...audit.brokenMedia]);
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
        };
        viewports.push(result);

        const classification = classifyVisualMismatch(result.mismatchPercent);
        if (classification === 'blocking') blocking.push({ code: 'visual-mismatch', viewport: viewport.name, message: `Visual mismatch ${(result.mismatchPercent * 100).toFixed(2)}% exceeds 35%` });
        if (classification === 'warning') warnings.push({ code: 'visual-mismatch', viewport: viewport.name, message: `Visual mismatch ${(result.mismatchPercent * 100).toFixed(2)}% is at least 20%` });
        if (result.horizontalOverflowPx > 0) blocking.push({ code: 'horizontal-overflow', viewport: viewport.name, message: `Page overflows horizontally by ${result.horizontalOverflowPx}px` });
        if (!Number.isFinite(result.bodyHeight) || result.bodyHeight <= 0) blocking.push({ code: 'invalid-body-height', viewport: viewport.name, message: 'Page body height is not a positive finite number' });
        if (result.failedRequests.length) blocking.push({ code: 'media-request-failed', viewport: viewport.name, message: `${result.failedRequests.length} media or network request(s) failed` });
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
      viewports: syntheticViewports(candidate, prefix),
      blocking: [{ code: 'browser-validation-failed', message: `Browser validation failed: ${message}` }],
      warnings: [],
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
