# Operating Instructions

## Your Specialized Skills

| Skill | Purpose | Key Capability |
|-------|---------|----------------|
| **cloudflare-browser** | Browser automation | CDP control, screenshots, videos, network monitoring |
| **oem-crawl** | Page crawling | Two-stage pipeline (cheap-check → full render), change detection |
| **oem-api-discover** | API discovery | CDP network interception, classify data APIs |
| **oem-build-price-discover** | Configurator discovery | Build & Price URL patterns, API endpoints, DOM selectors |
| **oem-agent-hooks** | Lifecycle hooks | Health monitoring, embedding sync, repair |

## Scheduled Operations

| Schedule | Frequency | crawl_type | Page Types Crawled |
|----------|-----------|------------|-------------------|
| `0 4 * * *` | Daily 4am | `homepage` | `homepage` |
| `0 5 * * *` | Daily 5am | `offers` | `offers` |
| `0 */12 * * *` | Every 12 hours | `vehicles` | `vehicle`, `category`, `build_price` |
| `0 6 * * *` | Daily 6am | `news` | `news` |
| `0 7 * * *` | Daily 7am | `sitemap` | `sitemap` |

Each cron passes `crawl_type` to `runScheduledCrawl()`, filtering `source_pages` by `page_type`.

### Upsert Pipeline

After extraction, `processChanges()` upserts data and tracks freshness:
- **Products**: `upsertProduct()` — match by oem_id + title
- **Offers**: `upsertOffer()` — match by oem_id + title, detect price/validity changes
- **Banners**: `upsertBanner()` — match by oem_id + page_url + position

All update `last_seen_at` on every crawl pass.

## Workflow

1. Use `oem-crawl` for systematic page crawling across all 18 OEMs
2. Use `cloudflare-browser` for pages that need JavaScript rendering (Lightpanda primary via `LIGHTPANDA_URL`, Cloudflare Browser Rendering fallback)
3. Use `oem-api-discover` to find hidden data endpoints via network interception
4. Use `oem-build-price-discover` to find configurator URLs and pricing APIs
5. Report discovered APIs and changes to the data pipeline

## Gatsby Page-Data Extraction (No Browser Needed)

For Gatsby-based OEMs (e.g. LDV AU on Gatsby 5.14.6), structured data is available at `page-data.json` endpoints for every route. This is a rich alternative to browser rendering:

- **Vehicles index**: `/page-data/vehicles/page-data.json` — all models with slugs, pricing, images
- **Per-model**: `/page-data/vehicles/{slug}/page-data.json` — full specs, variants, colors, features
- **Offers**: `/page-data/special-offers/page-data.json` — structured offer data
- **Price guide**: `/page-data/price/page-data.json` — driveaway pricing

No auth, no browser rendering, no API keys. LDV AU was fully populated (13 models, 11 products with full specs, 47 colors with hero images, 9 pricing rows) using this approach.

**Detection**: Check if `/{any-route}/page-data.json` returns JSON. If yes, the site uses Gatsby and all data is available statically.

## New OEM Initial Crawl

When a new OEM is onboarded (see `/root/clawd/docs/OEM_ONBOARDING.md`), run initial crawls:
1. Crawl all `source_pages` for the new OEM (`SELECT url, page_type FROM source_pages WHERE oem_id = '<new-oem>'`)
2. Run `oem-api-discover` on each page to find hidden data APIs
3. Run `oem-build-price-discover` if the OEM has a configurator
4. Report results — newly discovered APIs should be added to `discovered_apis`
