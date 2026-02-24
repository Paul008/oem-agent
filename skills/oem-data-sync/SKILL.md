---
name: oem-data-sync
description: Run, monitor, and diagnose the 37 seed/enrich scripts that populate Supabase with OEM vehicle data (models, products, accessories, colors, pricing, portals, brochures)
---

# OEM Data Sync

Wraps the existing `dashboard/scripts/seed-*.mjs` and `enrich-*.mjs` scripts with optional `import_runs` tracking. Each script fetches data from an OEM's API/website and upserts it into Supabase.

## Quick Start

```bash
# Run a single operation with import_run tracking
node skills/oem-data-sync/scripts/sync-runner.mjs --oem kgm-au --op accessories

# Run all weekly operations (dry-run first)
node skills/oem-data-sync/scripts/sync-runner.mjs --schedule weekly --dry-run

# Run a script directly (no tracking)
cd dashboard/scripts && node seed-kgm-accessories.mjs
```

## Runner CLI

`node skills/oem-data-sync/scripts/sync-runner.mjs [options]`

| Flag | Description | Example |
|------|-------------|---------|
| `--oem <id>` | Filter to one OEM | `--oem kia-au` |
| `--op <type>` | Filter by operation type | `--op accessories` |
| `--schedule <name>` | Run all ops for a schedule | `--schedule weekly` |
| `--all` | Run every operation | `--all` |
| `--dry-run` | List matching ops without executing | `--dry-run` |
| `--timeout <ms>` | Per-script timeout (default: 120000) | `--timeout 180000` |

## Prerequisites

- Node.js 18+ with `dashboard/node_modules/` installed (`pnpm install` in `dashboard/`)
- Supabase service role key hardcoded in each script (no .env needed)
- Network access to OEM APIs (some require specific headers, see edge cases below)

## Operations Registry

### Products (4 scripts)

| OEM | Script | API Source | Tables | Stability | Schedule |
|-----|--------|-----------|--------|-----------|----------|
| mitsubishi-au | `seed-mitsubishi-products.mjs` | Magento 2 GraphQL | vehicle_models, products, variant_pricing | high | weekly |
| suzuki-au | `seed-suzuki-products.mjs` | S3/CloudFront static JSON | vehicle_models, products, variant_pricing | high | weekly |
| nissan-au | `seed-nissan-products.mjs` | Apigee `/v2/models` + choices API | vehicle_models, products | medium | weekly |
| kgm-au | `seed-kgm-products.mjs` | Payload CMS (`therefinerydesign.com`) | vehicle_models, products, variant_pricing | high | weekly |

**Notes:**
- Nissan products: Apigee needs `apiKey` + `clientKey` + `publicAccessToken`. Pricing requires browser-session tokens (not automated).
- Mitsubishi/Suzuki/KGM: Fully automated, no auth issues.

### Accessories (10 scripts)

| OEM | Script | API Source | Tables | Stability | Schedule |
|-----|--------|-----------|--------|-----------|----------|
| mitsubishi-au | `seed-mitsubishi-accessories.mjs` | Magento 2 GraphQL | accessories, accessory_models | high | weekly |
| mazda-au | `seed-mazda-accessories.mjs` | React hydration inline JSON | accessories, accessory_models | medium | weekly |
| isuzu-au | `seed-isuzu-accessories.mjs` | Sitecore BuildandQuote API | accessories, accessory_models | high | weekly |
| hyundai-au | `seed-hyundai-accessories.mjs` | Content API v3 (no auth) | accessories, accessory_models | high | weekly |
| kia-au | `seed-kia-accessories.mjs` | JSON-LD structured data (HTML scrape) | accessories, accessory_models | medium | weekly |
| subaru-au | `seed-subaru-accessories.mjs` | Retailer API v1 (x-api-key) | accessories, accessory_models | high | weekly |
| nissan-au | `seed-nissan-accessories.mjs` | HTML scraping (two page templates) | accessories, accessory_models | low | weekly |
| volkswagen-au | `seed-vw-accessories.mjs` | E-catalogue GraphQL (OSSE/CARIAD) | accessories | low | weekly |
| gwm-au | `seed-gwm-accessories.mjs` | Storyblok CDN API | accessories, accessory_models | high | weekly |
| kgm-au | `seed-kgm-accessories.mjs` | Payload CMS (no auth) | accessories, accessory_models | high | weekly |

