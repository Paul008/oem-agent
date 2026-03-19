# Operating Instructions

## Your 14 Specialized Skills (all loaded)

| Skill | Purpose | Key Capability |
|-------|---------|----------------|
| **cloudflare-browser** | Browser automation | CDP control, screenshots, videos, network monitoring |
| **oem-agent-hooks** | Lifecycle hooks | Health check (4h), R2 memory sync (30min), weekly Slack report (Mon 9am) |
| **oem-orchestrator** | Traffic Controller | Central orchestrator — monitors 18 OEMs (2h), auto-retries with backoff, Slack escalation |
| **oem-api-discover** | API discovery | CDP network interception, classify data APIs |
| **oem-build-price-discover** | Configurator discovery | Build & Price URL patterns, API endpoints, DOM selectors |
| **oem-crawl** | Page crawling | Two-stage pipeline (cheap-check → full render), change detection |
| **oem-design-capture** | Design assets | Vision-based brand analysis using Kimi K2.5 |
| **oem-extract** | Content parsing | JSON-LD → OG → CSS → LLM fallback extraction |
| **oem-report** | Reporting | Slack alerts, daily digests across 18 OEMs |
| **oem-sales-rep** | Sales intelligence | Slack chatbot for product/offer queries |
| **oem-semantic-search** | Search & discovery | pgvector semantic search, cross-OEM similarity |
| **oem-brand-ambassador** | Page generation | AI-driven marketing page creation per OEM brand |
| **oem-data-sync** | Data synchronization | 37 seed/enrich scripts for products, accessories, colors, offers |
| **oem-ux-knowledge** | UX patterns | Design knowledge base with vector retrieval |
| **autonomous-agents** | Workflow automation | 7 sub-skills: price-validator, link-validator, image-validator, offer-manager, product-enricher, variant-sync, compliance-checker |

**Skills Location**: /root/clawd/skills/ (each has detailed SKILL.md documentation)

## Scheduled Operations

Your automated crawl schedule:

| Schedule | Frequency | Purpose | Target |
|----------|-----------|---------|--------|
| `0 3 * * *` | Daily 3am | All-OEM data sync | Colors, pricing, driveaway (Kia BYO + Hyundai CGI + Mazda + Mitsubishi GraphQL + generic) |
| `0 4 * * *` | Daily 4am | Homepage crawl | OEM homepages |
| `0 5 * * *` | Daily 5am | Offers crawl | Special promotions |
| `0 */12 * * *` | Every 12 hours | Vehicles crawl | Vehicle inventory, specs, variant colors |
| `0 6 * * *` | Daily 6am | News crawl | OEM news updates |
| `0 7 * * *` | Daily 7am | Sitemap crawl | Sitemap + design checks |

**Handler**: `src/scheduled.ts` → `OemAgentOrchestrator.runScheduledCrawl(crawlType)`

Each cron trigger passes its `crawl_type` to the orchestrator, which filters `source_pages` by `page_type`:
- `homepage` → page types: `homepage`
- `offers` → page types: `offers`
- `vehicles` → page types: `vehicle`, `category`, `build_price`
- `news` → page types: `news`
- `sitemap` → page types: `sitemap`

### Product Upsert Pipeline

When the crawl extracts products, `upsertProduct()` in `src/orchestrator.ts`:
1. Matches existing products by oem_id + title
2. Auto-builds `specs_json` via `orchestrator.buildSpecsJson()` on every upsert
3. Auto-syncs `variant_colors` via `orchestrator.syncVariantColors()` for all OEMs

### Offer Upsert Pipeline

When the crawl extracts offers from an OEM page, `upsertOffer()` in `src/orchestrator.ts`:
1. Matches existing offers by `oem_id + title`
2. Maps extracted data to DB columns (price, validity dates, disclaimer, CTA, hero image)
3. Updates `last_seen_at` on every crawl pass (even if content unchanged)
4. Detects changes via `changeDetector.detectOfferChanges()` and creates change events + Slack alerts
5. Inserts brand-new offers with a generated UUID

## Supabase Database

All skills store data in Supabase. Key tables:

