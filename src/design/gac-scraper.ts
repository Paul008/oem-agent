/**
 * GAC Website Scraper — Scrapes gacgroup.com/en-au model pages into page builder sections.
 *
 * GAC uses a custom Nuxt 3 CMS with a clean `_payload.json` endpoint that returns
 * the full page structure in Nuxt's indexed-ref compressed format.
 *
 * Endpoint:  https://www.gacgroup.com/en-au{path}/_payload.json
 * Example:   /hatchback/aion-ut  →  https://www.gacgroup.com/en-au/hatchback/aion-ut/_payload.json
 *
 * Page structure:
 *   page.rowList[].moduleList[].componentList[]
 *
 * Module types observed:
 *   M_BIGHEADER_PIC         → hero image row (full-bleed)
 *   M_TEXT_DISPLAY          → text/heading row
 *   M_SLIDER_SELLING_POINTS → horizontal pin-scroll cards (the "GSAP" effect)
 *   M_APP_DOWNLOAD          → app download CTA
 *
 * Inside M_SLIDER_SELLING_POINTS:
 *   C_TITLE_INTRO (attr = JSON string with title, pcBgImage, mBgImage)
 *   C_SELLING_POINTS_SETTING (attr = JSON string, array of { list: [{ content, pcBgImage, mBgImage }] })
 */

import type { OemScraperResult, OemSection } from './oem-scraper';

// ============================================================================
// Nuxt payload reference resolver
// ============================================================================

/**
 * Nuxt 3 serializes payload state as a flat array of values where integers are
 * indexes into the same array. This resolves refs into a plain object graph,
 * with cycle protection.
 */
function resolveRefs(raw: any[], rootIdx: number): any {
  const resolving = new Set<number>();
  const cache = new Map<number, any>();

  function walk(node: any): any {
    if (typeof node !== 'number') return node;
    if (node < 0 || node >= raw.length) return node;
    if (cache.has(node)) return cache.get(node);
    if (resolving.has(node)) return null; // cycle
    resolving.add(node);

    const val = raw[node];
    let resolved: any;
    if (Array.isArray(val)) {
      resolved = val.map(walk);
    } else if (val && typeof val === 'object') {
      resolved = {};
      for (const [k, v] of Object.entries(val)) resolved[k] = walk(v);
    } else {
      resolved = val;
    }

    cache.set(node, resolved);
    resolving.delete(node);
    return resolved;
  }

  return walk(rootIdx);
}

/**
 * Find the page-data entry inside the resolved Nuxt cache by shape, not by
 * hash key (the hash key varies between pages).
 */
function findPageData(cache: Record<string, any>): any | null {
  for (const v of Object.values(cache)) {
    if (v && typeof v === 'object' && 'rowList' in v && 'pageId' in v && 'path' in v) {
      return v;
    }
  }
  return null;
}

/**
 * Parse a component's `attr` field — it's almost always a JSON-stringified
 * blob but can occasionally be a plain object already.
 */
function parseAttr(attr: unknown): any {
  if (attr == null) return null;
  if (typeof attr === 'object') return attr;
  if (typeof attr !== 'string') return null;
  try {
    return JSON.parse(attr);
  } catch {
    return null;
  }
}

// ============================================================================
// Module → Section mappers
// ============================================================================

let sectionCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++sectionCounter}`;
}

function mapBigHeaderPic(module: any, order: number): OemSection | null {
  const components = module.componentList || [];
  // C_BIGHEADER_PIC holds the background image; C_TITLE_INTRO holds the
  // headline + content; C_BUTTON holds the CTA array.
  const bgAttr = parseAttr(components.find((c: any) => c.type === 'C_BIGHEADER_PIC')?.attr) || {};
  const introAttr = parseAttr(components.find((c: any) => c.type === 'C_TITLE_INTRO')?.attr) || {};
  const btnAttr = parseAttr(components.find((c: any) => c.type === 'C_BUTTON')?.attr);

  const desktop = bgAttr.pcBgImage || bgAttr.pcVideo || introAttr.pcBgImage || '';
  const mobile = bgAttr.mBgImage || bgAttr.mVideo || introAttr.mBgImage || desktop;
  const heading = introAttr.title || introAttr.mainTitle || '';
  const subHeading = introAttr.content || introAttr.subTitle || introAttr.describe || '';

  // Primary CTA from button array (if any)
  const firstBtn = Array.isArray(btnAttr) ? btnAttr[0] : null;
  const ctaText = firstBtn?.title || '';
  const ctaUrl = firstBtn?.linkObj?.linkUrl || firstBtn?.linkUrl || '';

  if (!desktop && !heading) return null;

  return {
    type: 'hero',
    id: nextId('hero'),
    order,
    heading,
    sub_heading: subHeading,
    desktop_image_url: desktop,
    mobile_image_url: mobile,
    cta_text: ctaText,
    cta_url: ctaUrl,
    text_color: introAttr.titleBgColour || '#ffffff',
    text_align: 'left',
    overlay_position: 'bottom-left',
    show_overlay: !!(heading || subHeading),
    full_width_image: true,
    animation: 'none',
  };
}

function mapTextDisplay(module: any, order: number): OemSection | null {
  const components = module.componentList || [];
  const attrs = components.map((c: any) => parseAttr(c.attr)).filter(Boolean);
  const first = attrs[0];
  if (!first) return null;

  const heading = first.title || first.mainTitle || '';
  const body =
    first.richTextContent ||
    first.content ||
    first.describe ||
    first.describeContent ||
    '';
  if (!heading && !body) return null;

  return {
    type: 'content-block',
    id: nextId('content-block'),
    order,
    title: heading,
    content_html: body,
    layout: 'contained',
    background: '',
    image_url: '',
    animation: 'fade-up',
  };
}

function mapSliderSellingPoints(module: any, order: number): OemSection | null {
  const components = module.componentList || [];
  const introAttr = parseAttr(components.find((c: any) => c.type === 'C_TITLE_INTRO')?.attr);
  const pointsAttr = parseAttr(components.find((c: any) => c.type === 'C_SELLING_POINTS_SETTING')?.attr);

  if (!introAttr && !pointsAttr) return null;

  // Gather cards — pointsAttr is an array of groups; flatten and drop empty placeholders.
  const cards: Array<{ image: string; mobile_image: string; caption: string; title_bg: string; content_bg: string }> = [];
  if (Array.isArray(pointsAttr)) {
    for (const group of pointsAttr) {
      const list = Array.isArray(group?.list) ? group.list : [];
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const image = item.pcBgImage || '';
        const caption = item.content || '';
        if (!image && !caption) continue;
        cards.push({
          image,
          mobile_image: item.mBgImage || image,
          caption,
          title_bg: item.titleBgColour || '',
          content_bg: item.contentBgColour || '',
        });
      }
    }
  }

  if (cards.length === 0) return null;

  return {
    type: 'pinned-scroll',
    id: nextId('pinned-scroll'),
    order,
    title: introAttr?.title || '',
    background_image: introAttr?.pcBgImage || '',
    background_image_mobile: introAttr?.mBgImage || introAttr?.pcBgImage || '',
    cards,
    mobile_layout: 'carousel', // carousel | stacked
    animation: 'none',
  };
}

function mapAppDownload(module: any, order: number): OemSection | null {
  const components = module.componentList || [];
  const attr = parseAttr(components[0]?.attr);
  if (!attr) return null;

  const heading = attr.title || attr.mainTitle || 'Download the App';
  const body = attr.describe || attr.content || '';
  if (!heading) return null;

  return {
    type: 'cta-banner',
    id: nextId('cta-banner'),
    order,
    heading,
    body,
    cta_text: attr.buttonText || 'Download',
    cta_url: attr.linkUrl || '',
    background_color: attr.bgColour || '',
    animation: 'fade-up',
  };
}

// ============================================================================
// Main scraper
// ============================================================================

/**
 * Fetch a GAC model page via the `_payload.json` endpoint and convert to
 * page builder sections.
 *
 * @param path - Page path under /en-au, e.g. "/hatchback/aion-ut"
 */
export async function scrapeGacModelPage(path: string): Promise<OemScraperResult> {
  sectionCounter = 0;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const sourceUrl = `https://www.gacgroup.com/en-au${cleanPath}`;
  const payloadUrl = `${sourceUrl}/_payload.json`;
  const warnings: string[] = [];

  const resp = await fetch(payloadUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OemAgent/1.0)' },
  });
  if (!resp.ok) {
    throw new Error(`GAC payload fetch failed: ${resp.status} ${resp.statusText} (${payloadUrl})`);
  }
  const raw = await resp.json() as any[];
  if (!Array.isArray(raw) || raw.length < 3) {
    throw new Error('GAC payload malformed: expected indexed-ref array');
  }

  // Nuxt payload shape: [meta, rootMarker, cacheMap, ...values]
  // The cache map is the third element. Find its index by scanning element 1
  // (which is ["Reactive", <cacheIdx>]) or fall back to index 2.
  let cacheIdx = 2;
  const rootMarker = raw[1];
  if (Array.isArray(rootMarker) && rootMarker[0] === 'Reactive' && typeof rootMarker[1] === 'number') {
    const reactive = resolveRefs(raw, rootMarker[1]);
    // reactive.data points to the cache
    if (reactive && typeof reactive === 'object' && 'data' in reactive) {
      // resolve again using the 'data' index would need raw pos; just use the resolved cache
      const pageData = findPageData(reactive.data || reactive);
      if (pageData) return buildResult(pageData, sourceUrl, warnings);
    }
  }

  // Fallback: resolve cacheIdx directly
  const cache = resolveRefs(raw, cacheIdx);
  const pageData = findPageData(cache || {});
  if (!pageData) {
    throw new Error('GAC payload: page data not found (no rowList detected in cache)');
  }
  return buildResult(pageData, sourceUrl, warnings);
}