**Notes:**
- VW accessories: Requires guest token from homepage cookie. Token expires — if script fails, refetch homepage for fresh `accessToken`.
- Nissan accessories: HTML scraping with two different page templates. Fragile if Nissan redesigns.
- Mazda accessories: Extracts from React hydration `ReactDOM.hydrate(...)` inline data. Breaks if they change rendering.
- Kia accessories: Parses JSON-LD `<script type="application/ld+json">` blocks. Rio and Niro return no data.
- VW has no model joins (accessories are categorized by type, not vehicle model).

### Colors (10 scripts)

| OEM | Script | API Source | Tables | Stability | Schedule |
|-----|--------|-----------|--------|-----------|----------|
| kia-au | `seed-kia-colors.mjs` | JSON-LD + 360VR CDN | variant_colors | medium | weekly |
| subaru-au | `seed-subaru-colors.mjs` | Retailer API v1 | variant_colors | high | weekly |
| mazda-au | `seed-mazda-colors.mjs` | React hydration inline JSON | variant_colors | medium | weekly |
| isuzu-au | `seed-isuzu-colors.mjs` | BuildandQuote API | variant_colors | high | weekly |
| hyundai-au | `seed-hyundai-colors.mjs` | Content API v3 | variant_colors | high | weekly |
| suzuki-au | `seed-suzuki-colors.mjs` | Finance calculator JSON | variant_colors | high | weekly |
| gwm-au | `seed-gwm-colors.mjs` | Storyblok CDN API | variant_colors | high | weekly |
| nissan-au | `seed-nissan-colors.mjs` | AEM version-explorer JSON | variant_colors | medium | weekly |
| gmsv-au | `seed-gmsv-colors.mjs` | Dual: GMSV AU HTML + Chevy US colorizer API | variant_colors | medium | weekly |
| foton-au | `seed-foton-colors.mjs` | HTML data attributes (color dots) | variant_colors | medium | weekly |

**Notes:**
- Nissan colors: AEM endpoint at `/content/nissan_prod/en_AU/index/vehicles/browse-range/{slug}/version-explorer/jcr:content/core.versionexplorerdata.json`. Navara MY26 on separate Storyblok microsite (no images). Juke needs model code remapping (30113 → 30304).
- Suzuki colors: Uses `paintColours` field (plural with 's'). Color types: Solid, Premium Metallic, Two-Tone Metallic.
- GWM colors: Match DB records by hex code (DB stores `hex-{6chars}`, Storyblok has real names + UUIDs).
- GMSV colors: **Dual-source architecture**. Trucks/SUV (Silverado, Yukon) scraped from GMSV AU HTML pages — color chips in `<img>` with `colorizer/` path, jelly renders matched by alt text or slug. Corvettes (Stingray, E-Ray, Z06) from Chevrolet US colorizer JSON API (`/content/gm/api/services/colorizerContent`) — returns GM RPO codes, chip images, and 30-frame flipbook renders (frame `001` = front 3/4 hero). **Critical**: GM AEM pages contain chip texture images (pattern `\d+ch-\w+-?\d+x\d+`) in same `colorizer/` directory as jelly renders — must filter these out or hero images show metallic paint close-ups instead of vehicles. ZR2 has no per-color jellies; uses generic fallback hero from nav.
- Foton colors: Color dots on Tunland page at `/ute/tunland/` have `label`, `image`, and `style` (background-color) attributes. 4 variants (V7 4x2/4x4, V9 L/S) map to 2 products via image URL pattern matching. Premium colors marked with `*` suffix (+$690). Gallery URLs store multiple drivetrain angles per color.

### Enrichment (3 scripts)