| Table | Purpose | Key Constraints |
|-------|---------|----------------|
| `oems` | 18 OEM records with config_json.api_docs, design_profile_json | PK: id (e.g. 'ford-au') |
| `vehicle_models` | Models per OEM | Unique: oem_id, slug |
| `products` | Variants/grades, `specs_json` JSONB (auto-built on every upsert via `buildSpecsJson()`) | external_key pattern: `{oem}-{code}-{variant}` |
| `variant_colors` | Colour options per product (auto-synced for all OEMs via `syncVariantColors()`) | Unique: product_id, color_code |
| `variant_pricing` | Per-state driveaway pricing | Columns: driveaway_nsw/vic/qld/wa/sa/tas/act/nt |
| `accessories` | Accessory catalog per OEM | Unique: oem_id, external_key. Has parent_id, inc_fitting |
| `accessory_models` | Accessories ↔ models join | Unique: accessory_id, model_id |
| `discovered_apis` | API endpoints per OEM | Unique: oem_id, url |
| `source_pages` | URLs monitored for changes | |
| `change_events` | Audit log of detected changes | |
| `offers` (302) | Promotional offers across ALL 18 OEMs (auto-updated by crawl every 4h) | hero_image_r2_key, abn_price_amount, saving_amount, last_seen_at |
| `banners` (176) | Homepage/offers hero banners (all 18 OEMs), 100% with desktop images | page_url, position, image_url_desktop/mobile, video_url_desktop/mobile |
| `oem_portals` (31) | Marketing portal credentials (18 OEMs) | portal_url, username, password, guidelines_pdf_url |
| `pdf_embeddings` | Vectorized PDF chunks (brochures + guidelines) | vector(768), HNSW index, `search_pdfs_semantic()` RPC |
| `extraction_runs` | Design pipeline run history | oem_id, model_slug, quality_score, cost tracking |
| `import_runs` | Crawl job tracking | |

**OEM IDs**: chery-au, ford-au, foton-au, gac-au, gmsv-au, gwm-au, hyundai-au, isuzu-au, kgm-au, kia-au, ldv-au, mazda-au, mitsubishi-au, nissan-au, subaru-au, suzuki-au, toyota-au, volkswagen-au

## Dealer API (WP-Compatible Middleware)

Public REST endpoints serving vehicle variant data in WordPress REST API format for dealer websites.

**Base URL**: `https://oem-agent.adme-dev.workers.dev`
**Auth**: None (public, CORS enabled for all origins)
**Implementation**: `src/routes/dealer-api.ts`

### Endpoints

| Endpoint | Purpose | Key Params |
|----------|---------|------------|
| `GET /api/wp/v2/catalog?oem_id={id}` | All models + nested variants for an OEM | `oem_id` |
| `GET /api/wp/v2/models?oem_id={id}` | Active model list | `oem_id` |
| `GET /api/wp/v2/variants?filter[variant_category]={slug}&oem_id={id}` | Paginated variants for a model | `filter[variant_category]`, `oem_id`, `per_page`, `page` |
| `GET /api/wp/v2/variants-import?oem={id}` | Flat variant list for WP All Import | `oem` |

**OEM ID format**: All endpoints accept both short (`kia`) and full (`kia-au`) OEM IDs via `normalizeOemId()`.

### Resilience

- **CORS**: Router-level middleware on all endpoints (`Access-Control-Allow-Origin: *`, OPTIONS preflight)
- **Partial failure**: `Promise.allSettled` for parallel color/pricing/palette queries — one failing won't crash the response
- **Error handling**: All endpoints wrapped in try/catch with structured JSON error responses
- **Title fallback safety**: `ilike` fallback requires model name >= 3 chars, uses starts-with pattern to avoid over-matching

### Data Flow
`vehicle_models` → `products` → parallel(`variant_colors`, `variant_pricing`, `oem_color_palette`) → WP JSON schema

### WP Variant Schema
Each variant includes: `title.rendered`, `slug`, `engine`, `fuel`, `transmission`, `drive_train`, `seats`, `doors`, `colours[]` (images, swatches, paint_price), `drive_away`, `features` (HTML), `specifications`.

**Full docs**: `/root/clawd/docs/DEALER_API.md`

## Workflow Guidelines

1. **Browser Automation**: Use `cloudflare-browser` skill for visual inspection and interaction
2. **Data Collection**: Use `oem-crawl` for systematic page crawling
3. **API Discovery**: Use `oem-api-discover` to find hidden data endpoints
4. **Content Extraction**: Use `oem-extract` for structured data parsing (products, offers, banners, specs)
5. **Storage**: Save to Supabase via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
6. **Semantic Search**: Use `oem-semantic-search` for product/offer queries + `search_pdfs_semantic()` for brochure/guidelines PDF search
7. **Reporting**: Use `oem-report` to generate insights and analytics

## Accessories Data (2702 items across 12 OEMs)

Accessories are seeded via `dashboard/scripts/seed-{oem}-accessories.mjs`. Each OEM uses a different data source:

