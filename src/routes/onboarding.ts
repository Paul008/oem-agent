/**
 * OEM Onboarding API Routes
 *
 * Provides endpoints for the dashboard onboarding wizard:
 * - POST /discover — Site discovery (sitemap, framework, pages)
 * - POST /register — Register OEM + source pages in Supabase
 * - POST /generate-snippets — Generate TypeScript/SQL code snippets
 */

import { Hono } from 'hono';
import type { MoltbotEnv, AccessUser } from '../types';
import type { PageType } from '../oem/types';
import { createSupabaseClient } from '../utils/supabase';

type OnboardingEnv = {
  Bindings: MoltbotEnv;
  Variables: {
    accessUser?: AccessUser;
  };
};

const app = new Hono<OnboardingEnv>();

// ============================================================================
// Types
// ============================================================================

interface DiscoveredPage {
  url: string;
  page_type: PageType;
  label: string;
}

interface DiscoveryResult {
  oem_id: string;
  oem_name: string;
  base_url: string;
  discovery: {
    sitemap_urls: string[];
    homepage_links_count: number;
    classified_pages: DiscoveredPage[];
    framework: string | null;
    brand_color: string | null;
    sub_brands: string[];
  };
}

// ============================================================================
// POST /discover — Site discovery
// ============================================================================

app.post('/discover', async (c) => {
  const body = await c.req.json<{ base_url: string; oem_name?: string }>().catch(() => null);

  if (!body?.base_url) {
    return c.json({ error: 'base_url is required' }, 400);
  }

  // Normalize base URL
  let baseUrl = body.base_url.trim().replace(/\/+$/, '');
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  const oemName = body.oem_name || parsedUrl.hostname.replace(/^www\./, '').split('.')[0];
  const oemId = generateOemId(oemName);

  // Fetch sitemap, robots.txt, and homepage in parallel
  const [sitemapResult, homepageResult, robotsResult] = await Promise.allSettled([
    fetchSitemap(baseUrl),
    fetchHomepage(baseUrl),
    fetchRobotsTxt(baseUrl),
  ]);

  const sitemapUrls = sitemapResult.status === 'fulfilled' ? sitemapResult.value : [];
  const homepage = homepageResult.status === 'fulfilled' ? homepageResult.value : null;
  const robotsSitemaps = robotsResult.status === 'fulfilled' ? robotsResult.value : [];

  // If no sitemap found, try sitemaps referenced in robots.txt
  let allSitemapUrls = sitemapUrls;
  if (allSitemapUrls.length === 0 && robotsSitemaps.length > 0) {
    const robotsSitemapResults = await Promise.allSettled(
      robotsSitemaps.slice(0, 3).map(url => fetchSitemapByUrl(url))
    );
    for (const result of robotsSitemapResults) {
      if (result.status === 'fulfilled') allSitemapUrls.push(...result.value);
    }
  }

  // Detect framework and brand color from homepage HTML
  const framework = homepage ? detectFramework(homepage) : null;
  const brandColor = homepage ? detectBrandColor(homepage, baseUrl) : null;

  // If no sitemap URLs, extract links from homepage as fallback
  let homepageLinks: string[] = [];
  if (allSitemapUrls.length === 0 && homepage) {
    homepageLinks = extractLinksFromHtml(homepage, baseUrl);
  }

  // Classify URLs by page type
  const allUrls = [...new Set([...allSitemapUrls, ...homepageLinks, baseUrl])];
  const classifiedPages = classifyUrls(allUrls, baseUrl).slice(0, 200);

  // Detect sub-brands from URL patterns
  const subBrands = detectSubBrands(allUrls, baseUrl);

  const result: DiscoveryResult = {
    oem_id: oemId,
    oem_name: oemName,
    base_url: baseUrl,
    discovery: {
      sitemap_urls: allSitemapUrls.slice(0, 200),
      homepage_links_count: homepageLinks.length,
      classified_pages: classifiedPages,
      framework,
      brand_color: brandColor,
      sub_brands: subBrands,
    },
  };

  return c.json(result);
});

// ============================================================================
// POST /register — DB registration
// ============================================================================