| OEM | Script | Purpose | Tables | Stability | Schedule |
|-----|--------|---------|--------|-----------|----------|
| mitsubishi-au | `enrich-mitsubishi-heroes.mjs` | Add hero images from Magento | variant_colors | high | weekly |
| kia-au | `enrich-kia-heroes.mjs` | Add hero images from 360VR CDN | variant_colors | medium | weekly |
| gwm-au | `enrich-gwm-storyblok.mjs` | Enrich names + hero + gallery from Storyblok | variant_colors | high | weekly |

### Offers (3 scripts)

| OEM | Script | API Source | Tables | Stability | Schedule |
|-----|--------|-----------|--------|-----------|----------|
| gwm-au | `seed-gwm-offer-images.mjs` | Storyblok CDN API (AUModel variants) | offers | high | weekly |
| kgm-au | `seed-kgm-offers.mjs` | Payload CMS + website scrape | offers | medium | weekly |
| kia-au | `seed-kia-offers.mjs` | AEM KWCMS HTML scraping (two-tier) | offers | medium | weekly |

**Notes:**
- GWM offers: Matches existing DB offers to Storyblok AUModel variants by normalized name + price. Updates `hero_image_r2_key`, `price_amount` (retail), and `abn_price_amount` (ABN). ABN pricing differs for utes/Tanks/Ora ($1,000 cheaper), same for Haval SUVs.
- KGM offers: Combines Payload CMS model data (ABN discounts, starting prices) with hardcoded website offer data (factory bonus, run-out sales). Images from CMS media (`payload.therefinerydesign.com/api/media/file/`). Deletes + re-inserts all KGM offers on each run.
- Kia offers: Two-tier HTML scraping. Tier 1 scrapes main offers page for 15 model-level offers (driveaway, finance, value-add) with hero images. Tier 2 follows detail page links to extract grade/variant pricing (Model Range section). Deduplicates shared detail pages. Deletes + re-inserts all Kia offers on each run. 52 offers (15 main + 37 variant), $22,140–$78,490.

### Banners (3 scripts)

| OEM | Script | API Source | Tables | Stability | Schedule |
|-----|--------|-----------|--------|-----------|----------|
| multi | `seed-banners-v2.mjs` | Cheerio HTML scraping (9 OEMs) | banners | medium | weekly |
| multi | `seed-banners-browser.mjs` | Chrome MCP browser extraction (3 OEMs) | banners | low | weekly |
| suzuki-au | `seed-suzuki-banners.mjs` | Chrome MCP browser + cheerio | banners | medium | weekly |

**Notes:**
- `seed-banners-v2.mjs`: Server-side HTML scraping for Ford, GWM, KGM, Isuzu, Mazda, VW, Kia, Nissan. Each OEM has a custom cheerio extractor. Handles slick carousels, background-image CSS, picture/source elements, and responsive images.
- `seed-banners-browser.mjs`: Browser-based extraction for Hyundai, Toyota (client-side rendered carousels). Requires Chrome MCP session.
- `seed-suzuki-banners.mjs`: Suzuki `/home/` hero carousel (3 slides) and `/latest-offers/` hero banner. Uses background-image CSS with desktop/mobile variants.
- **Video scripts**: `seed-ford-video.mjs` (Brightcove Playback API), `seed-banner-videos.mjs` (Suzuki direct mp4).
- Ford video: Brightcove account `4082198814001`, player `H1RIrS7kf`, policy key required. Mp4 URLs use Fastly signed tokens that expire — must call Playback API for fresh URLs.
- Missing OEMs: Subaru (React client-side), Mitsubishi (no hero), LDV (minimal).

### Ford Colors (1 script — replaces old enrichment)

| OEM | Script | Purpose | Tables | Stability | Schedule |
|-----|--------|---------|--------|-----------|----------|
| ford-au | `seed-ford-colors.mjs` | Full color replacement from GPAS reference data | variant_colors | high | weekly |

