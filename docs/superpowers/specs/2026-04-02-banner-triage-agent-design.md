# Banner Triage Agent — Design Spec

> Autonomous AI agent that detects broken banner extraction, discovers the correct data source via a 5-layer cascade, and self-heals without human intervention.

**Date**: 2026-04-02
**Status**: Design approved
**Trigger**: LDV banner selectors broke silently (CSS `[class*="hero"]` is case-sensitive, i-motor Gatsby uses `Hero`). VW, GMSV, Subaru banners also stale (>7 days). No system detected or repaired these failures.

---

## Problem Statement

Banner extraction uses hardcoded CSS selectors per OEM (`registry.ts` → `heroSlides`). When OEM sites redesign or use non-standard class names, extraction silently returns 0 results. The system cannot distinguish "page has no banners" from "selector is broken." No autonomous repair exists.

**Current failure mode**: Selector breaks → extraction returns `method: 'none'` → `processChanges()` skips banner upsert → banners go stale indefinitely → nobody notices until manual review.

**Impact**: 4 of 18 OEMs had stale banners (VW 14 days, GMSV 9 days, Subaru 4 days, LDV 2 days) before manual discovery on Apr 2.

---

## Design Principles

1. **Data source > selector**: APIs and structured JSON change less than HTML. Discover the data source, not just a new CSS selector.
2. **Event-driven with safety net**: Zero cost when things work. Immediate response when they break. Weekly audit catches anything missed.
3. **Follow existing patterns**: Same agent structure as `price-validator`, `product-enricher`, etc. Same OpenClaw skill format. Same cron-jobs.json config.
4. **Confidence-scored fallback chain**: Each layer has a confidence score. Highest-confidence result wins. Low confidence → escalate.
5. **Runtime overrides, not redeployment**: Store discovered selectors/APIs in Supabase, not code. The extraction engine reads overrides first.

---

## Architecture

### Trigger System

#### Event-Driven Trigger (primary)

In `orchestrator.ts` → `processChanges()`, after CSS extraction returns 0 banner slides for a homepage/offers crawl:

```typescript
// After banner extraction returns empty
if (
  pageType === 'homepage' &&
  (!extractionResult.bannerSlides?.data || extractionResult.bannerSlides.data.length === 0)
) {
  // Check if this OEM previously had banners
  const { count } = await supabase
    .from('banners')
    .select('id', { count: 'exact', head: true })
    .eq('oem_id', oemId);

  if (count && count > 0) {
    // Selector likely broken — emit change event
    await supabase.from('change_events').insert({
      id: crypto.randomUUID(),
      entity_type: 'banner',
      entity_id: oemId,
      oem_id: oemId,
      event_type: 'banner_extraction_failed',
      severity: 'high',
      summary: `Banner extraction returned 0 results for ${oemId} homepage (previously had ${count} banners)`,
      source_url: page.url,
      metadata: {
        selector_used: selectors.heroSlides,
        page_url: page.url,
        html_length: html.length,
        previous_banner_count: count,
      },
      created_at: new Date().toISOString(),
    });
  }
}
```

**Dedup**: Before inserting, check if a `banner_extraction_failed` event already exists for this OEM in the last 24h.

#### Safety Net Trigger (weekly via Crawl Doctor)

Add a banner staleness check to `crawl-doctor.ts`:

```typescript
// Step N: Detect stale banners
const { data: staleBanners } = await supabase
  .rpc('banner_staleness_by_oem'); // Returns OEMs where max(last_seen_at) > 72h ago

for (const oem of staleBanners ?? []) {
  // Check if triage already ran recently
  const { count: recentTriageCount } = await supabase
    .from('change_events')
    .select('id', { count: 'exact', head: true })
    .eq('oem_id', oem.oem_id)
    .eq('event_type', 'banner_extraction_failed')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (!recentTriageCount) {
    await supabase.from('change_events').insert({
      id: crypto.randomUUID(),
      entity_type: 'banner',
      entity_id: oem.oem_id,
      oem_id: oem.oem_id,
      event_type: 'banner_extraction_failed',
      severity: 'medium',
      summary: `Banners stale for ${oem.oem_id}: last seen ${oem.hours_stale}h ago (${oem.banner_count} banners)`,
      metadata: { trigger: 'crawl_doctor_staleness', hours_stale: oem.hours_stale },
      created_at: new Date().toISOString(),
    });
  }
}
```

#### Not Triggered When