app.post('/register', async (c) => {
  const body = await c.req.json<{
    oem_id: string;
    oem_name: string;
    base_url: string;
    brand_color?: string;
    source_pages: Array<{ url: string; page_type: PageType }>;
    config: {
      homepage: string;
      vehicles_index?: string;
      offers: string;
      news?: string;
      schedule: {
        homepage_minutes: number;
        offers_minutes: number;
        vehicles_minutes: number;
        news_minutes: number;
      };
      sub_brands?: string[];
    };
    flags: {
      requiresBrowserRendering: boolean;
      hasSubBrands?: boolean;
      isNextJs?: boolean;
      isAEM?: boolean;
      requiresPostcode?: boolean;
    };
    discovered_apis?: Array<{
      url: string;
      method: string;
      data_type: string;
      content_type?: string;
      notes?: string;
    }>;
  }>().catch(() => null);

  if (!body) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  // Validate oem_id format (allows hyphens for multi-word brands like great-wall-motors-au)
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*-au$/.test(body.oem_id)) {
    return c.json({ error: 'oem_id must match format: {brand}-au (lowercase, e.g. foton-au or great-wall-motors-au)' }, 400);
  }

  if (!body.oem_name || !body.base_url || !body.source_pages?.length) {
    return c.json({ error: 'oem_name, base_url, and source_pages are required' }, 400);
  }

  // Validate at least one homepage page exists
  const hasHomepage = body.source_pages.some(p => p.page_type === 'homepage');
  if (!hasHomepage) {
    return c.json({ error: 'At least one page must have type "homepage"' }, 400);
  }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Check if OEM already exists
  const { data: existing } = await supabase
    .from('oems')
    .select('id')
    .eq('id', body.oem_id)
    .single();

  if (existing) {
    return c.json({ error: `OEM '${body.oem_id}' already exists` }, 409);
  }

  // Insert OEM record
  const configJson = {
    ...body.config,
    brand_color: body.brand_color || null,
    flags: body.flags,
  };

  const { error: oemError } = await supabase
    .from('oems')
    .insert({
      id: body.oem_id,
      name: body.oem_name,
      base_url: body.base_url,
      config_json: configJson,
      is_active: true,
    });

  if (oemError) {
    return c.json({ error: `Failed to insert OEM: ${oemError.message}` }, 500);
  }

  // Insert source pages
  const sourcePageRows = body.source_pages.map(p => ({
    oem_id: body.oem_id,
    url: p.url,
    page_type: p.page_type,
    status: 'active',
  }));

  const { error: pagesError, data: pagesData } = await supabase
    .from('source_pages')
    .upsert(sourcePageRows, { onConflict: 'oem_id,url', ignoreDuplicates: true })
    .select('id');

  if (pagesError) {
    console.error('[Onboarding] Source pages insert error:', pagesError);
  }

  // Insert discovered APIs if provided
  let apisCreated = 0;
  if (body.discovered_apis?.length) {
    const apiRows = body.discovered_apis.map(api => ({
      oem_id: body.oem_id,
      url: api.url,
      method: api.method,
      data_type: api.data_type,
      content_type: api.content_type || null,
      response_type: 'json' as const,
      status: 'discovered' as const,
      reliability_score: 0.5,
      call_count: 0,
      error_count: 0,
    }));

    const { error: apiError, data: apiData } = await supabase
      .from('discovered_apis')
      .upsert(apiRows, { onConflict: 'oem_id,url', ignoreDuplicates: true })
      .select('id');

    if (apiError) {
      console.error('[Onboarding] Discovered APIs insert error:', apiError);
    }
    apisCreated = apiData?.length || 0;
  }

  return c.json({
    success: true,
    oem_id: body.oem_id,
    source_pages_created: pagesData?.length || 0,
    discovered_apis_created: apisCreated,
  });
});

// ============================================================================
// POST /generate-snippets — Code generation for developer handoff
// ============================================================================

