# Banner Triage Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous agent that detects broken banner selectors and self-heals via a 5-layer discovery cascade (APIs → network → inline data → AI → escalation).

**Architecture:** Event-driven trigger when banner CSS extraction returns 0 results for an OEM that previously had banners. The agent runs 5 discovery layers with confidence scoring. Discovered data sources (APIs, selectors) are stored in Supabase for future runs. Crawl Doctor provides a weekly safety net for staleness detection.

**Tech Stack:** TypeScript, Cheerio, Supabase, Cloudflare Workers, Groq Llama 4 Scout (AI layer), existing Smart Mode browser rendering.

**Spec:** `docs/superpowers/specs/2026-04-02-banner-triage-agent-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260402_selector_overrides.sql` | `selector_overrides` table for runtime selector storage |
| `src/extract/banner-data-filter.ts` | Heuristic filter: is this JSON blob banner data? |
| `src/extract/inline-data.ts` | Framework-aware inline data extraction (JSON-LD, Gatsby, Nuxt, Next.js, AEM, globals) |
| `src/sync/banner-triage.ts` | Core 5-layer cascade orchestrator |

### Modified Files

| File | Change |
|------|--------|
| `src/extract/engine.ts:173-185` | Accept optional `selectorOverrides`, use them before registry |
| `src/orchestrator.ts:3305-3321` | Detect 0 banners on homepage, emit `banner_extraction_failed` event |
| `src/sync/crawl-doctor.ts:326-328` | Add Step 7: banner staleness detection |
| `src/routes/cron.ts:353-359` | Add `banner-triage` skill case |

---

### Task 1: `selector_overrides` Migration

**Files:**
- Create: `supabase/migrations/20260402_selector_overrides.sql`

- [ ] **Step 1: Write the migration**

```sql
-- selector_overrides: runtime CSS selector storage for banner-triage agent
-- Allows discovered selectors to override registry.ts without redeployment
CREATE TABLE IF NOT EXISTS selector_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  page_type TEXT NOT NULL DEFAULT 'homepage',
  selector_type TEXT NOT NULL,
  selector_value TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  confidence FLOAT NOT NULL DEFAULT 0.75,
  discovered_by TEXT NOT NULL DEFAULT 'banner-triage',
  validated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_selector_overrides_oem_type
  ON selector_overrides(oem_id, page_type, selector_type);

-- Enable RLS
ALTER TABLE selector_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on selector_overrides"
  ON selector_overrides FOR ALL
  USING (true)
  WITH CHECK (true);
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase migration up --linked`
Expected: Migration applies successfully.

- [ ] **Step 3: Verify table exists**

Run: `npx supabase db dump --linked --schema public | grep selector_overrides`
Expected: Table definition in output.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260402_selector_overrides.sql
git commit -m "feat: add selector_overrides table for banner-triage agent"
```

---

### Task 2: Banner Data Filter

**Files:**
- Create: `src/extract/banner-data-filter.ts`
- Create: `src/extract/banner-data-filter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/extract/banner-data-filter.test.ts
import { describe, test, expect } from 'vitest';
import { isBannerData, scoreBannerConfidence } from './banner-data-filter';

describe('isBannerData', () => {
  test('detects banner URL patterns', () => {
    expect(isBannerData('https://api.example.com/hero-banners', {})).toBe(true);
    expect(isBannerData('https://api.example.com/carousel/slides', {})).toBe(true);
    expect(isBannerData('https://api.example.com/users', {})).toBe(false);
  });

  test('detects banner-like JSON arrays', () => {
    const bannerArray = [
      { image: 'https://img.com/1.jpg', title: 'Slide 1', url: '/promo' },
      { image: 'https://img.com/2.jpg', title: 'Slide 2', url: '/offers' },
    ];
    expect(isBannerData('https://api.example.com/data', bannerArray)).toBe(true);
  });

  test('detects nested banner arrays', () => {
    const nested = {
      status: 'ok',
      slides: [
        { imageUrl: 'https://img.com/1.jpg', headline: 'New Model', href: '/model' },
        { imageUrl: 'https://img.com/2.jpg', headline: 'Offer', href: '/offers' },
      ],
    };
    expect(isBannerData('https://api.example.com/page', nested)).toBe(true);
  });

  test('rejects non-banner data', () => {
    const productList = [
      { sku: 'ABC', price: 100, name: 'Widget' },
      { sku: 'DEF', price: 200, name: 'Gadget' },
    ];
    expect(isBannerData('https://api.example.com/products', productList)).toBe(false);
  });

  test('rejects single-item arrays', () => {
    const single = [{ image: 'x.jpg', title: 'One', url: '/' }];
    expect(isBannerData('https://api.example.com/data', single)).toBe(false);
  });
});

