/**
 * Inline Data Extractor
 *
 * Extracts structured data embedded in HTML pages via:
 * - JSON-LD scripts (schema.org ImageGallery / ItemList)
 * - Next.js __NEXT_DATA__
 * - Nuxt 3 __NUXT_DATA__ / Nuxt 2 window.__NUXT__
 * - Gatsby page-data.json endpoint
 * - AEM .model.json endpoint
 * - window.* global state objects
 *
 * Used as a higher-confidence alternative to CSS-selector banner extraction
 * when OEM frameworks embed structured data in the page.
 */

import type { ExtractedBannerSlide } from '../oem/types';
import type { OemDefinition } from '../oem/registry';

// ============================================================================
// Public Result Type
// ============================================================================

export interface InlineDataResult {
  source: 'jsonld' | 'gatsby' | 'nextjs' | 'nuxt' | 'aem' | 'window_global';
  data: unknown;
  confidence: number;
}

// ============================================================================
// 1. JSON-LD Banner Extraction
// ============================================================================

const JSONLD_RE = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Extracts banner slides from JSON-LD scripts embedded in HTML.
 * Supports schema.org @type: 'ImageGallery' and @type: 'ItemList'.
 */
export function extractJsonLdBanners(html: string): ExtractedBannerSlide[] {
  const slides: ExtractedBannerSlide[] = [];
  let match: RegExpExecArray | null;

  JSONLD_RE.lastIndex = 0;
  while ((match = JSONLD_RE.exec(html)) !== null) {
    let parsed: any;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue;
    }

    const type: string = parsed['@type'] ?? '';

    if (type === 'ImageGallery') {
      const images: any[] = Array.isArray(parsed.image) ? parsed.image : [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const imageUrl: string = img.contentUrl ?? img.url ?? '';
        if (!imageUrl) continue;
        const slide: ExtractedBannerSlide = {
          position: i,
          headline: img.name ?? undefined,
          image_url_desktop: imageUrl,
        };
        if (img.caption != null) slide.sub_headline = img.caption;
        slides.push(slide);
      }
    } else if (type === 'ItemList') {
      const items: any[] = Array.isArray(parsed.itemListElement) ? parsed.itemListElement : [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const imageUrl: string = item.contentUrl ?? item.url ?? '';
        if (!imageUrl) continue;
        const slide: ExtractedBannerSlide = {
          position: i,
          headline: item.name ?? undefined,
          image_url_desktop: imageUrl,
        };
        slides.push(slide);
      }
    }
    // All other @types are silently ignored
  }

  return slides;
}

// ============================================================================
// 2. Next.js __NEXT_DATA__
// ============================================================================