app.post('/generate-snippets', async (c) => {
  const body = await c.req.json<{
    oem_id: string;
    oem_name: string;
    base_url: string;
    brand_color?: string;
    config: {
      homepage: string;
      vehicles_index?: string;
      offers: string;
      news?: string;
      schedule: {
        homepage_minutes: number;
        offers_minutes: number;
        vehicles_minutes: number;
        news_minutes: number;
      };
      sub_brands?: string[];
    };
    flags: {
      requiresBrowserRendering: boolean;
      hasSubBrands?: boolean;
      isNextJs?: boolean;
      isAEM?: boolean;
      requiresPostcode?: boolean;
      defaultPostcode?: string;
    };
    source_pages: Array<{ url: string; page_type: string }>;
    notes?: string;
  }>().catch(() => null);

  if (!body) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const { oem_id, oem_name, base_url, brand_color, config, flags, source_pages, notes } = body;

  // Generate variable name from oem_id (e.g. "foton-au" → "fotonAu")
  const varName = oem_id.replace(/-(\w)/g, (_, c) => c.toUpperCase());

  // 1. types.ts — OemId union line
  const typesSnippet = `  | '${oem_id}'`;

  // 2. registry.ts — OemDefinition export + registry entry
  const flagEntries: string[] = [`    requiresBrowserRendering: ${flags.requiresBrowserRendering}`];
  if (flags.isNextJs) flagEntries.push(`    isNextJs: true`);
  if (flags.isAEM) flagEntries.push(`    isAEM: true`);
  if (flags.requiresPostcode) flagEntries.push(`    requiresPostcode: true`);
  if (flags.defaultPostcode) flagEntries.push(`    defaultPostcode: '${flags.defaultPostcode}'`);
  if (flags.hasSubBrands) flagEntries.push(`    hasSubBrands: true`);

  const configLines: string[] = [
    `    homepage: '${config.homepage}',`,
  ];
  if (config.vehicles_index) configLines.push(`    vehicles_index: '${config.vehicles_index}',`);
  configLines.push(`    offers: '${config.offers}',`);
  if (config.news) configLines.push(`    news: '${config.news}',`);
  if (config.sub_brands?.length) configLines.push(`    sub_brands: [${config.sub_brands.map(b => `'${b}'`).join(', ')}],`);
  configLines.push(`    schedule: {`);
  configLines.push(`      homepage_minutes: ${config.schedule.homepage_minutes},`);
  configLines.push(`      offers_minutes: ${config.schedule.offers_minutes},`);
  configLines.push(`      vehicles_minutes: ${config.schedule.vehicles_minutes},`);
  configLines.push(`      news_minutes: ${config.schedule.news_minutes},`);
  configLines.push(`    },`);

  const registrySnippet = `export const ${varName}: OemDefinition = {
  id: '${oem_id}',
  name: '${oem_name}',
  baseUrl: '${base_url}',
  config: {
${configLines.join('\n')}
  },
  selectors: {
    vehicleLinks: 'a[href*="/vehicles/"], a[href*="/models/"]',
    heroSlides: '.hero, [class*="hero"]',
    offerTiles: '[class*="offer"], [class*="promo"]',
  },
  flags: {
${flagEntries.join(',\n')},
  },
};

// Add to oemRegistry object:
// '${oem_id}': ${varName},`;

  // 3. agent.ts — OEM_BRAND_NOTES entry
  const brandNotes = notes || `${flags.requiresBrowserRendering ? 'SPA/browser-rendered' : 'Server-rendered'}, ${source_pages.length} source pages`;
  const agentSnippet = `'${oem_id}': {
  colors: ['${brand_color || '#000000'}'],
  notes: '${brandNotes.replace(/'/g, "\\'")}',
},`;

  // 4. migration.sql — Full INSERT statements
  const configJsonStr = JSON.stringify({
    ...config,
    flags,
  }).replace(/'/g, "''");

  const esc = (s: string) => s.replace(/'/g, "''");
  const sourcePageValues = source_pages
    .map(p => `('${esc(oem_id)}', '${esc(p.url)}', '${esc(p.page_type)}', 'active', now(), now())`)
    .join(',\n');

  const migrationSnippet = `-- ============================================================================
-- ${oem_name} — OEM + Source Pages
-- ============================================================================

INSERT INTO oems (id, name, base_url, config_json, is_active)
VALUES (
  '${oem_id}',
  '${esc(oem_name)}',
  '${esc(base_url)}',
  '${configJsonStr}'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  config_json = EXCLUDED.config_json,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
${sourcePageValues}
ON CONFLICT (oem_id, url) DO NOTHING;`;

  return c.json({
    snippets: {
      types: {
        file: 'src/oem/types.ts',
        description: 'Add to OemId union type',
        code: typesSnippet,
      },
      registry: {
        file: 'src/oem/registry.ts',
        description: 'OEM definition + registry entry',
        code: registrySnippet,
      },
      agent: {
        file: 'src/design/agent.ts',
        description: 'OEM_BRAND_NOTES entry',
        code: agentSnippet,
      },
      migration: {
        file: `supabase/migrations/YYYYMMDD_${oem_id.replace('-', '_')}_oem.sql`,
        description: 'Supabase migration (OEM + source pages)',
        code: migrationSnippet,
      },
    },
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function generateOemId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+australia$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-au';
}

async function fetchSitemap(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];

  // Try sitemap.xml first
  try {
    const res = await fetch(`${baseUrl}/sitemap.xml`, {
      headers: { 'User-Agent': 'OEM-Agent/1.0 (site-discovery)' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const xml = await res.text();
      // Extract URLs from <loc> tags
      const locMatches = xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
      for (const match of locMatches) {
        urls.push(match[1]);
      }
    }
  } catch {
    // Sitemap not available, will fall back to homepage links
  }

  // Also try sitemap index patterns
  if (urls.length === 0) {
    for (const path of ['/sitemap_index.xml', '/sitemap-index.xml', '/sitemaps.xml']) {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          headers: { 'User-Agent': 'OEM-Agent/1.0 (site-discovery)' },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const xml = await res.text();
          const locMatches = xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
          for (const match of locMatches) {
            urls.push(match[1]);
          }
          if (urls.length > 0) break;
        }
      } catch {
        continue;
      }
    }
  }

  return urls;
}

async function fetchHomepage(baseUrl: string): Promise<string | null> {
  try {
    const res = await fetch(baseUrl, {
      headers: { 'User-Agent': 'OEM-Agent/1.0 (site-discovery)' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      return await res.text();
    }
  } catch {
    // Failed to fetch homepage
  }
  return null;
}

async function fetchRobotsTxt(baseUrl: string): Promise<string[]> {
  const sitemaps: string[] = [];
  try {
    const res = await fetch(`${baseUrl}/robots.txt`, {
      headers: { 'User-Agent': 'OEM-Agent/1.0 (site-discovery)' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const text = await res.text();
      const matches = text.matchAll(/^Sitemap:\s*(.+)/gim);
      for (const match of matches) {
        sitemaps.push(match[1].trim());
      }
    }
  } catch {
    // robots.txt not available
  }
  return sitemaps;
}

async function fetchSitemapByUrl(url: string): Promise<string[]> {
  const urls: string[] = [];
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'OEM-Agent/1.0 (site-discovery)' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const xml = await res.text();
      const locMatches = xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
      for (const match of locMatches) {
        urls.push(match[1]);
      }
    }
  } catch {
    // Failed to fetch sitemap
  }
  return urls;
}

function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const base = new URL(baseUrl);
  const hrefMatches = html.matchAll(/href=["']([^"']+)["']/gi);

  for (const match of hrefMatches) {
    const href = match[1];
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;

    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname === base.hostname && resolved.pathname !== '/') {
        links.push(resolved.href);
      }
    } catch {
      continue;
    }
  }

  return [...new Set(links)];
}

function detectFramework(html: string): string | null {
  if (html.includes('__NEXT_DATA__') || html.includes('/_next/')) return 'nextjs';
  if (html.includes('__NUXT__') || html.includes('/_nuxt/')) return 'nuxt';
  if (html.includes('/etc.clientlibs/') || html.includes('cq:') || html.includes('aem-')) return 'aem';
  if (html.includes('wp-content') || html.includes('wp-includes')) return 'wordpress';
  if (html.includes('storyblok') || html.includes('storyblok.com')) return 'storyblok';
  if (html.includes('contentful')) return 'contentful';
  if (html.includes('shopify') || html.includes('Shopify.')) return 'shopify';
  return null;
}

function detectBrandColor(html: string, baseUrl?: string): string | null {
  // Check meta theme-color (both name= and property= variants)
  const themeColorMatch = html.match(/<meta\s+(?:name|property)="theme-color"\s+content="(#[0-9a-fA-F]{3,8})"/i)
    || html.match(/<meta\s+content="(#[0-9a-fA-F]{3,8})"\s+(?:name|property)="theme-color"/i);
  if (themeColorMatch) return themeColorMatch[1];

  // Check msapplication-TileColor
  const tileColorMatch = html.match(/<meta\s+name="msapplication-TileColor"\s+content="(#[0-9a-fA-F]{3,8})"/i);
  if (tileColorMatch) return tileColorMatch[1];

  // Check CSS custom properties for common brand color names
  const cssVarMatch = html.match(/--(?:brand|primary|main|accent)-color\s*:\s*(#[0-9a-fA-F]{3,8})/i);
  if (cssVarMatch) return cssVarMatch[1];

  // Check manifest.json link for theme_color
  const manifestMatch = html.match(/<link\s+[^>]*rel="manifest"[^>]*href="([^"]+)"/i);
  if (manifestMatch && baseUrl) {
    // Return null here — manifest would need async fetch, handled by caller if needed
  }

  return null;
}

function classifyUrls(urls: string[], baseUrl: string): DiscoveredPage[] {
  const base = new URL(baseUrl);
  const pages: DiscoveredPage[] = [];

  for (const url of urls) {
    try {
      const parsed = new URL(url);
      // Only include same-host URLs
      if (parsed.hostname !== base.hostname) continue;

      const path = parsed.pathname.toLowerCase();
      const pageType = classifyPath(path);
      const label = path === '/' ? 'Homepage' : path.split('/').filter(Boolean).pop() || path;

      pages.push({ url, page_type: pageType, label });
    } catch {
      continue;
    }
  }

  // Sort: homepage first, then by type priority
  const typePriority: Record<string, number> = {
    homepage: 0, category: 1, vehicle: 2, offers: 3, news: 4, other: 5,
  };
  pages.sort((a, b) => (typePriority[a.page_type] ?? 5) - (typePriority[b.page_type] ?? 5));

  return pages;
}

function classifyPath(path: string): PageType {
  if (path === '/' || path === '/index.html') return 'homepage';

  // Vehicle/model pages
  if (/\/(vehicles?|models?|cars?|range|ute|truck|suv|sedan|hatch|van)\//i.test(path)) {
    // Index pages for vehicle categories
    if (/\/(vehicles?|models?|cars?|range)\/?$/i.test(path) || /\/browse-range/i.test(path)) {
      return 'category';
    }
    return 'vehicle';
  }

  // Offers
  if (/\/(offers?|deals?|specials?|promotions?)\b/i.test(path)) return 'offers';

  // News
  if (/\/(news|blog|stories|discover|media|press)\b/i.test(path)) return 'news';

  // Category pages
  if (/\/(series|lineup|commercial|passenger|performance)\b/i.test(path)) return 'category';

  // Build & price / configurator
  if (/\/(build|configure|build-price|build-and-price|customise)\b/i.test(path)) return 'build_price';

  // Sitemap
  if (/sitemap/i.test(path)) return 'sitemap';

  return 'other';
}

function detectSubBrands(urls: string[], baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const subBrandPatterns = new Set<string>();

  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== base.hostname) continue;

      // Look for patterns like /haval/, /tank/, /cannon/ etc under vehicles
      const match = parsed.pathname.match(/^\/(vehicles?|range|models?|cars?)\/([a-z][a-z0-9-]+)\//i);
      if (match) {
        const candidate = match[2].toLowerCase();
        // Skip common non-brand segments
        if (!['browse-range', 'all', 'compare', 'search', 'filter', 'index'].includes(candidate)) {
          subBrandPatterns.add(candidate);
        }
      }
    } catch {
      continue;
    }
  }

  // Only report as sub-brands if there are multiple distinct patterns
  return subBrandPatterns.size >= 2 ? [...subBrandPatterns] : [];
}

export default app;
