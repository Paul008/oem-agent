# Known Issues Runbook

Reference for autonomous agents and operators when diagnosing crawl failures.
Updated: 2026-03-25.

## Error Pattern → Diagnosis → Fix

### 1. `priceStr.toLowerCase is not a function`
**OEMs affected:** LDV (deliver-9-large-van, g10-van)
**Cause:** `extractPriceFromString()` receives a number or object instead of a string.
**Fix:** Add type guard: `if (!priceStr || typeof priceStr !== 'string') return undefined;`
**Location:** `src/extract/engine.ts` — search for `extractPriceFromString` or `toLowerCase`
**Severity:** Page-level error (run still completes, just that page errors)

### 2. `Attempted to use detached Frame`
**OEMs affected:** Any OEM using browser rendering (Puppeteer/Cloudflare Browser)
**Cause:** JavaScript on the page navigates or destroys the frame during rendering. Common with heavy SPAs, Optimizely, Adobe DTM.
**Fix:** Set `requiresBrowserRendering: false` if the OEM is SSR (Gatsby, WordPress, NextJS, Nuxt, React SSR). If browser rendering IS needed, this error is benign — the cheap fetch HTML is used as fallback.
**Location:** `src/oem/registry.ts` — the OEM's `flags.requiresBrowserRendering`

### 3. `HTTP 403: Forbidden`
**OEMs affected:** Mazda (homepage, /offers/)
**Cause:** OEM's WAF (Akamai, Cloudflare, Incapsula) blocks the Worker's IP or User-Agent.
**Fix:**
- First: Check if `requiresBrowserRendering: false` resolves it (cheap fetch uses different UA)
- If still 403: Update User-Agent in `fetchHtml()` or add OEM-specific headers
- Last resort: Use Cloudflare Browser which emulates a real browser
**Location:** `src/orchestrator.ts` — `fetchHtml()` method

### 4. `HTTP 404: Not Found`
**OEMs affected:** LDV (t60-max, d90), Suzuki (swift, fronx)
**Cause:** OEM renamed or removed the page URL.
**Fix:**
- Check if a redirect exists (curl -L the URL)
- If redirected: update `source_pages.url` to the new URL
- If genuinely gone: set `source_pages.status = 'removed'`
**Location:** Supabase `source_pages` table

### 5. `Execution context was destroyed`
**OEMs affected:** Mazda (cx-60)
**Cause:** Page does a full client-side navigation (SPA routing) that destroys the execution context.
**Fix:** Same as "detached Frame" — disable browser rendering if OEM is SSR.
**Location:** `src/oem/registry.ts`