const NEXT_DATA_RE = /<script\s+id=["']__NEXT_DATA__["']\s+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i;

/**
 * Extracts the parsed __NEXT_DATA__ JSON object from a Next.js page, or null.
 */
export function extractNextData(html: string): any | null {
  const match = NEXT_DATA_RE.exec(html);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

// ============================================================================
// 3. Nuxt Data
// ============================================================================

// Nuxt 3: <script type="application/json" id="__NUXT_DATA__">...</script>
const NUXT3_RE = /<script\s+type=["']application\/json["']\s+id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;
// Nuxt 2: window.__NUXT__ = {...};
const NUXT2_RE = /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});/;

/**
 * Extracts Nuxt data embedded in the HTML.
 * Tries Nuxt 3 format first, then Nuxt 2.
 * Returns parsed JSON object or null.
 */
export function extractNuxtData(html: string): any | null {
  // Nuxt 3
  const nuxt3Match = NUXT3_RE.exec(html);
  if (nuxt3Match) {
    try {
      return JSON.parse(nuxt3Match[1].trim());
    } catch {
      // fall through to Nuxt 2
    }
  }

  // Nuxt 2
  const nuxt2Match = NUXT2_RE.exec(html);
  if (nuxt2Match) {
    try {
      return JSON.parse(nuxt2Match[1].trim());
    } catch {
      return null;
    }
  }

  return null;
}

// ============================================================================
// 4. Gatsby Page Data
// ============================================================================

/**
 * Fetches Gatsby's page-data.json for a given page URL.
 * Builds the endpoint as `{origin}/page-data/{slug}/page-data.json`,
 * where '/' resolves to slug 'index'.
 * Returns `result.data`, `result.pageContext`, or null on error.
 */
export async function fetchGatsbyPageData(pageUrl: string): Promise<any | null> {
  try {
    const url = new URL(pageUrl);
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    const slug = pathname === '/' ? 'index' : pathname.replace(/^\//, '');
    const endpoint = `${url.origin}/page-data/${slug}/page-data.json`;

    const res = await fetch(endpoint);
    if (!res.ok) return null;

    const json: any = await res.json();
    return json.result?.data ?? json.result?.pageContext ?? null;
  } catch {
    return null;
  }
}

// ============================================================================
// 5. AEM Model JSON
// ============================================================================

/**
 * Fetches the AEM content model for a page by appending `.model.json`.
 * Returns parsed JSON or null on error.
 */
export async function fetchAemModelJson(pageUrl: string): Promise<any | null> {
  try {
    const endpoint = pageUrl.replace(/\/$/, '') + '.model.json';
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ============================================================================
// 6. Window Global State Objects
// ============================================================================

const WINDOW_GLOBAL_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: '__INITIAL_STATE__', re: /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/ },
  { name: '__DATA__',          re: /window\.__DATA__\s*=\s*(\{[\s\S]*?\});/ },
  { name: '__PRELOADED_STATE__', re: /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/ },
  { name: 'pageData',          re: /window\.pageData\s*=\s*(\{[\s\S]*?\});/ },
];

/**
 * Extracts known window global state objects from inline scripts.
 * Returns a Record keyed by global name; missing globals are omitted.
 */
export function extractWindowGlobals(html: string): Record<string, any> {
  const result: Record<string, any> = {};

  for (const { name, re } of WINDOW_GLOBAL_PATTERNS) {
    const match = re.exec(html);
    if (!match) continue;
    try {
      result[name] = JSON.parse(match[1].trim());
    } catch {
      // skip malformed globals
    }
  }

  return result;
}

// ============================================================================
// 7. Orchestrator
// ============================================================================

/**
 * Orchestrates all inline data extractors based on the OEM's framework flags.
 * Always runs JSON-LD and window-global extraction.
 * Framework-specific extractors run only when the OEM definition opts in.
 */
export async function extractInlineData(
  html: string,
  oemDef: OemDefinition,
  pageUrl: string,
): Promise<InlineDataResult[]> {
  const results: InlineDataResult[] = [];
  const { flags } = oemDef;

  // --- JSON-LD (always) ---
  const jsonLdSlides = extractJsonLdBanners(html);
  if (jsonLdSlides.length > 0) {
    results.push({ source: 'jsonld', data: jsonLdSlides, confidence: 0.90 });
  }

  // --- Gatsby ---
  if (flags.isGatsby) {
    const gatsbyData = await fetchGatsbyPageData(pageUrl);
    if (gatsbyData != null) {
      results.push({ source: 'gatsby', data: gatsbyData, confidence: 0.85 });
    }
  }

  // --- Next.js ---
  if (flags.isNextJs) {
    const nextData = extractNextData(html);
    if (nextData != null) {
      results.push({ source: 'nextjs', data: nextData, confidence: 0.85 });
    }
  }

  // --- Nuxt ---
  if (flags.framework === 'nuxt') {
    const nuxtData = extractNuxtData(html);
    if (nuxtData != null) {
      results.push({ source: 'nuxt', data: nuxtData, confidence: 0.85 });
    }
  }

  // --- AEM ---
  if (flags.isAEM) {
    const aemData = await fetchAemModelJson(pageUrl);
    if (aemData != null) {
      results.push({ source: 'aem', data: aemData, confidence: 0.85 });
    }
  }

  // --- Window globals (always) ---
  const globals = extractWindowGlobals(html);
  if (Object.keys(globals).length > 0) {
    results.push({ source: 'window_global', data: globals, confidence: 0.70 });
  }

  return results;
}
