---
name: oem-crawl
description: Website crawling with cheap-check and full-render pipeline. Monitors OEM pages for changes using hash comparison, then triggers full browser rendering via CDP when changes are detected.
---

# OEM Crawl

Monitors OEM websites for changes using a two-stage pipeline.

## Triggers

- Cron schedule — each trigger targets specific page types via `crawl_type` filter:
  - Every 2h: `homepage` pages (banners)
  - Every 4h: `offers` pages (offers + offer-page banners)
  - Every 12h: `vehicle`, `category`, `build_price` pages (variants/models)
  - Daily 6am: `news` pages
  - Daily 7am: `sitemap` pages
- Manual trigger via `POST /api/v1/oem-agent/admin/crawl/:oemId` (crawls all page types)
- Force trigger via `POST /api/v1/oem-agent/admin/force-crawl/:oemId` (resets scheduler, bypasses backoff)
- Slack command ("check Ford's offers")

## Prerequisites

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for `source_pages`, `import_runs`, and `change_events` tables
- `WORKER_URL` for CDP proxy access
- `CDP_SECRET` for browser rendering authentication

## Pipeline

### Stage 0: Gatsby Page-Data (Skip Browser)
For Gatsby-based OEMs (e.g. LDV AU), structured data is available at `page-data.json` endpoints. These return pre-rendered JSON with full vehicle data (specs, variants, colors, pricing) — no browser rendering needed. Detection: check if `/{route}/page-data.json` returns valid JSON.

### Stage 1: Cheap Check
1. Fetch HTML for each active source page
2. Normalise HTML (strip scripts, styles, data attributes, etc.)
3. Hash normalised content
4. Compare against stored hash
5. If unchanged: update `last_checked_at`, increment `consecutive_no_change`
6. If changed: queue for full render

### Stage 2: Full Render (if changed)
1. Connect to headless browser — **Lightpanda** (primary, via `LIGHTPANDA_URL`) or **Cloudflare Browser Rendering** (fallback, via CDP proxy)
2. Navigate page, wait for JS render
3. Capture rendered DOM
4. Hand off to `oem-extract` skill for data extraction
5. Optionally capture network requests for API discovery

**Auto-sync on upsert**: Every product upsert automatically runs `syncVariantColors()` (for all OEMs) and `buildSpecsJson()` to keep `variant_colors` and `specs_json` current without separate enrichment passes.

## Input

```json
{
  "oem_id": "ford-au",
  "page_type": "offers",
  "trigger": "cron",
  "cron": "0 5 * * *"
}
```

## Output

```json
{
  "pages_checked": 15,
  "changes_detected": 3
}
```