### 6. `Timeout: crawlOem exceeded 45000ms`
**OEMs affected:** Any OEM with many pages + browser rendering
**Cause:** Too many pages require browser rendering within the 45s per-OEM timeout.
**Fix:**
- Check `requiresBrowserRendering` — should it be false? (SSR frameworks don't need it)
- Check `source_pages.last_hash` — if NULL, hashes haven't been seeded yet. Trigger one admin crawl to seed them. After that, unchanged pages skip rendering.
- Reduce active source pages if too many (deactivate low-value pages)
**Location:** `src/oem/registry.ts`, `src/orchestrator.ts`

### 7. `Browser render failed: 404`
**OEMs affected:** Suzuki, some Mazda pages
**Cause:** The browser renderer gets a different response than a plain fetch. Often because the OEM's server returns 404 to headless browsers but 200 to normal requests.
**Fix:** Set `requiresBrowserRendering: false` — the plain fetch works fine.
**Location:** `src/oem/registry.ts`

### 8. Import run stuck in "running" forever
**Cause:** Worker killed before `finally` block executed.
**Auto-fix:** Stale cleanup at the start of every `runScheduledCrawl()` marks runs >10 min as `timeout`.
**Manual fix:** `UPDATE import_runs SET status = 'timeout', finished_at = NOW(), error_log = 'Manual cleanup' WHERE status = 'running' AND started_at < NOW() - INTERVAL '10 minutes';`

### 9. Import run status "failed" with pages_errored > 0
**Cause:** Some pages within the OEM errored during extraction. The run itself completed (not a timeout).
**Diagnosis:** Check which pages errored by looking at `source_pages` for that OEM where `status = 'error'` or `error_message IS NOT NULL`.
**Fix:** Fix the specific page errors (see patterns above), then reset page to active.

### 10. All pages for an OEM show `last_hash = NULL`
**Cause:** Hashes weren't being stored (fixed in commit 184f977). Or the OEM has never had a successful crawl.
**Fix:** Trigger one admin crawl: `POST /api/v1/oem-agent/admin/crawl/{oem-id}`. This seeds hashes via cheap fetch (skipRender=true). After seeding, subsequent crons skip rendering for unchanged pages.

## OEM-Specific Notes

| OEM | Framework | Rendering | Notes |
|-----|-----------|-----------|-------|
| LDV | Gatsby SSR | false | Data from page-data.json. 2 pages have priceStr extraction bug. |
| Mazda | React SSR | false | Vehicle data in ReactDOM.hydrate JSON. WAF blocks some pages (403). |
| Suzuki | WordPress SSR | false | SSR. 2 pages renamed (404), deactivated. |
| Chery | Drupal SSR | false | 84 source pages (most of any OEM). |
| Foton | Custom SSR | false | Simple SSR, no rendering needed. |
| Ford | AEM SPA | true | Akamai protection. Direct API fetch for /vehiclesmenu.data. |
| Kia | AEM SPA | true | BYO API for 8-state driveaway pricing. |
| Hyundai | AEM SPA | true | CGI Configurator API for colors. |
| Toyota | NextJS | true | SSR but complex JS hydration. |
| GWM | Nuxt SSR | true | Storyblok CMS. 35 expired offers need cleanup. |
| GMSV | AEM SPA | true | No pricing data on site. |

## Column Reference (common confusion)

| Table | Error column | Finish column | Date columns |
|-------|-------------|--------------|-------------|
| `import_runs` | `error_log` | `finished_at` | — |
| `source_pages` | `error_message` | — | `last_checked_at`, `last_changed_at` |
| `agent_actions` | `error_message` | `completed_at` | — |
| `offers` | — | — | `validity_start`, `validity_end` (NOT end_date) |

## Timeout Budget

| Context | Per-OEM | Per-Page | Browser goto | Total budget |
|---------|---------|----------|-------------|-------------|
| Scheduled cron | 45s | 30s | 15s | 15 min |
| Admin HTTP trigger | N/A | 30s | N/A (skipRender) | ~30s |

## Rendering Configuration (as of Mar 25, 2026)

| Setting | OEMs | Count |
|---------|------|-------|
| `requiresBrowserRendering: false` | Chery, Ford, Foton, GAC, GMSV, GWM, Hyundai, Isuzu, KGM, Kia, LDV, Mazda, Mitsubishi, Nissan, Suzuki | 15 |
| `requiresBrowserRendering: true` | VW (explicit render_required), Toyota (needs testing), Subaru (needs testing) | 3 |

## Autonomous Systems

| System | Schedule | Actions |
|--------|----------|---------|
| **Cloudflare Crons** | 5x daily | Crawl all 18 OEMs (homepage, offers, vehicles, news, sitemap) |
| **Traffic Controller** | Every 2h | Health monitoring, stale data alerts, expiring offer alerts |
| **Crawl Doctor** | Every 2h (+30m) | Reset error pages, deactivate 404s, archive expired offers, flag price anomalies, detect stale products |
| **Weekly Report** | Monday 9am AEST | Comprehensive Slack report: freshness, changes, crawl health, action items |
| **Stale Cleanup** | Every cron | Mark stuck runs as timeout |
| **Hash Optimization** | Every crawl | Store hashes, skip rendering when unchanged |
