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
  error?: string;
}

export type CaptureBackend = 'cloudflare-browser' | 'scrapling-stealth';

export interface ExternalHtmlCaptureInput {
  html: string;
  title?: string;
  finalUrl?: string;
  stylesheetUrls?: string[];
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
}

type StoredVehicleModelPage = VehicleModelPage & ModeAwarePage;

const R2_PREFIX = 'pages/definitions';
const R2_ASSETS_PREFIX = 'pages/assets';
const R2_SCREENSHOTS_PREFIX = 'screenshots';
const MAX_IMAGE_DOWNLOADS = 50;
const MAX_SECTION_SCREENSHOTS = 15;
const IMAGE_DOWNLOAD_TIMEOUT = 8_000;

export function isCaptureBlockedBySecurityPage(input: { html: string; title?: string }): boolean {
  const haystack = `${input.title ?? ''}\n${input.html}`
    .replace(/\s+/g, ' ')
    .toLowerCase();

  if (!haystack.trim())
    return false;

  const highConfidenceSignals = [
    'performing security verification',
    'security service to protect against malicious bots',
    'this page is displayed while the website verifies you are not a bot',
    'checking if the site connection is secure',
    'verify you are human',
    'cf-challenge',
    'cf-turnstile',
    'cloudflare turnstile',
    'challenge-platform',
  ];

  if (highConfidenceSignals.some(signal => haystack.includes(signal)))
    return true;

  const hasCloudflareContext = haystack.includes('cloudflare') || haystack.includes('cf-ray');
  const hasChallengeCopy = haystack.includes('just a moment')
    || haystack.includes('attention required')
    || haystack.includes('please stand by')
    || haystack.includes('browser check');

  return hasCloudflareContext && hasChallengeCopy;
}

function extractStylesheetHref(linkTag: string): string | null {
  const match = linkTag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);

  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function absolutizeCaptureUrl(url: string, sourceUrl: string): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('http') || trimmed.startsWith('data:') || trimmed.startsWith('blob:'))
    return trimmed;
  if (trimmed.startsWith('//'))
    return `https:${trimmed}`;

  try {
    return new URL(trimmed, sourceUrl).href;
  } catch {
    return trimmed;
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
      if (parts[0] && !parts[0].startsWith('data:') && !parts[0].startsWith('blob:'))
        imageUrls.add(parts[0]);

      return parts.join(' ');
    })
    .filter(Boolean)
    .join(', ');
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

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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
  if (!absoluteHref || !absoluteHref.startsWith('http'))
    return null;

  return `<link rel="stylesheet" href="${escapeHtmlAttribute(absoluteHref)}">`;
}

function collectSrcsetUrls(srcset: string, sourceUrl: string, imageUrls: Set<string>): string {
  return normalizeCaptureSrcset(srcset, sourceUrl, imageUrls);
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
    const imgSrc = (img.attr('src') || img.attr('data-src') || '').trim();
    if (imgSrc)
      return absolutizeCaptureUrl(imgSrc, sourceUrl);

    const imgSrcset = (img.attr('srcset') || img.attr('data-srcset') || '').trim();
    if (imgSrcset) {
      const best = bestCaptureSrcsetUrl(collectSrcsetUrls(imgSrcset, sourceUrl, new Set()));
      if (best)
        return best;
    }
  }

  if (tagName === 'img') {
    const src = (el.attr('src') || el.attr('data-src') || '').trim();
    if (src)
      return absolutizeCaptureUrl(src, sourceUrl);

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
    '[class*="nav-"]',
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

  const stylesheetLinks = new Map<string, string>();
  for (const url of input.stylesheetUrls ?? []) {
    const tag = stylesheetLinkTag(url, sourceUrl);
    const href = tag ? extractStylesheetHref(tag) : null;
    if (tag && href)
      stylesheetLinks.set(href, tag);
  }
  $('link[rel~="stylesheet"]').each((_idx, node) => {
    const href = $(node).attr('href') || '';
    const tag = stylesheetLinkTag(href, sourceUrl);
    const absoluteHref = tag ? extractStylesheetHref(tag) : null;
    if (tag && absoluteHref)
      stylesheetLinks.set(absoluteHref, tag);
  });

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

    const dataSrc = (img.attr('data-src') || img.attr('data-lazy-src') || img.attr('data-original') || img.attr('data-lazy') || '').trim();
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
    if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
      const absoluteSrc = absolutizeCaptureUrl(src, sourceUrl);
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
    const poster = (video.attr('poster') || video.attr('data-poster') || '').trim();
    if (poster) {
      const absolutePoster = absolutizeCaptureUrl(poster, sourceUrl);
      video.attr('poster', absolutePoster);
      imageUrls.add(absolutePoster);
    }
    video.find('source').each((_sourceIdx, sourceNode) => {
      const source = $(sourceNode);
      const src = (source.attr('src') || source.attr('data-src') || '').trim();
      if (src)
        source.attr('src', absolutizeCaptureUrl(src, sourceUrl));
    });
    video.attr('autoplay', '');
    video.attr('muted', '');
    video.attr('playsinline', '');
    video.attr('loop', '');
  });

  container.find('[style]').each((_idx, node) => {
    const style = $(node).attr('style') || '';
    const matches = style.matchAll(/url\(["']?([^"')]+)["']?\)/gi);
    for (const match of matches) {
      const absoluteUrl = absolutizeCaptureUrl(match[1], sourceUrl);
      if (absoluteUrl && !absoluteUrl.startsWith('data:') && !absoluteUrl.startsWith('blob:'))
        imageUrls.add(absoluteUrl);
    }
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
    stylesheetLinks: [...stylesheetLinks.values()],
    imageUrls: [...imageUrls],
    heroUrl,
    title,
    elementCount: container.find('*').length,
  }, sourceUrl);

  if (isCaptureBlockedBySecurityPage({ html: result.html, title: result.title }))
    return { bot_blocked: true };

  return result;
}