**Notes:**
- Ford colors: Uses GPAS reference data (`OEM-variants-main/data/ford/ford-variant-data.json` + `ford-color-guids.json`). Replaces old `enrich-ford-heroes.mjs` (AEM colorizer HTML scraping). 388 colors with 100% hero/swatch/gallery from `www.gpas-cache.ford.com`.
- GWM Storyblok: Needs Origin `https://www.gwmanz.com` and Referer headers. Cache version (`cv`) parameter may need updating if Storyblok content changes.

### Toyota (no script — browser-only)

Toyota data (21 models, 149 products, 802 colors, 132 pricing rows) was seeded via direct browser-to-Supabase REST API using Chrome MCP tools. Cloudflare protection blocks curl — all APIs require browser session with `__cf_bm` cookie. No automated seed script exists.

### URL Rewrite (1 script)

| OEM | Script | Purpose | Tables | Stability | Schedule |
|-----|--------|---------|--------|-----------|----------|
| all | `rewrite-colors-to-proxy.mjs` | Rewrite OEM CDN URLs to media proxy URLs | variant_colors | high | weekly |

**Notes:**
- Rewrites `hero_image_url`, `swatch_url`, and `gallery_urls` to point through the `/media/:oemId/:encodedUrl` Cloudflare Worker proxy.
- The Worker (`src/routes/media.ts`) fetches from the OEM CDN with appropriate headers and returns via Cloudflare edge cache (30-day TTL).
- Original OEM URLs stored in `source_hero_url`, `source_swatch_url`, `source_gallery_urls` columns.
- Change detection: if URL doesn't start with the Worker proxy prefix, it was freshly written by a seed script and needs rewriting.
- CLI: `--oem <id>`, `--dry-run`, `--force`. No R2 credentials needed.
- Should run AFTER all color seed/enrich scripts in the weekly schedule.

### Portals (1 script)

| OEM | Script | API Source | Tables | Stability | Schedule |
|-----|--------|-----------|--------|-----------|----------|
| all | `seed-oem-portals.mjs` | Monday.com GraphQL API (board 15373501) | oem_portals | high | monthly |

**Notes:**
- Fetches portal credentials from Monday.com board via GraphQL API (account 229224, user 574175).
- Fuzzy-matches board item names to 16 OEM IDs.
- Extracts: portal_url, username, password, marketing_contact, guidelines_pdf_url (from Monday files column).
- 31 portals across all 16 OEMs. Platforms: sesimi, okta, dokio, sharepoint, box, fordimagelibrary, bms.hmc.co.kr, ateco.

### Brochures (1 script)

| OEM | Script | API Source | Tables | Stability | Schedule |
|-----|--------|-----------|--------|-----------|----------|
| multi | `seed-brochures.mjs` | Per-OEM extractors (API + HTML scraping) | vehicle_models (brochure_url) | medium | monthly |

**Notes:**
- Multi-OEM brochure URL scraper with per-OEM extractors. Updates `vehicle_models.brochure_url`.
- **Kia**: `selectVehicleList` API → `brochure` field (21/22 models).
- **Toyota**: Known Sitecore media library URLs — Cloudflare blocks HEAD checks, uses known URLs directly (15/21).
- **Mazda**: Central `/brochures/` page with cheerio parsing (10/10).
- **Ford**: AEM DAM at `/vehicles/download-brochure.html` (8/13).
- **Nissan**: `/vehicles/download-brochure.html` with Nissan CDN (7/11).
- **Mitsubishi**: `/buying-tools/download-brochure.html` (5/6).
- **GWM**: Storyblok assets CDN (4/8).
- **Isuzu**: B-CDN `models.json` with `brochure_pdfs` field (2/2).
- **Subaru**: Predictable `docs.subaru.com.au/{Model}-Brochure.pdf` (2/7).
- **Missing**: Hyundai (0/17), Suzuki (0/7, form-gated), KGM (0/8), LDV (0/1).
- Total: 74/132 models (56% coverage).

### API Discovery (7 scripts)