| OEM | Source | Auth | Items | Edge Cases |
|-----|--------|------|-------|------------|
| Hyundai | Content API v3 | None | 526 | groupIds scraped from model-series-id HTML attr |
| Volkswagen | E-catalogue GraphQL (OSSE) | Guest JWT (auto) | 353 | No car model associations; introspection disabled |
| Subaru | Retailer API v1 | x-api-key | 299 | Duplicate models in API (dedupe by name) |
| Mazda | React hydration inline JSON | None | 266 | CX-8/MX-30 have no data (discontinued) |
| Kia | JSON-LD structured data | None | 246 | Rio/Niro pages return no data |
| KGM | Payload CMS REST API | None (Origin/Referer) | 225 | Sub-accessories with parent_id |
| Mitsubishi | Magento 2 GraphQL | None | 223 | Category IDs per model-year |
| Isuzu | Sitecore BuildandQuote API | None | 204 | 2.2L variants share with 3.0L (skip dupes) |
| GWM | Storyblok CDN API | None (Origin/Referer) | 181 | 220 model joins, $52–$4,949 |
| Nissan | HTML scraping (2 templates) | None | 179 | Structured vs rich-text templates |

**Remaining OEMs without accessories**: Toyota (403 blocked), Ford (13MB HTML, no API), LDV (Gatsby page-data available but no accessories page), Suzuki (no API found)

## Page Builder

The dashboard includes a visual page builder for editing AI-generated model pages:

- **Template Gallery** (`/dashboard/page-builder/`): Browse sections from all 18 OEM generated pages + 10 curated OEM-branded templates
- **Page Editor** (`/dashboard/page-builder/[slug]`): Split-pane visual editor with live preview, responsive toolbar, undo/redo, copy/paste, media upload
- **Section types** (15): hero, intro, tabs, color-picker, specs-grid, gallery, feature-cards, video, cta-banner, content-block, accordion, enquiry-form, map, alert, divider
- **Tab variants**: `default` (horizontal tab bar), `kia-feature-bullets` (two-column bullet list with disclaimers)
- **Key files**: `use-page-builder.ts` (editor state, subpage context), `use-template-gallery.ts` (template browsing), `SectionProperties.vue` (per-type editor with image thumbnails)
- **Subpages**: Models can have child subpages using `{modelSlug}--{subpageSlug}` convention (e.g., `sportage--performance`). 9 predefined types (specs, design, performance, safety, gallery, pricing, lifestyle, accessories, colours) + custom freeform. Nested list in `model-pages.vue`, breadcrumb + source URL input in editor. Endpoints: `POST /admin/create-subpage/:oemId/:modelSlug/:subpageSlug`, `DELETE /admin/delete-subpage/...`

## Documentation Resources

Reference documentation available in `/root/clawd/docs/`:

### Onboarding & Operations
- **OEM_ONBOARDING.md** - Step-by-step guide for adding new OEMs (prerequisites, 9 steps, migration templates, verification, common gotchas)

### Architecture & Setup
- **OEM_AGENT_ARCHITECTURE.md** - Complete system architecture and component details (includes page builder component tree)
- **DEALER_API.md** - WP-compatible dealer API middleware (endpoints, schema, data sources, examples)
- **IMPLEMENTATION_SUMMARY.md** - Implementation notes and key decisions
- **BROWSER_RENDERING_SETUP.md** - Cloudflare Browser Rendering configuration
- **DATABASE_SETUP.md** - Database schema and table structures
- **DATABASE_RESTRUCTURE.md** - Latest database schema updates

### Crawl Configuration
- **crawl-config-v1.2.md** - Comprehensive crawl configuration reference (109KB)
- **BROWSER_AUTOMATION_RD.md** - Browser automation patterns and research

### OEM-Specific Guides
- **FORD_EXTRACTION_STATUS.md** - Ford data extraction implementation
- **FORD_COLOR_GALLERY_INVESTIGATION.md** - Ford color gallery analysis
- **kia-au-extraction-report.md** - Kia Australia extraction details
- **ford-*.md** - Various Ford implementation reports

### Network & Testing
- **network-browser-utility.md** - Network capture utilities
- **network-capture-research.md** - Network analysis patterns
- **e2e-test-results.md** - End-to-end test results

**Usage**: Read these files when you need detailed technical information about specific components or OEM implementations.

## Memory & Context

- **R2 Backup**: Conversations sync to R2 every 30 seconds
- **Workspace**: Located at /root/clawd/
- **Config**: /root/.openclaw/openclaw.json
- **Persistence**: ✅ Enabled - conversations persist across restarts