- OEM has never had banners (no rows in `banners` table for that `oem_id`)
- Page type is not `homepage` or `offers` (vehicle pages don't always have carousels)
- Agent already ran for this OEM in the last 24h (dedup via `change_events`)
- OEM is newly onboarded (< 7 days since first crawl)

---

### 5-Layer Discovery Cascade

When the banner-triage agent is spawned, it executes these layers in order. First layer to return results with confidence >= 0.7 wins. All layers run regardless to build a complete picture for future runs.

#### Layer 1: Discovered APIs (confidence: 0.95)

Check the `discovered_apis` table for existing endpoints tagged as banner/carousel data.

```
Query: SELECT * FROM discovered_apis
  WHERE oem_id = :oemId
  AND data_type IN ('banners', 'hero', 'carousel', 'homepage')
  AND confidence >= 0.5
  ORDER BY confidence DESC
```

If found, fetch the API directly and parse the JSON response. Banner-like data is identified by arrays of objects containing image + title/headline + link/url fields.

**When this works**: OEMs with CMS APIs (Storyblok, Contentful, AEM .data endpoints), sites where Smart Mode previously discovered APIs during page rendering.

**Cost**: ~$0 (HTTP fetch only).

#### Layer 2: Network Interception via Smart Mode (confidence: 0.90)

Render the page using Cloudflare Browser (NOT Lightpanda — Lightpanda doesn't support network interception). Capture all JSON responses during page load.

Uses existing `renderPageSmartMode()` which already:
- Enables request interception via Puppeteer
- Captures XHR/fetch responses
- Runs `analyzeApiCandidates()` with confidence scoring

**Enhancement**: Add a `bannerDataFilter()` to the existing `analyzeApiCandidates()` pipeline:

```typescript
function isBannerData(url: string, body: unknown): boolean {
  // URL heuristics
  const bannerUrlPatterns = [
    /banner/i, /hero/i, /carousel/i, /slider/i,
    /promo/i, /campaign/i, /spotlight/i, /featured/i,
    /slide/i, /kv/i, // "key visual"
  ];
  if (bannerUrlPatterns.some(p => p.test(url))) return true;

  // Structural heuristics: array of objects with image+title+link
  const arr = Array.isArray(body) ? body :
    (typeof body === 'object' && body !== null
      ? Object.values(body).find(v => Array.isArray(v))
      : null);

  if (Array.isArray(arr) && arr.length >= 2) {
    const sample = arr[0];
    if (typeof sample === 'object' && sample !== null) {
      const keys = Object.keys(sample).map(k => k.toLowerCase());
      const hasImage = keys.some(k => /image|img|src|photo|media|banner|visual/.test(k));
      const hasText = keys.some(k => /title|heading|headline|name|text|alt/.test(k));
      const hasLink = keys.some(k => /link|url|href|cta|action/.test(k));
      return hasImage && (hasText || hasLink);
    }
  }
  return false;
}
```

If banner API discovered, store to `discovered_apis` with `data_type: 'banners'` for Layer 1 on future runs.

**When this works**: SPAs (Subaru, GMSV), sites that load banner data via XHR after initial HTML.

**Cost**: 1 browser render (~$0.002 via CF Browser).

#### Layer 3: Inline Data Extraction (confidence: 0.85)

Parse the HTML (from Layer 2 render or cheap fetch) for embedded structured data. Framework-aware based on `registry.ts` flags.

| Framework | Flag | Extraction Method |
|-----------|------|-------------------|
| Gatsby | `isGatsby` | Fetch `/{path}/page-data.json`, parse `result.data` |
| Next.js (Pages) | `isNextJs` | Extract `<script id="__NEXT_DATA__">`, parse `.props.pageProps` |
| Next.js (App) | `isNextJs` | Extract `self.__next_f.push()` flight data chunks |
| Nuxt 2 | framework=`nuxt` | Extract `window.__NUXT__` from `<script>` |
| Nuxt 3 | framework=`nuxt` | Extract `<script id="__NUXT_DATA__">` |
| AEM | `isAEM` | Fetch `.model.json` or `.data` endpoints |
| Generic | — | JSON-LD `<script type="application/ld+json">`, `window.__INITIAL_STATE__`, `window.__DATA__` |

**Extraction function**:

```typescript
interface InlineDataResult {
  source: 'jsonld' | 'gatsby' | 'nextjs' | 'nuxt' | 'aem' | 'window_global';
  data: unknown;
  confidence: number;
}

async function extractInlineData(
  html: string,
  oemDef: OemDefinition,
  pageUrl: string
): Promise<InlineDataResult[]> {
  const results: InlineDataResult[] = [];

  // JSON-LD (all frameworks)
  const jsonLd = extractJsonLdBanners(html);
  if (jsonLd.length) results.push({ source: 'jsonld', data: jsonLd, confidence: 0.90 });

  // Framework-specific
  if (oemDef.flags.isGatsby) {
    const gatsbyData = await fetchGatsbyPageData(pageUrl);
    if (gatsbyData) results.push({ source: 'gatsby', data: gatsbyData, confidence: 0.85 });
  }

  if (oemDef.flags.isNextJs) {
    const nextData = extractNextData(html) || extractNextFlightData(html);
    if (nextData) results.push({ source: 'nextjs', data: nextData, confidence: 0.85 });
  }

  if (oemDef.flags.framework === 'nuxt') {
    const nuxtData = extractNuxtData(html);
    if (nuxtData) results.push({ source: 'nuxt', data: nuxtData, confidence: 0.85 });
  }

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

**When this works**: All SSR sites (16 of 18 OEMs), Gatsby sites (LDV), Nuxt sites (GWM, GAC).

**Cost**: ~$0 (HTML parsing + 1 HTTP fetch for Gatsby/AEM).

#### Layer 4: AI Selector Discovery (confidence: 0.75)

Send a cleaned HTML fragment to a cheap LLM to discover new CSS selectors. Only triggered if Layers 1-3 didn't find banner data.

**HTML Cleaning** (before sending to LLM):
1. Extract only `<main>` or first `<section>` elements (reduce to ~2K tokens)
2. Strip `<style>`, `<svg>` inline data, `<script>` contents, tracking pixels
3. Remove `data-emotion`, `data-testid`, and other framework noise
4. Collapse whitespace

**Prompt**:
```
You are a web scraping expert analyzing an automotive OEM homepage.

OEM: {oem_name} ({base_url})
Framework: {framework}
Previous selector (now broken): {old_selector}

Find CSS selectors for the hero banner carousel. The page typically has 3-9 rotating banner slides, each with an image, optional headline, and link.

HTML fragment:
```html
{cleaned_html}
```

Return JSON:
{
  "container_selector": "selector for each carousel slide item",
  "headline_selector": "selector within slide for headline text (or null if headline is in img alt)",
  "headline_from_alt": true/false,
  "image_selector": "selector within slide for image",
  "cta_selector": "selector within slide for CTA link",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "slide_count": number
}
```

**Model**: Llama 4 Scout 17B via Groq ($0.11/M tokens). Fallback: Gemini 2.5 Pro.

**Validation**: Run discovered selectors against the same HTML with cheerio. If they return the expected `slide_count` results (within +/-2), accept. Otherwise, re-prompt once with error feedback.

**Storage**: If validated, insert into `selector_overrides` table (new table):

```sql
CREATE TABLE selector_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  page_type TEXT NOT NULL DEFAULT 'homepage',
  selector_type TEXT NOT NULL, -- 'heroSlides', 'offerTiles', etc.
  selector_value TEXT NOT NULL,
  metadata JSONB, -- headline_from_alt, cta_selector, etc.
  confidence FLOAT NOT NULL,
  discovered_by TEXT NOT NULL DEFAULT 'banner-triage', -- agent that discovered this
  validated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- re-validate after this date
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_selector_overrides_oem_type
  ON selector_overrides(oem_id, page_type, selector_type);
```

**When this works**: Sites with non-standard class names (LDV i-motor, Kia kwcms), sites where no API or structured data is available.

**Cost**: ~$0.005 per invocation (2K tokens input, 200 tokens output via Groq).

#### Layer 5: Escalation (confidence: < 0.5)

All layers failed or returned low confidence. Create a Slack alert with full diagnosis:

```
:rotating_light: Banner Triage Failed: {oem_id}

Layers attempted:
  L1 Discovered APIs: {result}
  L2 Network Interception: {result}
  L3 Inline Data: {result}
  L4 AI Selector Discovery: {result}

Diagnosis: {summary}
Action required: Manual selector update in registry.ts or new API discovery

Page URL: {url}
Last successful extraction: {date}
Stale for: {hours}h
```

---

### Extraction Engine Integration

The extraction engine (`src/extract/engine.ts`) needs to check runtime overrides before using `registry.ts` selectors.

#### `selector_overrides` Lookup

```typescript
// In extractWithSelectors(), before using registry selectors:
async function getEffectiveSelectors(
  oemId: OemId,
  pageType: string,
  registrySelectors: OemSelectors,
  supabase: SupabaseClient
): Promise<OemSelectors> {
  const { data: overrides } = await supabase
    .from('selector_overrides')
    .select('selector_type, selector_value, metadata')
    .eq('oem_id', oemId)
    .eq('page_type', pageType)
    .gte('expires_at', new Date().toISOString())
    .order('confidence', { ascending: false });

  if (!overrides?.length) return registrySelectors;

  const effective = { ...registrySelectors };
  for (const override of overrides) {
    if (override.selector_type === 'heroSlides') {
      effective.heroSlides = override.selector_value;
    }
    // Extend for other selector types as needed
  }
  return effective;
}
```

#### Headline Extraction Enhancement

Already implemented (Apr 2): `img[alt]` fallback for headline when no heading text found in slide.

```typescript
const headlineText = $slide.find('h1, h2, .headline, .big_title .title').first().text().trim();
const slide: ExtractedBannerSlide = {
  headline: headlineText || $slide.find('img[alt]').first().attr('alt')?.trim() || null,
  // ...
};
```

---

### Data Flow

```
Cron fires homepage crawl
  │
  ├─ CSS extraction returns 0 banners
  │   └─ OEM previously had banners?
  │       └─ YES → insert change_event (banner_extraction_failed)
  │
  ├─ Workflow Router picks up event
  │   └─ Spawn banner-triage agent via OpenClaw
  │
  └─ Agent runs 5-layer cascade
      │
      ├─ Layer 1: Query discovered_apis → fetch API → parse banners
      ├─ Layer 2: CF Browser render → intercept network → find API
      ├─ Layer 3: Parse HTML → JSON-LD / framework data / globals
      ├─ Layer 4: Clean HTML → LLM → discover selectors → validate
      └─ Layer 5: Slack escalation
      │
      ├─ Best result (confidence >= 0.7):
      │   ├─ Upsert banners to database
      │   ├─ Store discovered API to discovered_apis (if L1/L2)
      │   ├─ Store discovered selector to selector_overrides (if L4)
      │   └─ Log success to agent_actions
      │
      └─ Low confidence (< 0.7):
          ├─ Slack alert with diagnosis
          └─ Log failure to agent_actions
```

---

## New Files

| File | Purpose |
|------|---------|
| `skills/autonomous-agents/banner-triage/SKILL.md` | OpenClaw agent skill definition |
| `src/sync/banner-triage.ts` | Core triage logic (5-layer cascade) |
| `src/extract/inline-data.ts` | Framework-aware inline data extraction (JSON-LD, __NUXT__, __NEXT_DATA__, Gatsby, AEM) |
| `src/extract/banner-data-filter.ts` | Heuristic filter for identifying banner data in JSON responses |
| `migrations/XXXXXX_selector_overrides.sql` | New `selector_overrides` table |

## Modified Files

| File | Change |
|------|--------|
| `src/orchestrator.ts` | Add banner extraction failure detection in `processChanges()` |
| `src/extract/engine.ts` | Check `selector_overrides` before registry selectors; `img[alt]` headline fallback (already done) |
| `src/sync/crawl-doctor.ts` | Add banner staleness check (Step N) |
| `src/routes/cron.ts` | Register `banner-triage` skill handler |
| `config/openclaw/cron-jobs.json` | Add banner-triage entry (not cron-scheduled — event-driven only, but needs skill registration) |
| `docs/AUTONOMOUS_AGENT_WORKFLOWS.md` | Add Banner Triage workflow definition |
| `AGENTS.md` | Document banner-triage agent |

---

## OpenClaw Skill Definition

```yaml
id: banner-triage
name: Banner Triage
description: Autonomous banner extraction repair via 5-layer discovery cascade
schedule: null  # Event-driven only, not scheduled
skill: banner-triage
enabled: true
config:
  confidence_threshold: 0.7
  max_layers: 5
  use_browser: true  # Layer 2 requires CF Browser
  llm_model: "llama-4-scout-17b"
  llm_fallback: "gemini-2.5-pro"
  slack_channel: "slack:#oem-alerts"
  dedup_hours: 24
  selector_override_ttl_days: 30
```

## Workflow Router Integration

Add to `AUTONOMOUS_AGENT_WORKFLOWS.md`:

```typescript
{
  workflow: "banner-triage",
  trigger: {
    entity_type: "banner",
    event_type: "banner_extraction_failed",
    severity: ["high", "medium"]
  },
  agent: {
    type: "data-discoverer",
    skill: "banner-triage",
    tools: ["browser", "web_fetch", "read", "write", "edit"],
    confidence_threshold: 0.70
  },
  actions: {
    auto_approve: [
      "upsert_banners",
      "store_discovered_api",
      "store_selector_override",
      "log_result"
    ],
    require_approval: [
      "delete_stale_banners",  // Never auto-delete
      "modify_registry"        // Code changes need human review
    ],
    rollback_enabled: true
  }
}
```

---

## Confidence Scoring

| Layer | Source | Base Confidence | Conditions |
|-------|--------|-----------------|------------|
| 1 | Discovered API | 0.95 | API returns valid JSON with banner structure |
| 2 | Network intercept | 0.90 | JSON response during page load matches banner heuristics |
| 3 | Inline data | 0.85 | Framework hydration data contains banner arrays |
| 3 | JSON-LD | 0.90 | Schema.org structured data with image/headline |
| 3 | Window globals | 0.70 | Generic `__DATA__` with banner-like structure |
| 4 | AI selector | 0.75 | LLM-discovered selectors validated against HTML |
| 4 | AI selector (re-prompt) | 0.65 | Selectors validated after one correction |

**Adjustments**:
- +0.05 if extracted banners have both image AND headline
- -0.10 if headline looks like nav/boilerplate (`/menu|nav|cookie|privacy/i`)
- -0.20 if fewer than 2 banners found (homepage typically has 3-9)
- +0.05 if banner count matches previous known count (within +/-2)

---

## Cost Analysis

| Layer | Cost per OEM | When Used |
|-------|-------------|-----------|
| Layer 1 | ~$0.00 | Always (DB query + HTTP fetch) |
| Layer 2 | ~$0.002 | When L1 fails (CF Browser render) |
| Layer 3 | ~$0.00 | Always (HTML parsing) |
| Layer 4 | ~$0.005 | When L1-3 fail (LLM call via Groq) |
| Layer 5 | ~$0.00 | When all fail (Slack webhook) |

**Worst case per OEM**: ~$0.007 (all layers run)
**Worst case all 18 OEMs**: ~$0.13
**Expected monthly cost**: ~$0.05 (1-3 OEMs need triage per month)

---

## Success Criteria

1. **Detection**: Banner extraction failures detected within 24h (event-driven) or 72h (safety net)
2. **Self-healing rate**: >= 80% of failures auto-repaired without human intervention
3. **False positive rate**: < 5% (don't trigger triage for OEMs that genuinely have no banners)
4. **Cost**: < $1/month total across all OEMs
5. **Latency**: Triage completes within 60s per OEM (browser render is the bottleneck)

---

## Testing Plan

### Unit Tests
- `banner-data-filter.ts`: Test heuristic detection against known banner JSON structures from each OEM
- `inline-data.ts`: Test extraction for each framework (Gatsby page-data.json, Nuxt __NUXT__, Next.js __NEXT_DATA__, AEM .model.json)
- `selector_overrides` lookup: Test override precedence over registry selectors
- Confidence scoring: Test adjustments for various banner quality scenarios

### Integration Tests
- End-to-end: Insert `banner_extraction_failed` event → verify agent spawns → verify banners upserted
- Layer fallback: Mock Layer 1-3 failures → verify Layer 4 AI discovery runs
- Dedup: Verify agent doesn't re-run within 24h for same OEM
- Crawl Doctor: Verify staleness detection at 72h threshold

### Manual Validation
- Run against all 18 OEMs and verify correct layer activates
- Verify LDV (Gatsby) resolves via Layer 3
- Verify VW (AEM, browser-required) resolves via Layer 2 or 3
- Verify Subaru (SPA) resolves via Layer 2
- Verify Kia (kwcms) resolves via Layer 4

---

## Migration Path

### Phase 1: Foundation (this PR)
- Create `selector_overrides` table
- Add `selector_overrides` lookup to extraction engine
- Add banner extraction failure detection to `processChanges()`
- Add banner staleness check to Crawl Doctor

### Phase 2: Discovery Layers
- Implement `banner-data-filter.ts` (Layer 2 enhancement)
- Implement `inline-data.ts` (Layer 3)
- Implement AI selector discovery (Layer 4)
- Wire up 5-layer cascade in `banner-triage.ts`

### Phase 3: Agent Integration
- Create `SKILL.md` for OpenClaw
- Add workflow definition to `AUTONOMOUS_AGENT_WORKFLOWS.md`
- Register in `cron-jobs.json` and `cron.ts`
- Add Slack escalation (Layer 5)

### Phase 4: Validation
- Run against all 18 OEMs
- Verify self-healing for known broken OEMs (LDV, VW, GMSV, Subaru)
- Monitor for 2 weeks
- Update AGENTS.md and documentation