export function normalizeCapturedLazyMedia(result: DomCaptureResult, sourceUrl: string): DomCaptureResult {
  const $ = load(result.html, {}, false);
  const imageUrls = new Set(result.imageUrls.filter(Boolean));
  const comparableSourceUrl = normalizeComparableUrl(sourceUrl);

  $('source[data-srcset], img[data-srcset]').each((_idx, node) => {
    const el = $(node);
    const srcset = (el.attr('srcset') || el.attr('data-srcset') || '').trim();
    if (!srcset)
      return;

    el.attr('srcset', normalizeCaptureSrcset(srcset, sourceUrl, imageUrls));
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
    if (!(img.attr('srcset') || '').trim())
      img.attr('srcset', normalizedSrcset);
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

    const src = (img.attr('src') || '').trim();
    if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
      const absoluteSrc = absolutizeCaptureUrl(src, sourceUrl);
      if (normalizeComparableUrl(absoluteSrc) === comparableSourceUrl && !(img.attr('srcset') || '').trim()) {
        img.remove();
        return;
      }
      img.attr('src', absoluteSrc);
      imageUrls.add(absoluteSrc);
    }
  });

  $('img').each((_idx, node) => {
    const img = $(node);
    const hasRenderableSource = (img.attr('src') || img.attr('srcset') || '').trim();
    const hasRecoverableSource = (img.attr('data-src') || img.attr('data-srcset') || img.attr('data-lazy-src') || img.attr('data-original') || '').trim();
    if (!hasRenderableSource && !hasRecoverableSource)
      img.remove();
  });

  $('source[srcset]').each((_idx, node) => {
    const source = $(node);
    const srcset = (source.attr('srcset') || '').trim();
    if (srcset)
      source.attr('srcset', normalizeCaptureSrcset(srcset, sourceUrl, imageUrls));
  });

  const heroUrl = result.heroUrl ? absolutizeCaptureUrl(result.heroUrl, sourceUrl) : result.heroUrl;
  if (heroUrl && !heroUrl.startsWith('data:') && !heroUrl.startsWith('blob:'))
    imageUrls.add(heroUrl);

  return {
    ...result,
    html: $.html(),
    imageUrls: [...imageUrls],
    heroUrl,
  };
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
      if (backend === 'scrapling-stealth' && oemId !== 'toyota-au') {
        return {
          success: false,
          capture_time_ms: Date.now() - startTime,
          capture_backend: backend,
          error: 'scrapling-stealth capture backend is currently allowlisted only for toyota-au',
        };
      }

      if (backend === 'scrapling-stealth' && !options.externalCapture?.html) {
        return {
          success: false,
          capture_time_ms: Date.now() - startTime,
          capture_backend: backend,
          error: 'scrapling-stealth capture backend requires external captured_html input',
        };
      }

      const capture = backend === 'scrapling-stealth'
        ? buildDomCaptureFromHtml(options.externalCapture!, options.externalCapture?.finalUrl || sourceUrl)
        : await this.captureDom(sourceUrl);
      if ('bot_blocked' in capture) {
        return {
          success: false,
          capture_time_ms: Date.now() - startTime,
          capture_backend: backend,
          bot_blocked: true,
          error: 'Security verification page detected; existing page was not overwritten',
        };
      }

      console.log(`[PageCapturer] Captured via ${backend}: "${capture.title}", ${capture.elementCount} elements, ${capture.imageUrls.length} images`);

      // Download images to R2
      const imageUrls = capture.imageUrls.slice(0, MAX_IMAGE_DOWNLOADS);
      const urlMapping = await this.downloadImages(oemId, modelSlug, imageUrls);

      // Rewrite image URLs in HTML
      let html = capture.html;
      for (const [originalUrl, proxyPath] of urlMapping) {
        html = html.replaceAll(originalUrl, proxyPath);
      }

      const heroUrl = urlMapping.get(capture.heroUrl) || capture.heroUrl;

      // Assemble: stylesheet links + tab/reset overrides + cleaned HTML body
      const stylesheetHtml = capture.stylesheetLinks.join('\n');
      const overrideCss = [
        // Force tab panels visible (external CSS hides inactive tabs)
        '.tab_contents,.tab-content,.tab-panel,.tab_content,[role="tabpanel"],[class*="tabpanel"]{display:block!important;visibility:visible!important;opacity:1!important;}',
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
        viewport: { width: 1440, height: 1080 },
        asset_map: Object.fromEntries(urlMapping),
        stylesheet_urls: capture.stylesheetLinks
          .map(extractStylesheetHref)
          .filter((href): href is string => Boolean(href)),
        section_index: [],
        warnings: [],
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

  private async captureDom(
    sourceUrl: string,
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

        // Resolve lazy-loaded images (common data-* patterns)
        const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-image-src'];
        document.querySelectorAll('img').forEach(img => {
          for (const attr of LAZY_ATTRS) {
            const val = img.getAttribute(attr);
            if (val && val.startsWith('http')) {
              img.src = val;
              img.removeAttribute(attr);
              break;
            }
          }
          // Force lazy images to eager
          if (img.loading === 'lazy') {
            img.loading = 'eager';
          }
        });

        // Also handle data-srcset
        document.querySelectorAll('img[data-srcset], source[data-srcset]').forEach(el => {
          const val = el.getAttribute('data-srcset');
          if (val) {
            el.setAttribute('srcset', val);
          }
        });

        // Handle data-bg (background images)
        document.querySelectorAll('[data-bg]').forEach(el => {
          const bg = el.getAttribute('data-bg');
          if (bg) {
            (el as HTMLElement).style.backgroundImage = `url(${bg})`;
            el.removeAttribute('data-bg');
          }
        });
      });

      // Wait a moment for the DOM changes to take effect
      await new Promise(r => setTimeout(r, 500));

      // Scroll to trigger lazy-loaded images (now that hidden panels are visible)
      await page.evaluate(async () => {
        const step = window.innerHeight;
        const maxScroll = document.body.scrollHeight;
        for (let y = 0; y < maxScroll; y += step) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 300));
        }
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 500));
      });

      // Wait for images to finish loading after scroll
      await new Promise(r => setTimeout(r, 2000));

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
          video.querySelectorAll('source').forEach(source => {
            const dataSrc = source.getAttribute('data-src');
            if (dataSrc && dataSrc.includes('.mp4')) {
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

        for (const sheet of document.styleSheets) {
          if (sheet.href && !seenHrefs.has(sheet.href)) {
            seenHrefs.add(sheet.href);
            stylesheetLinks.push(`<link rel="stylesheet" href="${sheet.href}">`);
          }
        }
        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
          const href = (link as HTMLLinkElement).href;
          if (href && href.startsWith('http') && !seenHrefs.has(href)) {
            seenHrefs.add(href);
            stylesheetLinks.push(`<link rel="stylesheet" href="${href}">`);
          }
        });
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
                  stylesheetLinks.push(`<link rel="stylesheet" href="${url}">`);
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
          video.querySelectorAll('source').forEach(source => {
            if (source.src && !source.src.startsWith('data:')) {
              source.src = abs(source.src);
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

      const normalized = normalizeCapturedLazyMedia(result, sourceUrl);
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
      try { new URL(url); return true; } catch { return false; }
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
