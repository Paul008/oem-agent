---
name: oem-crawl
description: Website crawling with cheap-check and full-render pipeline. Monitors OEM pages for changes using hash comparison, then triggers full browser rendering via CDP when changes are detected.
---

# OEM Crawl

Monitors OEM websites for changes using a two-stage pipeline.

## Triggers

- Cron schedule (every 2h/4h/12h/24h depending on page type)
- Manual trigger via `/api/oems/:oemId/crawl`
- Slack command ("check Ford's offers")

## Prerequisites

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for source pages and results
- `WORKER_URL` for CDP proxy access
- `CDP_SECRET` for browser rendering authentication

## Pipeline

### Stage 1: Cheap Check
1. Fetch HTML for each active source page
2. Normalise HTML (strip scripts, styles, data attributes, etc.)
3. Hash normalised content
4. Compare against stored hash
5. If unchanged: update `last_checked_at`, increment `consecutive_no_change`
6. If changed: queue for full render

### Stage 2: Full Render (if changed)
1. Connect to Browser Rendering via CDP proxy
2. Navigate page, wait for JS render
3. Capture rendered DOM
4. Hand off to `oem-extract` skill for data extraction
5. Optionally capture network requests for API discovery

## Input

```json
{
  "oem_id": "ford",
  "page_type": "offers",
  "trigger": "cron",
  "cron": "0 */2 * * *"
}
```

## Output

```json
{
  "pages_checked": 15,
  "changes_detected": 3
}
```