describe('scoreBannerConfidence', () => {
  test('boosts for image+headline', () => {
    const banners = [
      { headline: 'New SUV', image_url_desktop: 'https://img.com/1.jpg', cta_url: '/suv' },
      { headline: 'Offer', image_url_desktop: 'https://img.com/2.jpg', cta_url: '/offer' },
    ];
    const score = scoreBannerConfidence(banners, 0.85, 3);
    expect(score).toBeGreaterThan(0.85);
  });

  test('penalises for nav/boilerplate headlines', () => {
    const banners = [
      { headline: 'Cookie Policy', image_url_desktop: 'x.jpg', cta_url: '/' },
      { headline: 'Privacy Notice', image_url_desktop: 'y.jpg', cta_url: '/' },
    ];
    const score = scoreBannerConfidence(banners, 0.85, 2);
    expect(score).toBeLessThan(0.85);
  });

  test('penalises for fewer than 2 banners', () => {
    const banners = [
      { headline: 'Solo', image_url_desktop: 'x.jpg', cta_url: '/' },
    ];
    const score = scoreBannerConfidence(banners, 0.85, 5);
    expect(score).toBeLessThan(0.70);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/extract/banner-data-filter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/extract/banner-data-filter.ts
import type { ExtractedBannerSlide } from '../oem/types';

const BANNER_URL_PATTERNS = [
  /banner/i, /hero/i, /carousel/i, /slider/i,
  /promo/i, /campaign/i, /spotlight/i, /featured/i,
  /slide/i, /kv/i,
];

/**
 * Heuristic: does this JSON response look like banner/carousel data?
 * Checks URL patterns and structural shape (array of objects with image+text+link).
 */
export function isBannerData(url: string, body: unknown): boolean {
  if (BANNER_URL_PATTERNS.some(p => p.test(url))) return true;

  const arr = findCandidateArray(body);
  if (!arr || arr.length < 2) return false;

  const sample = arr[0];
  if (typeof sample !== 'object' || sample === null) return false;

  const keys = Object.keys(sample).map(k => k.toLowerCase());
  const hasImage = keys.some(k => /image|img|src|photo|media|banner|visual/.test(k));
  const hasText = keys.some(k => /title|heading|headline|name|text|alt/.test(k));
  const hasLink = keys.some(k => /link|url|href|cta|action/.test(k));

  return hasImage && (hasText || hasLink);
}

/**
 * Find the most likely candidate array in a JSON blob.
 * Handles: top-level array, or first array-valued property.
 */
function findCandidateArray(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (typeof body !== 'object' || body === null) return null;

  for (const val of Object.values(body)) {
    if (Array.isArray(val) && val.length >= 2) return val;
  }
  return null;
}

/**
 * Normalise discovered banner JSON into ExtractedBannerSlide[].
 * Handles various key naming conventions across CMSes.
 */
export function normaliseBannerData(items: Record<string, unknown>[]): ExtractedBannerSlide[] {
  return items.map((item, i) => {
    const get = (...keys: string[]): string | null => {
      for (const k of keys) {
        const val = item[k];
        if (typeof val === 'string' && val.trim()) return val.trim();
      }
      return null;
    };

    return {
      position: i,
      headline: get('title', 'headline', 'heading', 'name', 'text', 'alt'),
      sub_headline: get('subtitle', 'sub_headline', 'subheadline', 'description', 'desc'),
      cta_text: get('cta_text', 'ctaText', 'button_text', 'buttonText', 'label'),
      cta_url: get('url', 'href', 'link', 'cta_url', 'ctaUrl', 'action'),
      image_url_desktop: get('image', 'imageUrl', 'image_url', 'img', 'src', 'media', 'banner', 'visual', 'image_url_desktop', 'desktopImage') || '',
      image_url_mobile: get('image_mobile', 'mobileImage', 'image_url_mobile', 'mobileSrc'),
      disclaimer_text: get('disclaimer', 'disclaimer_text', 'disclaimerText', 'legal'),
    };
  });
}

const BOILERPLATE_PATTERN = /menu|nav|cookie|privacy|footer|header|sign.?in|log.?in/i;

/**
 * Adjust base confidence based on banner quality signals.
 */
export function scoreBannerConfidence(
  banners: Partial<ExtractedBannerSlide>[],
  baseConfidence: number,
  previousCount: number | null,
): number {
  let score = baseConfidence;

  // Boost: all banners have both image and headline
  const allComplete = banners.every(b => b.image_url_desktop && b.headline);
  if (allComplete) score += 0.05;

  // Penalty: headlines look like nav/boilerplate
  const boilerplateCount = banners.filter(b => b.headline && BOILERPLATE_PATTERN.test(b.headline)).length;
  if (boilerplateCount > banners.length / 2) score -= 0.10;

  // Penalty: fewer than 2 banners (homepages typically have 3-9)
  if (banners.length < 2) score -= 0.20;

  // Boost: count matches previous known count (within +/-2)
  if (previousCount && Math.abs(banners.length - previousCount) <= 2) score += 0.05;

  return Math.max(0, Math.min(1, score));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/extract/banner-data-filter.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/extract/banner-data-filter.ts src/extract/banner-data-filter.test.ts
git commit -m "feat: add banner data filter with heuristic detection and confidence scoring"
```

---

### Task 3: Inline Data Extractor

**Files:**
- Create: `src/extract/inline-data.ts`
- Create: `src/extract/inline-data.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/extract/inline-data.test.ts
import { describe, test, expect } from 'vitest';
import {
  extractJsonLdBanners,
  extractNextData,
  extractNuxtData,
  extractWindowGlobals,
} from './inline-data';

describe('extractJsonLdBanners', () => {
  test('extracts ImageGallery schema', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"ImageGallery","image":[{"url":"https://img.com/1.jpg","name":"Banner 1"},{"url":"https://img.com/2.jpg","name":"Banner 2"}]}</script>
    </head><body></body></html>`;
    const result = extractJsonLdBanners(html);
    expect(result).toHaveLength(2);
    expect(result[0].headline).toBe('Banner 1');
  });

  test('returns empty for non-banner JSON-LD', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
    </head><body></body></html>`;
    expect(extractJsonLdBanners(html)).toHaveLength(0);
  });
});

describe('extractNextData', () => {
  test('extracts __NEXT_DATA__ pageProps', () => {
    const html = `<html><body>
      <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"banners":[{"title":"Hello","image":"/img.jpg"}]}}}</script>
    </body></html>`;
    const result = extractNextData(html);
    expect(result).toBeTruthy();
    expect(result.props.pageProps.banners).toHaveLength(1);
  });

  test('returns null when not present', () => {
    expect(extractNextData('<html><body></body></html>')).toBeNull();
  });
});

describe('extractNuxtData', () => {
  test('extracts Nuxt 3 __NUXT_DATA__', () => {
    const html = `<html><body>
      <script type="application/json" id="__NUXT_DATA__">{"data":{"banners":[{"title":"Slide"}]}}</script>
    </body></html>`;
    const result = extractNuxtData(html);
    expect(result).toBeTruthy();
    expect(result.data.banners).toHaveLength(1);
  });

  test('returns null when not present', () => {
    expect(extractNuxtData('<html><body></body></html>')).toBeNull();
  });
});

describe('extractWindowGlobals', () => {
  test('extracts window.__INITIAL_STATE__', () => {
    const html = `<html><body><script>window.__INITIAL_STATE__ = {"banners":[1,2,3]};</script></body></html>`;
    const result = extractWindowGlobals(html);
    expect(result['__INITIAL_STATE__']).toBeTruthy();
    expect(result['__INITIAL_STATE__'].banners).toHaveLength(3);
  });

  test('returns empty object when no globals found', () => {
    expect(extractWindowGlobals('<html><body></body></html>')).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/extract/inline-data.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/extract/inline-data.ts
import type { ExtractedBannerSlide } from '../oem/types';
import type { OemDefinition } from '../oem/registry';

export interface InlineDataResult {
  source: 'jsonld' | 'gatsby' | 'nextjs' | 'nuxt' | 'aem' | 'window_global';
  data: unknown;
  confidence: number;
}

// ── JSON-LD ──

export function extractJsonLdBanners(html: string): ExtractedBannerSlide[] {
  const results: ExtractedBannerSlide[] = [];
  const regex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      // ImageGallery with image array
      if (data['@type'] === 'ImageGallery' && Array.isArray(data.image)) {
        for (let i = 0; i < data.image.length; i++) {
          const img = data.image[i];
          results.push({
            position: i,
            headline: img.name || img.caption || null,
            sub_headline: img.description || null,
            cta_text: null,
            cta_url: img.url || null,
            image_url_desktop: img.contentUrl || img.url || '',
            image_url_mobile: null,
            disclaimer_text: null,
          });
        }
      }
      // ItemList with ListItem elements (common for carousels)
      if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
        for (let i = 0; i < data.itemListElement.length; i++) {
          const item = data.itemListElement[i];
          results.push({
            position: i,
            headline: item.name || null,
            sub_headline: item.description || null,
            cta_text: null,
            cta_url: item.url || null,
            image_url_desktop: item.image || '',
            image_url_mobile: null,
            disclaimer_text: null,
          });
        }
      }
    } catch { /* invalid JSON, skip */ }
  }
  return results;
}

// ── Next.js ──

export function extractNextData(html: string): any | null {
  const match = html.match(
    /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

// ── Nuxt ──

export function extractNuxtData(html: string): any | null {
  // Nuxt 3 pattern
  const nuxt3 = html.match(
    /<script\s+type="application\/json"\s+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (nuxt3) {
    try { return JSON.parse(nuxt3[1]); } catch { /* continue */ }
  }

  // Nuxt 2 pattern (window.__NUXT__)
  const nuxt2 = html.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (nuxt2) {
    try { return JSON.parse(nuxt2[1]); } catch { return null; }
  }
  return null;
}

// ── Gatsby ──

export async function fetchGatsbyPageData(pageUrl: string): Promise<any | null> {
  try {
    const url = new URL(pageUrl);
    const slug = url.pathname === '/' ? 'index' : url.pathname.replace(/^\/|\/$/g, '');
    const dataUrl = `${url.origin}/page-data/${slug}/page-data.json`;
    const res = await fetch(dataUrl);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.result?.data || data?.result?.pageContext || null;
  } catch { return null; }
}

// ── AEM ──

export async function fetchAemModelJson(pageUrl: string): Promise<any | null> {
  try {
    // AEM exposes .model.json for content fragments
    const modelUrl = pageUrl.replace(/\/$/, '') + '.model.json';
    const res = await fetch(modelUrl);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Window Globals ──

const GLOBAL_PATTERNS: [string, RegExp][] = [
  ['__INITIAL_STATE__', /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/],
  ['__DATA__', /window\.__DATA__\s*=\s*(\{[\s\S]*?\});/],
  ['__PRELOADED_STATE__', /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/],
  ['pageData', /window\.pageData\s*=\s*(\{[\s\S]*?\});/],
];

export function extractWindowGlobals(html: string): Record<string, any> {
  const results: Record<string, any> = {};
  for (const [name, pattern] of GLOBAL_PATTERNS) {
    const m = html.match(pattern);
    if (m) {
      try { results[name] = JSON.parse(m[1]); } catch { /* not valid JSON */ }
    }
  }
  return results;
}

// ── Orchestrator: run all extractors for an OEM ──

export async function extractInlineData(
  html: string,
  oemDef: OemDefinition,
  pageUrl: string,
): Promise<InlineDataResult[]> {
  const results: InlineDataResult[] = [];

  // JSON-LD (all frameworks)
  const jsonLd = extractJsonLdBanners(html);
  if (jsonLd.length) {
    results.push({ source: 'jsonld', data: jsonLd, confidence: 0.90 });
  }

  // Gatsby
  if (oemDef.flags.isGatsby) {
    const gatsbyData = await fetchGatsbyPageData(pageUrl);
    if (gatsbyData) results.push({ source: 'gatsby', data: gatsbyData, confidence: 0.85 });
  }

  // Next.js
  if (oemDef.flags.isNextJs) {
    const nextData = extractNextData(html);
    if (nextData) results.push({ source: 'nextjs', data: nextData, confidence: 0.85 });
  }

  // Nuxt
  if (oemDef.flags.framework === 'nuxt') {
    const nuxtData = extractNuxtData(html);
    if (nuxtData) results.push({ source: 'nuxt', data: nuxtData, confidence: 0.85 });
  }

  // AEM
  if (oemDef.flags.isAEM) {
    const aemData = await fetchAemModelJson(pageUrl);
    if (aemData) results.push({ source: 'aem', data: aemData, confidence: 0.85 });
  }

  // Generic window globals
  const globals = extractWindowGlobals(html);
  if (Object.keys(globals).length) {
    results.push({ source: 'window_global', data: globals, confidence: 0.70 });
  }

  return results;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/extract/inline-data.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/extract/inline-data.ts src/extract/inline-data.test.ts
git commit -m "feat: add inline data extractor for JSON-LD, Next.js, Nuxt, Gatsby, AEM, globals"
```

---

### Task 4: Selector Override Lookup in Extraction Engine

**Files:**
- Modify: `src/extract/engine.ts:173-185`

- [ ] **Step 1: Add `selectorOverrides` parameter to `extractWithSelectors`**

In `src/extract/engine.ts`, change the function signature at line 173 to accept optional overrides:

```typescript
export function extractWithSelectors(
  html: string,
  oemId: string,
  pageType: string,
  selectorOverrides?: Record<string, string>,
): {
  products: ExtractedProduct[];
  offers: ExtractedOffer[];
  bannerSlides: ExtractedBannerSlide[];
  discoveredUrls: string[];
} {
  const $ = cheerio.load(html);
  const oemDef = getOemDefinition(oemId as any);
  const registrySelectors = oemDef?.selectors || {};

  // Runtime overrides take precedence over registry selectors
  const selectors = selectorOverrides
    ? { ...registrySelectors, ...selectorOverrides }
    : registrySelectors;
```

The key change: rename `selectors` on line 185 to `registrySelectors`, then merge with overrides.

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx vitest run src/extract/`
Expected: All existing extraction tests PASS (no signature change for callers that don't pass overrides).

- [ ] **Step 3: Commit**

```bash
git add src/extract/engine.ts
git commit -m "feat: extractWithSelectors accepts runtime selector overrides"
```

---

### Task 5: Banner Extraction Failure Detection in Orchestrator

**Files:**
- Modify: `src/orchestrator.ts:3304-3321`

- [ ] **Step 1: Add failure detection after banner processing block**

After the existing banner processing block at line 3321, add the failure detection. Find this code:

```typescript
    // Process banners
    if (extractionResult.bannerSlides?.data) {
```

After the closing `}` of that block (line 3321), add:

```typescript
    // Detect banner extraction failure for homepage crawls
    if (
      page.page_type === 'homepage' &&
      (!extractionResult.bannerSlides?.data || extractionResult.bannerSlides.data.length === 0)
    ) {
      // Check if this OEM previously had banners
      const { count: previousBannerCount } = await this.supabase
        .from('banners')
        .select('id', { count: 'exact', head: true })
        .eq('oem_id', oemId);

      if (previousBannerCount && previousBannerCount > 0) {
        // Dedup: check if event already exists in last 24h
        const { count: recentEventCount } = await this.supabase
          .from('change_events')
          .select('id', { count: 'exact', head: true })
          .eq('oem_id', oemId)
          .eq('event_type', 'banner_extraction_failed')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (!recentEventCount) {
          console.log(`[Orchestrator] Banner extraction returned 0 for ${oemId} homepage (previously had ${previousBannerCount}). Emitting banner_extraction_failed event.`);
          await this.supabase.from('change_events').insert({
            id: crypto.randomUUID(),
            entity_type: 'banner',
            entity_id: null,
            oem_id: oemId,
            event_type: 'banner_extraction_failed',
            severity: 'high',
            summary: `Banner extraction returned 0 results for ${oemId} homepage (previously had ${previousBannerCount} banners)`,
            diff_json: {
              selector_used: extractionResult.bannerSlides?.method || 'none',
              page_url: page.url,
              previous_banner_count: previousBannerCount,
            },
            created_at: new Date().toISOString(),
          });
        }
      }
    }
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc --noEmit 2>&1 | grep -c "banner-triage\|processChanges"`
Expected: 0 (no new errors from our changes).

- [ ] **Step 3: Commit**

```bash
git add src/orchestrator.ts
git commit -m "feat: detect banner extraction failures and emit change events"
```

---

### Task 6: Crawl Doctor Banner Staleness Check

**Files:**
- Modify: `src/sync/crawl-doctor.ts:18-28` (DoctorResult interface)
- Modify: `src/sync/crawl-doctor.ts:326-328` (add Step 7)

- [ ] **Step 1: Add `banners_stale` to DoctorResult**

In `src/sync/crawl-doctor.ts`, add `banners_stale: number` to the `DoctorResult` interface after `price_anomalies`:

```typescript
export interface DoctorResult {
  timestamp: string;
  pages_reset: number;
  pages_deactivated: number;
  hashes_seeded: number;
  crawls_triggered: number;
  offers_expired: number;
  offers_archived: number;
  price_anomalies: number;
  banners_stale: number;
  diagnoses: Diagnosis[];
}
```

- [ ] **Step 2: Add Step 7 before the Slack report**

Find line 329 (`// ── Step 6: Send diagnosis report to Slack ──`). Insert the banner staleness check BEFORE it:

```typescript
  // ── Step 7: Detect stale banners (>72h since last_seen_at) ──
  let bannersStale = 0;
  const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();

  const { data: recentBanners } = await supabase
    .from('banners')
    .select('oem_id, last_seen_at')
    .order('last_seen_at', { ascending: false });

  if (recentBanners && recentBanners.length > 0) {
    // Group by OEM, find max last_seen_at per OEM
    const oemLastSeen: Record<string, string> = {};
    for (const b of recentBanners) {
      if (!oemLastSeen[b.oem_id] || b.last_seen_at > oemLastSeen[b.oem_id]) {
        oemLastSeen[b.oem_id] = b.last_seen_at;
      }
    }

    for (const [oemId, lastSeen] of Object.entries(oemLastSeen)) {
      if (lastSeen < seventyTwoHoursAgo) {
        const hoursStale = Math.round((now.getTime() - new Date(lastSeen).getTime()) / (60 * 60 * 1000));
        bannersStale++;

        // Check if triage event already exists in last 24h
        const { count: recentTriageCount } = await supabase
          .from('change_events')
          .select('id', { count: 'exact', head: true })
          .eq('oem_id', oemId)
          .eq('event_type', 'banner_extraction_failed')
          .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());

        if (!recentTriageCount) {
          await supabase.from('change_events').insert({
            id: crypto.randomUUID(),
            entity_type: 'banner',
            entity_id: null,
            oem_id: oemId,
            event_type: 'banner_extraction_failed',
            severity: 'medium',
            summary: `Banners stale for ${oemId}: last seen ${hoursStale}h ago`,
            diff_json: { trigger: 'crawl_doctor_staleness', hours_stale: hoursStale },
            created_at: now.toISOString(),
          });

          diagnoses.push({
            oem_id: oemId,
            issue: `Banners stale for ${hoursStale}h — emitted banner_extraction_failed event`,
            action: 'Banner triage agent will attempt self-healing',
            result: 'flagged',
          });
        }
      }
    }
    if (bannersStale > 0) {
      console.log(`[CrawlDoctor] Step 7: ${bannersStale} OEMs with stale banners (>72h)`);
    }
  }
```

- [ ] **Step 3: Update the result object**

In the result construction at line 372, add `banners_stale: bannersStale`:

```typescript
  const result: DoctorResult = {
    timestamp: now.toISOString(),
    pages_reset: pagesReset,
    pages_deactivated: pagesDeactivated,
    hashes_seeded: hashesSeeded,
    crawls_triggered: crawlsTriggered,
    offers_expired: offersExpired,
    offers_archived: offersArchived,
    price_anomalies: priceAnomalies,
    banners_stale: bannersStale,
    diagnoses,
  };
```

- [ ] **Step 4: Commit**

```bash
git add src/sync/crawl-doctor.ts
git commit -m "feat: Crawl Doctor detects stale banners and emits triage events"
```

---

### Task 7: Banner Triage Cascade

**Files:**
- Create: `src/sync/banner-triage.ts`

- [ ] **Step 1: Write the 5-layer cascade**

```typescript
// src/sync/banner-triage.ts
/**
 * Banner Triage Agent — 5-layer discovery cascade.
 *
 * Triggered by `banner_extraction_failed` change events.
 * Discovers the correct banner data source and upserts banners.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OemId } from '../oem/types';
import type { ExtractedBannerSlide } from '../oem/types';
import { getOemDefinition } from '../oem/registry';
import { isBannerData, normaliseBannerData, scoreBannerConfidence } from '../extract/banner-data-filter';
import { extractInlineData } from '../extract/inline-data';

export interface TriageResult {
  success: boolean;
  confidence: number;
  layer_used: number | null;
  banners_found: number;
  actions_taken: string[];
  reasoning: string;
  layer_results: Record<string, { status: string; confidence: number; detail?: string }>;
  execution_time_ms: number;
  cost_usd: number;
}

interface TriageContext {
  oemId: OemId;
  pageUrl: string;
  previousBannerCount: number;
  oldSelector: string | null;
  supabase: SupabaseClient;
  slackWebhookUrl?: string;
  aiRouter?: { route: (req: any) => Promise<any> };
}

export async function executeBannerTriage(ctx: TriageContext): Promise<TriageResult> {
  const startTime = Date.now();
  const oemDef = getOemDefinition(ctx.oemId);
  if (!oemDef) {
    return makeResult(false, 0, null, 0, [], `OEM ${ctx.oemId} not found in registry`, {}, startTime);
  }

  const layerResults: Record<string, { status: string; confidence: number; detail?: string }> = {};
  let bestBanners: ExtractedBannerSlide[] = [];
  let bestConfidence = 0;
  let bestLayer = 0;
  const actions: string[] = [];

  // ── Layer 1: Discovered APIs ──
  try {
    const { data: apis } = await ctx.supabase
      .from('discovered_apis')
      .select('url, method, data_type, confidence')
      .eq('oem_id', ctx.oemId)
      .in('data_type', ['banners', 'hero', 'carousel', 'homepage'])
      .gte('confidence', 0.5)
      .order('confidence', { ascending: false })
      .limit(3);

    if (apis && apis.length > 0) {
      for (const api of apis) {
        try {
          const res = await fetch(api.url);
          if (!res.ok) continue;
          const body = await res.json();
          if (isBannerData(api.url, body)) {
            const items = Array.isArray(body) ? body : Object.values(body).find(v => Array.isArray(v)) as any[];
            if (items) {
              const banners = normaliseBannerData(items);
              const confidence = scoreBannerConfidence(banners, 0.95, ctx.previousBannerCount);
              if (confidence > bestConfidence) {
                bestBanners = banners;
                bestConfidence = confidence;
                bestLayer = 1;
              }
              layerResults.layer_1 = { status: 'success', confidence, detail: api.url };
            }
          }
        } catch { /* API fetch failed, continue */ }
      }
    }
    if (!layerResults.layer_1) {
      layerResults.layer_1 = { status: 'no_apis_found', confidence: 0 };
    }
  } catch (e) {
    layerResults.layer_1 = { status: 'error', confidence: 0, detail: String(e) };
  }

  // ── Layer 2: Network Interception (placeholder — requires CF Browser runtime) ──
  // In production, this calls renderPageSmartMode() and filters apiCandidates.
  // For now, skip if not in Worker environment.
  layerResults.layer_2 = { status: 'skipped', confidence: 0, detail: 'Requires CF Browser runtime' };

  // ── Layer 3: Inline Data Extraction ──
  try {
    // Cheap fetch to get HTML
    const res = await fetch(ctx.pageUrl);
    if (res.ok) {
      const html = await res.text();
      const inlineResults = await extractInlineData(html, oemDef, ctx.pageUrl);

      for (const result of inlineResults) {
        // Try to find banner data in the extracted inline data
        const data = result.data;
        if (Array.isArray(data) && data.length >= 2) {
          // Direct array of banner slides (e.g., from JSON-LD)
          const banners = data as ExtractedBannerSlide[];
          const confidence = scoreBannerConfidence(banners, result.confidence, ctx.previousBannerCount);
          if (confidence > bestConfidence) {
            bestBanners = banners;
            bestConfidence = confidence;
            bestLayer = 3;
          }
          layerResults.layer_3 = { status: 'success', confidence, detail: result.source };
          break;
        }

        // Search nested data for banner-like arrays
        if (typeof data === 'object' && data !== null) {
          const found = findBannerArrayInObject(data);
          if (found) {
            const banners = normaliseBannerData(found);
            const confidence = scoreBannerConfidence(banners, result.confidence, ctx.previousBannerCount);
            if (confidence > bestConfidence) {
              bestBanners = banners;
              bestConfidence = confidence;
              bestLayer = 3;
            }
            layerResults.layer_3 = { status: 'success', confidence, detail: result.source };
            break;
          }
        }
      }

      if (!layerResults.layer_3) {
        layerResults.layer_3 = { status: 'no_banner_data', confidence: 0 };
      }
    }
  } catch (e) {
    layerResults.layer_3 = { status: 'error', confidence: 0, detail: String(e) };
  }

  // ── Layer 4: AI Selector Discovery ──
  if (bestConfidence < 0.7 && ctx.aiRouter) {
    try {
      const res = await fetch(ctx.pageUrl);
      if (res.ok) {
        const html = await res.text();
        const cleanedHtml = cleanHtmlForLlm(html);

        const prompt = `You are a web scraping expert analyzing an automotive OEM homepage.

OEM: ${oemDef.name} (${oemDef.baseUrl})
Framework: ${oemDef.flags.framework || 'unknown'}
Previous selector (now broken): ${ctx.oldSelector || 'none'}

Find CSS selectors for the hero banner carousel. The page typically has 3-9 rotating banner slides, each with an image, optional headline, and link.

HTML fragment:
\`\`\`html
${cleanedHtml}
\`\`\`

Return ONLY valid JSON (no markdown):
{"container_selector":"CSS selector for each carousel slide","headline_selector":"selector within slide for headline (or null)","headline_from_alt":true,"image_selector":"img","cta_selector":"a","confidence":0.8,"reasoning":"brief explanation","slide_count":5}`;

        const aiResult = await ctx.aiRouter.route({
          taskType: 'llm_extraction',
          prompt,
          responseFormat: 'json',
        });

        if (aiResult?.content) {
          const parsed = JSON.parse(typeof aiResult.content === 'string' ? aiResult.content : JSON.stringify(aiResult.content));
          if (parsed.container_selector) {
            // Validate: run selector against HTML with cheerio
            const cheerio = await import('cheerio');
            const $ = cheerio.load(html);
            const matches = $(parsed.container_selector);

            if (matches.length >= 2) {
              // Extract banners using discovered selectors
              const banners: ExtractedBannerSlide[] = [];
              matches.each((i: number, el: any) => {
                const $el = $(el);
                const headlineText = parsed.headline_selector
                  ? $el.find(parsed.headline_selector).first().text().trim()
                  : null;
                banners.push({
                  position: i,
                  headline: headlineText || (parsed.headline_from_alt ? $el.find('img[alt]').first().attr('alt')?.trim() || null : null),
                  sub_headline: null,
                  cta_text: $el.find(parsed.cta_selector || 'a').first().text().trim() || null,
                  cta_url: $el.find(parsed.cta_selector || 'a').first().attr('href') || null,
                  image_url_desktop: $el.find(parsed.image_selector || 'img').first().attr('src') || '',
                  image_url_mobile: null,
                  disclaimer_text: null,
                });
              });

              const confidence = scoreBannerConfidence(banners, 0.75, ctx.previousBannerCount);
              if (confidence > bestConfidence) {
                bestBanners = banners;
                bestConfidence = confidence;
                bestLayer = 4;
              }

              // Store selector override
              await ctx.supabase.from('selector_overrides').upsert({
                oem_id: ctx.oemId,
                page_type: 'homepage',
                selector_type: 'heroSlides',
                selector_value: parsed.container_selector,
                metadata: {
                  headline_selector: parsed.headline_selector,
                  headline_from_alt: parsed.headline_from_alt,
                  image_selector: parsed.image_selector,
                  cta_selector: parsed.cta_selector,
                  reasoning: parsed.reasoning,
                },
                confidence,
                discovered_by: 'banner-triage',
                validated_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              }, { onConflict: 'oem_id,page_type,selector_type' });

              actions.push('store_selector_override');
              layerResults.layer_4 = { status: 'success', confidence, detail: parsed.container_selector };
            } else {
              layerResults.layer_4 = { status: 'selector_invalid', confidence: 0, detail: `${matches.length} matches (need >= 2)` };
            }
          }
        }
      }
    } catch (e) {
      layerResults.layer_4 = { status: 'error', confidence: 0, detail: String(e) };
    }
  } else {
    layerResults.layer_4 = { status: bestConfidence >= 0.7 ? 'skipped' : 'no_ai_router', confidence: 0 };
  }

  // ── Upsert banners if confidence >= 0.7 ──
  if (bestConfidence >= 0.7 && bestBanners.length > 0) {
    for (const banner of bestBanners) {
      await upsertBanner(ctx.supabase, ctx.oemId, ctx.pageUrl, banner);
    }
    actions.push('upsert_banners');
    actions.push('log_result');
  }

  // ── Layer 5: Escalation ──
  if (bestConfidence < 0.7) {
    layerResults.layer_5 = { status: 'escalated', confidence: 0 };
    if (ctx.slackWebhookUrl) {
      const layerSummary = Object.entries(layerResults)
        .map(([k, v]) => `  ${k}: ${v.status} (${v.confidence.toFixed(2)})${v.detail ? ` — ${v.detail}` : ''}`)
        .join('\n');

      await fetch(ctx.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `:rotating_light: Banner Triage Failed: ${ctx.oemId}\n\nLayers attempted:\n${layerSummary}\n\nPage: ${ctx.pageUrl}\nPrevious banners: ${ctx.previousBannerCount}`,
        }),
      }).catch(() => {});
    }
  } else {
    layerResults.layer_5 = { status: 'not_needed', confidence: 0 };
  }

  return makeResult(
    bestConfidence >= 0.7,
    bestConfidence,
    bestLayer || null,
    bestBanners.length,
    actions,
    bestLayer ? `Layer ${bestLayer} found ${bestBanners.length} banners` : 'All layers failed',
    layerResults,
    startTime,
  );
}

// ── Helpers ──

function makeResult(
  success: boolean, confidence: number, layer: number | null, count: number,
  actions: string[], reasoning: string, layers: Record<string, any>, startTime: number,
): TriageResult {
  return {
    success, confidence, layer_used: layer, banners_found: count,
    actions_taken: actions, reasoning, layer_results: layers,
    execution_time_ms: Date.now() - startTime,
    cost_usd: layer === 4 ? 0.005 : layer === 2 ? 0.002 : 0,
  };
}

function findBannerArrayInObject(obj: unknown, depth = 0): Record<string, unknown>[] | null {
  if (depth > 3 || typeof obj !== 'object' || obj === null) return null;

  for (const val of Object.values(obj)) {
    if (Array.isArray(val) && val.length >= 2 && typeof val[0] === 'object' && val[0] !== null) {
      const keys = Object.keys(val[0]).map(k => k.toLowerCase());
      const hasImage = keys.some(k => /image|img|src|photo|media|banner/.test(k));
      const hasText = keys.some(k => /title|heading|headline|name|text/.test(k));
      if (hasImage && hasText) return val as Record<string, unknown>[];
    }
    const nested = findBannerArrayInObject(val, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function cleanHtmlForLlm(html: string): string {
  // Extract <main> or first large <section>
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  let fragment = mainMatch ? mainMatch[1] : html;

  // Fallback: first 5 <section> elements
  if (!mainMatch) {
    const sections = fragment.match(/<section[^>]*>[\s\S]*?<\/section>/gi);
    if (sections) fragment = sections.slice(0, 5).join('\n');
  }

  // Strip noise
  fragment = fragment
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/\s*data-emotion="[^"]*"/g, '')
    .replace(/\s*data-testid="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Truncate to ~8K chars (~2K tokens)
  return fragment.slice(0, 8000);
}

async function upsertBanner(
  supabase: SupabaseClient, oemId: OemId, pageUrl: string, slide: ExtractedBannerSlide,
): Promise<void> {
  const { data: existing } = await supabase
    .from('banners')
    .select('id')
    .eq('oem_id', oemId)
    .eq('page_url', pageUrl)
    .eq('position', slide.position)
    .maybeSingle();

  const now = new Date().toISOString();
  const record = {
    oem_id: oemId,
    page_url: pageUrl,
    position: slide.position,
    headline: slide.headline,
    sub_headline: slide.sub_headline,
    cta_text: slide.cta_text,
    cta_url: slide.cta_url,
    image_url_desktop: slide.image_url_desktop,
    image_url_mobile: slide.image_url_mobile,
    disclaimer_text: slide.disclaimer_text,
    last_seen_at: now,
    updated_at: now,
  };

  if (existing) {
    await supabase.from('banners').update(record).eq('id', existing.id);
  } else {
    await supabase.from('banners').insert({ id: crypto.randomUUID(), ...record, created_at: now });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep banner-triage`
Expected: No errors from banner-triage.ts (pre-existing errors elsewhere are OK).

- [ ] **Step 3: Commit**

```bash
git add src/sync/banner-triage.ts
git commit -m "feat: banner triage agent with 5-layer discovery cascade"
```

---

### Task 8: Register Skill in Cron Router

**Files:**
- Modify: `src/routes/cron.ts:353-359`

- [ ] **Step 1: Add the banner-triage case**

After the `crawl-doctor` case (line 359), add:

```typescript
      case 'banner-triage': {
        const { executeBannerTriage } = await import('../sync/banner-triage');
        const { createSupabaseClient: createSbTriage } = await import('../utils/supabase');
        const sbTriage = createSbTriage({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });

        // Parse trigger context from job config or manual invocation
        const oemId = (job.config as any)?.oem_id || 'ldv-au';
        const pageUrl = (job.config as any)?.page_url || getOemDefinition(oemId)?.baseUrl || '';

        const { count: prevCount } = await sbTriage
          .from('banners')
          .select('id', { count: 'exact', head: true })
          .eq('oem_id', oemId);

        result = await executeBannerTriage({
          oemId,
          pageUrl,
          previousBannerCount: prevCount || 0,
          oldSelector: getOemDefinition(oemId)?.selectors?.heroSlides || null,
          supabase: sbTriage,
          slackWebhookUrl: env.SLACK_WEBHOOK_URL,
        }) as unknown as Record<string, unknown>;
        break;
      }
```

- [ ] **Step 2: Add the import at the top of the case**

The `getOemDefinition` import is needed. Check if it's already imported at the top of `cron.ts`. If not, add:

```typescript
import { getOemDefinition } from '../oem/registry';
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep cron.ts | head -5`
Expected: No new errors from our changes.

- [ ] **Step 4: Commit**

```bash
git add src/routes/cron.ts
git commit -m "feat: register banner-triage skill in cron router"
```

---

### Task 9: Manual Smoke Test

- [ ] **Step 1: Test banner-triage against LDV locally**

Use the cron dashboard or curl to trigger manually:

```bash
curl -X POST "https://oem-agent.paulgiurin.workers.dev/cron/run/banner-triage" \
  -H "Content-Type: application/json" \
  -d '{"config":{"oem_id":"ldv-au","page_url":"https://www.ldvautomotive.com.au/"}}'
```

Expected: Returns JSON with `success: true`, `layer_used: 3` (Gatsby inline data), `banners_found: 9`.

- [ ] **Step 2: Verify banners updated in database**

```bash
# Query via Supabase dashboard or API
curl -s "$SUPABASE_URL/rest/v1/banners?oem_id=eq.ldv-au&select=headline,position,updated_at&order=position&limit=10" \
  -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
```

Expected: 9 banners with recent `updated_at` timestamps.

- [ ] **Step 3: Test Layer 4 (AI discovery) by simulating broken selector**

Temporarily set LDV's `heroSlides` to a broken selector and trigger triage. Layer 3 should still catch it via Gatsby page-data.json. If you also remove the `isGatsby` flag, Layer 4 (AI) should activate.

- [ ] **Step 4: Commit docs update**

```bash
git add docs/superpowers/specs/2026-04-02-banner-triage-agent-design.md
git add docs/superpowers/plans/2026-04-02-banner-triage-agent.md
git add skills/autonomous-agents/banner-triage/SKILL.md
git add config/openclaw/cron-jobs.json
git add docs/AUTONOMOUS_AGENT_WORKFLOWS.md
git add AGENTS.md
git commit -m "docs: banner triage agent spec, plan, skill definition, and workflow docs"
```