| OEM | Script | Purpose | Tables | Stability | Schedule |
|-----|--------|---------|--------|-----------|----------|
| all | `seed-discovered-apis.mjs` | Aggregate all discovered APIs | discovered_apis | high | monthly |
| all | `seed-oem-docs.mjs` | Seed OEM API documentation | oems (config_json) | high | monthly |
| mitsubishi-au | `seed-mitsubishi-apis.mjs` | Discover Mitsubishi APIs | discovered_apis | high | monthly |
| suzuki-au | `seed-suzuki-apis.mjs` | Discover Suzuki APIs | discovered_apis | high | monthly |
| nissan-au | `seed-nissan-apis.mjs` | Discover Nissan APIs | discovered_apis | high | monthly |
| kgm-au | `seed-kgm-apis.mjs` | Discover KGM APIs | discovered_apis | high | monthly |
| subaru-au | `seed-subaru-apis.mjs` | Discover Subaru APIs | discovered_apis | high | monthly |
| isuzu-au | `seed-isuzu-apis.mjs` | Discover Isuzu APIs | discovered_apis | high | monthly |
| mazda-au | `seed-mazda-apis.mjs` | Discover Mazda APIs | discovered_apis | high | monthly |

## Diagnosing Failures

### Common Failure Modes

**1. API Down / 5xx**
- Symptom: `Fetch failed: 500` or `ECONNREFUSED`
- Action: Wait and retry. Check if OEM site is down. Most recover within hours.

**2. Auth Expired**
- Affected: VW (guest token), Nissan (Apigee keys), Subaru (x-api-key)
- Symptom: `401 Unauthorized` or `403 Forbidden`
- VW fix: The script auto-fetches a fresh token from the homepage. If that fails, the homepage may have changed — inspect `https://www.volkswagen-genuine-accessories.com/au/` for cookie changes.
- Subaru fix: API key `w68ewXf97mnPODxXG6ZA4FKhP65wpUK576oLryW9` — check if still valid by hitting `/api/v1/models`.
- Nissan fix: Apigee `apiKey`/`clientKey` are embedded in the Nissan AU frontend bundle. Inspect network requests on `nissan.com.au`.

**3. HTML Template Changed**
- Affected: Mazda (React hydration), Kia (JSON-LD), Nissan (accessories HTML), Ford (AEM colorizer)
- Symptom: Script completes but inserts 0 rows, or crashes with parse error
- Action: Fetch the source page manually, check if data structure changed. Look for the extraction pattern:
  - Mazda: `ReactDOM.hydrate(React.createElement(Koala.App, {props}))` → extract `"accessories":[`
  - Kia: `<script type="application/ld+json">` blocks with Schema.org Product objects
  - Nissan: Two HTML page templates for accessories
  - Ford: HTML-entity-encoded JSON in `data-colorizer` or similar attributes

**4. Supabase Constraint Violation**
- Symptom: `duplicate key value violates unique constraint`
- Action: Scripts do clean-delete + re-insert or upsert. If this fails, check if another process is writing to the same table. The `onConflict` fields are:
  - accessories: `(oem_id, external_key)`
  - vehicle_models: `(oem_id, slug)`
  - variant_colors: `(product_id, color_slug)`

**5. Timeout**
- Symptom: Script killed after timeout (default 120s)
- Action: Increase timeout with `--timeout 300000`. Some scripts (VW, Nissan) make many sequential API calls and can be slow.

**6. Empty Response**
- Symptom: `Fetched 0 items` or empty array
- Action: The OEM may have removed the endpoint or changed auth. Fetch the URL manually to verify.

### Known Fragile Points