function buildResult(pageData: any, sourceUrl: string, warnings: string[]): OemScraperResult {
  const sections: OemSection[] = [];
  const rows: any[] = Array.isArray(pageData.rowList) ? pageData.rowList : [];
  let order = 0;

  // Sort rows by their `sort` field so the page order matches the live site
  const orderedRows = [...rows].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  for (const row of orderedRows) {
    const modules: any[] = Array.isArray(row.moduleList) ? row.moduleList : [];
    for (const mod of modules) {
      let section: OemSection | null = null;
      switch (mod.type) {
        case 'M_BIGHEADER_PIC':
          section = mapBigHeaderPic(mod, order);
          break;
        case 'M_TEXT_DISPLAY':
          section = mapTextDisplay(mod, order);
          break;
        case 'M_SLIDER_SELLING_POINTS':
          section = mapSliderSellingPoints(mod, order);
          break;
        case 'M_APP_DOWNLOAD':
          section = mapAppDownload(mod, order);
          break;
        default:
          warnings.push(`Unsupported module type: ${mod.type}`);
      }
      if (section) {
        sections.push(section);
        order++;
      }
    }
  }

  // Surface the first hero for the page-level header metadata
  const firstHero = sections.find((s) => s.type === 'hero');
  const slug = (pageData.path || '').split('/').filter(Boolean).pop() || 'unknown';

  return {
    success: sections.length > 0,
    source_url: sourceUrl,
    slug,
    name: pageData.name || pageData.title || slug,
    header: {
      slides: firstHero
        ? [{
            heading: firstHero.heading || '',
            sub_heading: firstHero.sub_heading || '',
            button: firstHero.cta_text || '',
            desktop: firstHero.desktop_image_url || '',
            mobile: firstHero.mobile_image_url || '',
            bottom_strip: [{ heading: '', sub_heading: '' }],
          }]
        : [{
            heading: pageData.name || slug,
            sub_heading: '',
            button: '',
            desktop: '',
            mobile: '',
            bottom_strip: [{ heading: '', sub_heading: '' }],
          }],
    },
    sections,
    warnings,
  };
}

/**
 * Known GAC AU model page paths.
 */
export const GAC_MODEL_PATHS: Record<string, string> = {
  'aion-ut': '/hatchback/aion-ut',
};