| Risk | OEM | Detail |
|------|-----|--------|
| Guest token rotation | volkswagen-au | Homepage cookie `accessToken` expires. Script auto-refreshes but homepage may change. |
| Dual HTML templates | nissan-au | Accessories pages have two different HTML structures. Both parsers must work. |
| React hydration format | mazda-au | Inline JSON in `ReactDOM.hydrate()` call. Any React upgrade could change format. |
| Storyblok cache version | gwm-au | `cv` param in API calls. Using hardcoded value; may need update if content pipeline changes. |
| API key validity | subaru-au | Uses a third-party retailer API key that could be rotated. |
| Apigee credentials | nissan-au | `apiKey`/`clientKey`/`publicAccessToken` from frontend bundle. Changes with site deploys. |
| HTML entity encoding | ford-au | Colorizer JSON uses `&#34;` instead of `"`. Regex must use `[a-zA-Z0-9/_-]+` for paths. |
| Page removals | kia-au | Rio and Niro accessories pages return no data (discontinued models). |
| Model code remapping | nissan-au | Juke version-explorer returns 30113 but products table uses 30304. |
| Payload CMS stability | kgm-au | Third-party CMS at `therefinerydesign.com` — could go offline or change schema. |
| Chip texture vs jelly images | gmsv-au | GM AEM `colorizer/` directory contains both chip textures (`25ch-gxd-189x199.jpg`) and actual vehicle jelly renders. Filter by filename pattern `\d+ch-[a-z0-9]+[-_]?\d+x\d+` to exclude chips. |
| Chevrolet US colorizer API | gmsv-au | Corvettes use US API at `/content/gm/api/services/colorizerContent`. Endpoint or schema could change with GM platform updates. |
| Flipbook frame format | gmsv-au | Corvette hero images use 3-digit frame numbers (`001`). If GM changes render pipeline, frame numbering may shift. |
| ZR2 fallback hero | gmsv-au | Silverado ZR2 has no per-color jelly renders. Uses generic vehicle image from nav menu as fallback. |
| Color dot HTML structure | foton-au | Color data in `colours_wrapper__colourDots__dot` divs with `label`/`image` attributes. Any page redesign breaks extraction. |

## Database Tables Affected

| Table | Description | Key Columns |
|-------|-------------|-------------|
| `vehicle_models` | One row per model per OEM | oem_id, slug, name, brochure_url |
| `products` | Variants/grades per model | oem_id, model_id, external_key |
| `variant_colors` | Color options per product | product_id, color_slug, swatch_url, hero_url, gallery_url |
| `variant_pricing` | State driveaway pricing | product_id, state (nsw/vic/qld/wa/sa/tas/act/nt) |
| `accessories` | Accessory catalog | oem_id, external_key, name, price |
| `accessory_models` | Accessory ↔ model join | accessory_id, vehicle_model_id |
| `discovered_apis` | API endpoints per OEM | oem_id, url |
| `oems` | OEM config with api_docs | id, config_json |
| `offers` | Promotional offers and deals | oem_id, external_key, title, offer_type, price_amount, abn_price_amount, saving_amount, hero_image_r2_key |
| `banners` | Homepage/offers hero banners | oem_id, page_url, position, headline, image_url_desktop/mobile, video_url_desktop/mobile |
| `oem_portals` | Portal credentials per OEM | oem_id, portal_url, username, password, guidelines_pdf_url |
| `import_runs` | Sync execution history | oem_id, run_type, status, started_at, finished_at |

## import_runs Tracking

The sync-runner creates a record in `import_runs` for each script execution:

| Field | Usage |
|-------|-------|
| `oem_id` | The OEM being synced (e.g. `kgm-au`) |
| `run_type` | `sync_products`, `sync_accessories`, `sync_colors`, `sync_enrich`, `sync_offers`, `sync_apis`, `sync_rewrite` |
| `status` | `running` → `completed` or `failed` |
| `started_at` | When the script started |
| `finished_at` | When the script ended |
| `pages_checked` | Total items processed (parsed from stdout) |
| `changes_found` | Items upserted/inserted (parsed from stdout) |
| `error_log` | stderr output on failure |
| `error_json` | `{ script, exit_code, signal }` |

## Schedules

| Schedule | Cron | Operations | Rationale |
|----------|------|-----------|-----------|
| weekly | `0 3 * * 0` (Sunday 3 AM AEST) | Products, accessories, colors, enrichment | Main data refresh cycle |
| monthly | `0 3 1 * *` (1st of month, 3 AM AEST) | API discovery, OEM docs | APIs/docs change slowly |

## Manifest

The machine-readable registry is at `skills/oem-data-sync/sync-manifest.json`. The runner reads it to determine which scripts to execute for a given `--oem`, `--op`, or `--schedule` filter.
