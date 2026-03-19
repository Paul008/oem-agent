# OEM Agent System Briefing

**Last Updated**: 2026-03-18
**Deployment**: https://oem-agent.adme-dev.workers.dev/
**Status**: ✅ Operational (conversation persistence enabled)

## Executive Summary

Multi-OEM automotive intelligence platform running OpenClaw on Cloudflare Workers with:
- 14 specialized skills for automotive data collection
- R2-backed conversation persistence
- Headless browser automation via Lightpanda (primary, raw CDP WebSocket) with Cloudflare Browser Rendering fallback
- Supabase for structured data storage
- Scheduled crawls for 18 Australian automotive manufacturers
- Dashboard UI for monitoring (Cloudflare Pages, shadcn-vue-admin)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker (Hono)                   │
│  - Manages OpenClaw container lifecycle                     │
│  - Proxies HTTP/WebSocket to gateway                        │
│  - Scheduled cron triggers for automated crawls             │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│          Cloudflare Sandbox Container (Docker)              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  OpenClaw Gateway (Node.js 22, OpenClaw 2026.2.3)    │  │
│  │  - Control UI on port 18789                           │  │
│  │  - WebSocket RPC protocol                             │  │
│  │  - Agent runtime with 14 custom skills               │  │
│  │  - R2 sync every 30s (rclone)                         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
      ┌─────────┐         ┌─────────┐        ┌──────────┐
      │   R2    │         │Supabase │        │ Browser  │
      │ Bucket  │         │Database │        │Rendering │
      └─────────┘         └─────────┘        └──────────┘
```

## Core Components

### 1. OpenClaw Container
- **Image**: cloudflare/sandbox:0.7.0
- **Runtime**: Node.js 22.13.1
- **Package**: openclaw@2026.2.3
- **Config**: /root/.openclaw/openclaw.json
- **Workspace**: /root/clawd/
- **Skills**: /root/clawd/skills/ (14 custom skills)

### 2. R2 Persistence (Fixed 2026-02-18)
**Recent Fix**: Added R2 credentials to container environment variables

```typescript
// src/gateway/env.ts - Now passes these to container:
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME (oem-agent-assets)
CF_ACCOUNT_ID
```

**R2 Structure**:
```
r2://oem-agent-assets/
├── openclaw/          # OpenClaw config (synced every 30s)
├── workspace/         # Conversation history (synced every 30s)
└── skills/            # Custom skills (synced every 30s)
```

**Background Sync**: Runs every 30 seconds via rclone in container startup script

### 3. Supabase Database
- **URL**: https://nnihmdmsglkxpmilmjjc.supabase.co
- **Access**: Via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

**Core Tables:**

| Table | Rows | Purpose |
|-------|------|---------|
| `oems` | 17 | OEM registry with config_json.api_docs, design_profile_json |
| `vehicle_models` | ~179 | Models per OEM (unique: oem_id, slug), has `brochure_url` column (106/179 populated) |
| `products` | 796 | Variants/grades with `specs_json` JSONB (auto-built on every upsert via `orchestrator.buildSpecsJson()`) |
| `variant_colors` | ~4952 | Colour options per product (auto-synced for all OEMs via `orchestrator.syncVariantColors()`) |
| `variant_pricing` | ~1158 | Per-state driveaway pricing (NSW/VIC/QLD/WA/SA/TAS/ACT/NT) |
| `pdf_embeddings` | — | Vectorized PDF chunks (brochures + guidelines), vector(768), HNSW index |
| `accessories` | 2913 | Accessory catalog per OEM (unique: oem_id, external_key) |
| `accessory_models` | 2981 | Many-to-many join: accessories ↔ vehicle_models |
| `discovered_apis` | 58+ | API endpoints per OEM (unique: oem_id, url) |
| `source_pages` | 231 | URLs monitored for changes |
| `change_events` | 516 | Audit log of detected changes |
| `offers` | 302 | Promotional offers across all 18 OEMs — auto-updated by crawl every 4h. Fields: hero_image_r2_key, abn_price_amount, saving_amount, last_seen_at. Upserted by `orchestrator.upsertOffer()` |
| `extraction_runs` | — | Design pipeline run history (quality_score, cost, per oem_id + model_slug) |
| `import_runs` | 1823 | Crawl job tracking |
| `banners` | 176 | Homepage/offers hero banners (all 18 OEMs), 100% with desktop images |
| `oem_portals` | 31 | Marketing portal credentials per OEM (sourced from Monday.com) |

**Entity Hierarchy:**
```
oems → vehicle_models → products → variant_colors
                                 → variant_pricing
                     → accessories (via accessory_models join)
     → oem_portals (portal credentials, brand guidelines)
     → pdf_embeddings (vectorized brochures + guidelines)
     → extraction_runs (design pipeline run history)
```

### 4. Browser Rendering (Lightpanda + Cloudflare Fallback)
- **Primary**: Lightpanda browser via `LIGHTPANDA_URL` env var (raw CDP WebSocket)
- **Fallback**: Cloudflare Browser Rendering via `/cdp?secret=$CDP_SECRET`
- **Purpose**: Headless browser for screenshots, scraping, video capture
- **Binding**: Cloudflare Browser available as BROWSER env binding

### 4. Dashboard UI
- **URL**: https://oem-agent.pages.dev (Cloudflare Pages)
- **Stack**: Vue 3 + shadcn-vue-admin + Supabase client
- **Auth**: Supabase magic link (email)
- **Source**: `dashboard/` directory

**Dashboard Pages** (`dashboard/src/pages/dashboard/`):

| Page | View | Description |
|------|------|-------------|
| `index.vue` | Overview | Summary stats and counts |
| `oems.vue` | OEMs | OEM registry (17 manufacturers) |
| `products.vue` | Models & Variants | Expandable model → variant table |
| `colors.vue` | Variant Colors | Grid with hero images, swatch picker, 360 viewer, pagination |
| `offers.vue` | Offers | Grid with hero images, savings/price badges, ABN pricing, pagination |
| `pricing.vue` | Pricing | Per-state driveaway pricing |
| `accessories.vue` | Accessories | Accessory catalog with model links |
| `apis.vue` | APIs | Discovered API endpoints |
| `docs.vue` | Docs | OEM API documentation |
| `operations.vue` | Operations | System operations dashboard |
| `runs.vue` | Import Runs | Crawl job history |
| `changes.vue` | Changes | Change event audit log |
| `source-pages.vue` | Source Pages | Monitored URLs |
| `model-pages.vue` | Model Pages | AI-generated model pages (Gemini + Claude pipeline), preview & regenerate |
| `design-memory.vue` | Design Memory | Extraction run history, quality scores, pipeline analytics |
| `page-builder-docs.vue` | Page Builder Docs | Documentation for the adaptive pipeline and page builder |
| `page-builder/index.vue` | Template Gallery | Browse OEM section templates, curated templates, filter by OEM/type |
| `page-builder/[slug].vue` | Page Builder | Visual section editor with live preview, undo/redo, template gallery drawer |
| `portals.vue` | OEM Portals | Portal credentials with password toggle, copy-to-clipboard, brand guidelines PDFs |

### 5. Design Memory & Adaptive Pipeline
- **Pipeline**: 7-step adaptive page generation: Clone → Screenshot → Classify → Extract → Validate → Generate → Learn
- **Source files**: `src/design/memory.ts`, `src/design/prompt-builder.ts`, `src/design/extraction-runner.ts`, `src/design/pipeline.ts`, `src/design/ux-knowledge.ts`, `src/design/component-generator.ts`
- **AI model routing**: Groq Llama 3.3 70B (classification/validation), Gemini 2.5 Pro (extraction), Claude Sonnet 4.5 (bespoke components), Google text-embedding-004 (vectors), Workers AI Llama Vision (free classification)
- **Section types** (15): hero, intro, tabs, color-picker, specs-grid, gallery, feature-cards, video, cta-banner, content-block, accordion, enquiry-form, map, alert, divider
- **Storage**: `extraction_runs` table (run history + quality metrics), `oems.design_profile_json` (accumulated OEM design learning)
- **Migration**: `supabase/migrations/20260222_design_memory.sql`
- **Vectorize**: Cloudflare Vectorize index `ux-knowledge-base` (768-dim cosine)

### 6. Page Builder UI
- **Editor**: `page-builder/[slug].vue` — split-pane layout (sidebar + canvas), responsive toolbar with hamburger overflow menu
- **Section editor**: Per-type property editors with image thumbnails, media upload (R2), theme/variant toggles
- **Tab variants**: `default` (horizontal tab bar) and `kia-feature-bullets` (two-column bullet list with disclaimers)
- **History**: Undo/redo system with keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z), history panel
- **Copy/paste**: Section clipboard (copy JSON, paste from clipboard), cross-page section reuse
- **Template gallery**: In-editor Sheet drawer + landing page at `/dashboard/page-builder/`
  - Fetches sections from all 18 OEM generated pages via Worker API
  - 10 curated OEM-branded templates (Kia dark hero, Toyota split CTA, Hyundai tech tabs, etc.)
  - Filter by OEM, section type, search query
- **Subpages**: Convention-based `{modelSlug}--{subpageSlug}` stored flat in R2
  - 9 predefined types (specs, design, performance, safety, gallery, pricing, lifestyle, accessories, colours) + custom
  - Model pages UI: nested subpage list with expand/collapse, add/delete controls
  - Editor: breadcrumb navigation (Parent > Subpage), source URL input for cloning OEM subpages
  - Endpoints: `POST /admin/create-subpage/:oemId/:modelSlug/:subpageSlug`, `DELETE /admin/delete-subpage/...`
  - Clone/Pipeline endpoints accept optional `source_url` body param for subpage URL override
- **Composables**: `use-page-builder.ts` (editor state, sections, dirty tracking), `use-template-gallery.ts` (fetch/cache/filter)
- **Section renderers**: 16 async components in `components/sections/` for live preview (hero, intro, tabs, color-picker, specs, gallery, feature-cards, video, cta-banner, content-block, accordion, enquiry-form, map, alert, divider, renderer)

## Available Skills (14 Total)

| Skill | Purpose | Key Capability |
|-------|---------|----------------|
| **cloudflare-browser** | Browser automation | CDP control, screenshots, videos, network monitoring |
| **oem-agent-hooks** | Lifecycle hooks | Health monitoring, embedding sync, repair |
| **oem-api-discover** | API discovery | CDP network interception, classify data APIs |
| **oem-brand-ambassador** | Page generation | AI-driven marketing page creation per OEM brand |
| **oem-build-price-discover** | Configurator discovery | Build & Price URL patterns, API endpoints, DOM selectors |
| **oem-crawl** | Page crawling | Two-stage pipeline (cheap-check → full render), change detection |
| **oem-data-sync** | Data synchronization | 37 seed/enrich scripts for products, accessories, colors, offers |
| **oem-design-capture** | Design assets | Vision-based brand analysis using Kimi K2.5 |
| **oem-extract** | Content parsing | JSON-LD → OG → CSS → LLM fallback extraction |
| **oem-report** | Reporting | Slack alerts, daily digests across 18 OEMs |
| **oem-sales-rep** | Sales intelligence | Slack chatbot for product/offer queries |
| **oem-semantic-search** | Search & discovery | pgvector semantic search, cross-OEM similarity |
| **oem-ux-knowledge** | UX patterns | Design knowledge base with vector retrieval |
| **autonomous-agents** | Workflow automation | 7 sub-skills: price-validator, link-validator, image-validator, offer-manager, product-enricher, variant-sync, compliance-checker |

## Scheduled Cron Jobs

| Schedule | Frequency | Purpose | Target |
|----------|-----------|---------|--------|
| `0 3 * * *` | Daily 3am | All-OEM data sync | Colors, pricing, driveaway (Kia BYO + Hyundai CGI + Mazda + Mitsubishi GraphQL + generic) |
| `0 4 * * *` | Daily 4am | Homepage crawl | OEM homepages |
| `0 5 * * *` | Daily 5am | Offers crawl | Special promotions |
| `0 */12 * * *` | Every 12 hours | Vehicles crawl | Vehicle inventory, specs, variant colors |
| `0 6 * * *` | Daily 6am | News crawl | OEM news updates |
| `0 7 * * *` | Daily 7am | Sitemap crawl | Sitemap + design checks |

**Handler**: `src/scheduled.ts` → `OemAgentOrchestrator.runScheduledCrawl(crawlType)`

Each cron trigger now passes its `crawl_type` to the orchestrator, which filters `source_pages` by `page_type`:
- `homepage` → `homepage` pages only (banners)
- `offers` → `offers` pages only (offers + offer-page banners)
- `vehicles` → `vehicle`, `category`, `build_price` pages (variants/models)
- `news` → `news` pages only
- `sitemap` → `sitemap` pages only

## Environment Variables (Container)

### AI Providers
- `ANTHROPIC_API_KEY` - Direct Anthropic access
- `OPENAI_API_KEY` - OpenAI models
- `CLOUDFLARE_AI_GATEWAY_API_KEY` - AI Gateway proxy
- `CF_AI_GATEWAY_ACCOUNT_ID` - Account ID
- `CF_AI_GATEWAY_GATEWAY_ID` - Gateway ID

### R2 Storage (Fixed 2026-02-18)
- `R2_ACCESS_KEY_ID` ✅ Now passed to container
- `R2_SECRET_ACCESS_KEY` ✅ Now passed to container
- `R2_BUCKET_NAME` ✅ Now passed to container
- `CF_ACCOUNT_ID` ✅ Already passed

### Gateway & Channels
- `OPENCLAW_GATEWAY_TOKEN` - Gateway authentication
- `OPENCLAW_DEV_MODE` - Development mode (true)
- `TELEGRAM_BOT_TOKEN` - Telegram channel
- `DISCORD_BOT_TOKEN` - Discord channel
- `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` - Slack channel

### OEM Agent
- `SUPABASE_URL` - Database endpoint
- `SUPABASE_SERVICE_ROLE_KEY` - Database auth
- `GROQ_API_KEY` - Fast inference (classification, validation via Llama 3.3 70B)
- `TOGETHER_API_KEY` - Alternative models
- `GEMINI_API_KEY` / `GOOGLE_API_KEY` - Gemini 2.5 Pro (extraction), text-embedding-004 (vectors)

### Browser & Research
- `LIGHTPANDA_URL` - Lightpanda browser CDP WebSocket URL (primary browser)
- `CDP_SECRET` - Cloudflare Browser Rendering auth (fallback)
- `BRAVE_API_KEY` - Web search
- `PERPLEXITY_API_KEY` - Research API
- `GOOGLE_API_KEY` - Embeddings

## Recent Fixes (2026-02-18)

### Issue: Conversation Memory Not Persisting
**Root Cause**: Worker wasn't passing R2 credentials to container
- `r2_configured()` check in start-openclaw.sh failed
- No R2 restore on startup
- No background sync loop started

**Fix**: Updated `src/gateway/env.ts` to pass:
```typescript
if (env.R2_ACCESS_KEY_ID) envVars.R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
if (env.R2_SECRET_ACCESS_KEY) envVars.R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;
if (env.R2_BUCKET_NAME) envVars.R2_BUCKET_NAME = env.R2_BUCKET_NAME;
```

**Result**: ✅ Conversations now persist across container restarts

### Previous Fix: Gateway Exit Code 1
**Issue**: Gateway failed to start with browser profile validation error
**Root Cause**: Custom `browser.profiles.cloudflare.color: 'blue'` (expected hex format)
**Fix**: Replaced entire start-openclaw.sh with official cloudflare/moltworker version (rclone-based)

## Documentation Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Development guide for AI agents (architecture, patterns, commands) |
| `CONTRIBUTING.md` | Contribution guidelines |
| `docs/IMPLEMENTATION_SUMMARY.md` | Implementation notes |
| `docs/ACCESSORIES_DISCOVERY.md` | Accessory data sources, methodology, edge cases per OEM |
| `docs/crawl-config-v1.2.md` | Crawl configuration reference |
| `skills/*/SKILL.md` | Individual skill documentation |
| `README.md` | User-facing setup and usage (if exists) |
| **`BRIEFING.md`** | This file - system overview |

## Key URLs

- **Gateway**: https://oem-agent.adme-dev.workers.dev/
- **Control UI**: https://oem-agent.adme-dev.workers.dev/ (served by OpenClaw)
- **Admin UI**: https://oem-agent.adme-dev.workers.dev/_admin/ (device management)
- **API Endpoints**: /api/* (device pairing, gateway status)
- **Debug Endpoints**: /debug/* (requires DEBUG_ROUTES=true)
- **Browser CDP**: wss://oem-agent.adme-dev.workers.dev/cdp?secret=$CDP_SECRET

## Commands

```bash
# Deployment
npm run build      # Build worker + client
npm run deploy     # Deploy to Cloudflare
wrangler deploy    # Direct deploy

# Development
npm run dev        # Vite dev server (client UI)
npm run start      # wrangler dev (local worker)
npm test           # Run tests (vitest)
npm run typecheck  # TypeScript validation

# Monitoring
wrangler tail      # Live logs
wrangler secret list  # List configured secrets
```

## Testing OpenClaw

1. **Access Control UI**: https://oem-agent.adme-dev.workers.dev/
2. **Start Conversation**: Chat with OpenClaw
3. **Test Persistence**: Refresh page - conversation should be remembered
4. **Test Skills**: Ask OpenClaw to use cloudflare-browser for a screenshot
5. **Test Browser**: Ask to navigate and capture a page

## Next Steps

### For OpenClaw Configuration
- Skills are already loaded (14 skills in /root/clawd/skills/)
- Documentation is in skills/*/SKILL.md
- OpenClaw can read these on startup

### For New Skills
- Add to `skills/` directory
- Include SKILL.md with frontmatter (name, description)
- Add scripts/ subdirectory if needed
- Deploy via wrangler

### For System Context
- OpenClaw doesn't automatically know about THIS troubleshooting session
- Skills provide domain-specific capabilities (browser, crawling, extraction)
- To give OpenClaw broader system context, configure via Control UI settings

## Support & Troubleshooting

- **Logs**: `wrangler tail --format pretty`
- **Secrets**: `wrangler secret list`
- **Debug Routes**: Set `DEBUG_ROUTES=true` → /debug/processes, /debug/env
- **R2 Data**: Stored in bucket `oem-agent-assets` under openclaw/, workspace/, skills/
- **Container Restart**: Cloudflare automatically restarts on crash, restores from R2

---

## Monitored OEMs (17)

| ID | Name |
|----|------|
| ford-au | Ford Australia |
| gwm-au | Great Wall Motors Australia |
| hyundai-au | Hyundai Australia |
| isuzu-au | Isuzu UTE Australia |
| kgm-au | KGM (formerly SsangYong) |
| kia-au | Kia Australia |
| ldv-au | LDV Australia |
| mazda-au | Mazda Australia |
| mitsubishi-au | Mitsubishi Motors Australia |
| nissan-au | Nissan Australia |
| subaru-au | Subaru Australia |
| suzuki-au | Suzuki Australia |
| toyota-au | Toyota Australia |
| volkswagen-au | Volkswagen Australia |
| gmsv-au | GMSV Australia |
| foton-au | Foton Australia |
| gac-au | GAC Australia |

## Seed Scripts (dashboard/scripts/)

Pre-built scripts for populating OEM data:

| Script | OEM | Data |
|--------|-----|------|
| `seed-mitsubishi-apis.mjs` | Mitsubishi | 3 APIs + docs (Magento 2 GraphQL) |
| `seed-mitsubishi-products.mjs` | Mitsubishi | 5 families, state pricing |
| `seed-suzuki-apis.mjs` | Suzuki | 3 APIs + docs (static S3/CloudFront) |
| `seed-suzuki-products.mjs` | Suzuki | 7 models, 18 products, 18 pricing rows |
| `seed-nissan-apis.mjs` | Nissan | 5 APIs + docs (multi-API: GraphQL+Apigee+Helios) |
| `seed-nissan-products.mjs` | Nissan | 10 models, 41 products (pricing needs browser session) |
| `seed-kgm-apis.mjs` | KGM | 6 APIs + docs (Payload CMS, no auth) |
| `seed-kgm-products.mjs` | KGM | 8 models, 26 products, 134 colours, 26 pricing rows |
| `seed-kgm-accessories.mjs` | KGM | 225 accessories, 300+ model links, 7 categories (Payload CMS) |
| `seed-mitsubishi-accessories.mjs` | Mitsubishi | 223 accessories, 264+ model links (Magento GraphQL) |
| `seed-mazda-accessories.mjs` | Mazda | 266 accessories, 387 model links (React hydration HTML) |
| `seed-isuzu-accessories.mjs` | Isuzu | 204 accessories (BuildandQuote Sitecore API) |
| `seed-hyundai-accessories.mjs` | Hyundai | 526 accessories, 526 model links (Content API v3, no auth) |
| `seed-kia-accessories.mjs` | Kia | 246 accessories, 391 model links (JSON-LD structured data) |
| `seed-subaru-accessories.mjs` | Subaru | 299 accessories, 414 model links (Retailer API v1, x-api-key) |
| `seed-nissan-accessories.mjs` | Nissan | 179 accessories, 207 model links (HTML scraping, dual templates) |
| `seed-vw-accessories.mjs` | Volkswagen | 353 accessories (e-catalogue GraphQL, OSSE/CARIAD) |
| `seed-gwm-accessories.mjs` | GWM | 181 accessories, 220 model links (Storyblok CDN API) |
| `seed-gwm-accessories.mjs` | GWM | 181 accessories, 220 model links (Storyblok CDN API) |
| `seed-gwm-colors.mjs` | GWM | 184 variant_colors enriched with Storyblok names + images |
| `seed-nissan-colors.mjs` | Nissan | 422 variant_colors (AEM version-explorer JSON) |
| `enrich-gwm-storyblok.mjs` | GWM | Enrich 184 colors with real names + hero/gallery (Storyblok) |
| `enrich-kia-heroes.mjs` | Kia | Enrich 328 hero images from CDN slug matching |
| `seed-ford-colors.mjs` | Ford | 388 variant_colors from GPAS reference data (100% hero/swatch/gallery) |
| `seed-kia-offers.mjs` | Kia | 52 offers (15 main + 37 variant, two-tier AEM HTML scraping) |
| `seed-kgm-offers.mjs` | KGM | 8 offers (factory bonus, run-out, value-add from Payload CMS) |
| `seed-gwm-offer-images.mjs` | GWM | Enrich 35 offers with Storyblok images + ABN pricing |

| `seed-oem-portals.mjs` | All | 31 portal credentials from Monday.com board 15373501 |
| `seed-brochures.mjs` | Multi | 96/~179 brochure URLs (11 OEMs: Kia, Toyota, Hyundai, Mazda, Ford, KGM, Nissan, Mitsubishi, Isuzu, Subaru, GWM) |
| `seed-{oem}-specs.mjs` (13) | All | Technical specs for 757/796 products (100%), all 8 categories at 100% |
| `vectorize-pdfs.mjs` | Multi | PDF vectorization pipeline: download → pdf-parse → chunk → embed → upsert |

**Toyota** (21 models, 149 products, 802 colors, 132 pricing rows) was seeded via direct browser-to-Supabase REST API using Chrome MCP tools (Cloudflare-protected APIs, no seed script file).

**LDV** (13 models, 11 products with full specs_json, 47 colors with hero images, 9 pricing rows) was populated via Gatsby 5.14.6 `page-data.json` endpoints (i-Motor CMS backend). No browser rendering or API keys needed. 4 discovered APIs added to `seed-discovered-apis.mjs`. Framework: `gatsby` in OEM registry.

---

## New OEM Onboarding Checklist

When adding a new OEM to the platform, complete **all** steps below. See `docs/OEM_ONBOARDING.md` for full details.

### 1. Core Code (4 files)
- [ ] Add `'<oem>-au'` to `OemId` union in `src/oem/types.ts`
- [ ] Add OEM definition + registry entry in `src/oem/registry.ts`
- [ ] Add brand notes (colors, rendering notes) in `src/design/agent.ts` → `OEM_BRAND_NOTES`
- [ ] Create Supabase migration `supabase/migrations/<date>_<oem>_oem.sql` (OEM record + source pages)

### 2. Discovered APIs
- [ ] Add any discovered APIs to `dashboard/scripts/seed-discovered-apis.mjs`
- [ ] Insert discovered APIs into database (run seed script or direct insert)

### 3. Documentation & Count References (~25 files)
- [ ] Run `grep -rn "N OEM\|N Australian" --include="*.md" --include="*.ts" --include="*.mjs" --include="*.json" --include="*.vue"` and update **all** stale counts
- [ ] Key files: `BRIEFING.md`, `AGENTS.md`, `package.json`, `workspace/*.md`, `workspace-*/*.md`, `skills/*/SKILL.md`, `skills/*/index.ts`, `docs/*.md`, `dashboard/scripts/*.mjs`, `dashboard/src/pages/**/*.vue`
- [ ] Add OEM to the "Monitored OEMs" table in `BRIEFING.md`
- [ ] Add OEM to the "OEMs Seeded" table in `docs/DATABASE_SETUP.md`
- [ ] Update OEM ID lists in `workspace/MEMORY.md`, `workspace/AGENTS.md`, `workspace-crawler/SOUL.md`

### 4. Deploy
- [ ] `npx supabase db push` (use `--include-all` if needed, rename duplicate-timestamp files temporarily)
- [ ] `npm run deploy` (Cloudflare Worker)

### 5. Verify
- [ ] `npx tsc --noEmit` — no new errors
- [ ] `SELECT * FROM oems WHERE id = '<oem>-au'` returns 1 row
- [ ] `SELECT count(*) FROM source_pages WHERE oem_id = '<oem>-au'` returns expected count
- [ ] Dashboard OEM count is correct

### 6. Memory
- [ ] Update auto memory (`~/.claude/projects/.../memory/MEMORY.md`) with onboarding details

---

**Status**: ✅ Production Ready
**Last Deployment**: 2026-03-19
**Final State (2026-03-19)**:
- 18 OEMs ALL complete (incl. Chery AU + VW AU rebuilt from OneHub API)
- 796 products, 179 models, 4,952 colors, 1,158 pricing rows, 2,913 accessories
- 302 offers (100% images, 100% disclaimers, 68 with HTML formatting)
- 176 banners (desktop + mobile), 106 brochure PDFs, 231 source pages
- Universal disclaimer on all 18 OEMs, served via dealer API /catalog endpoint
- Offer detail dialog with collapsible disclaimers, finance breakdown, eligibility
- Daily all-OEM color + pricing sync (Kia BYO, Hyundai CGI, Mazda, Mitsubishi GQL, VW OneHub)
- Brand Ambassador protects page builder edits (manually_edited flag)
- Dynamic Kia color name discovery from swatch filenames (no more Unknown codes)

**Next Maintenance**: Run vectorize-pdfs.mjs for pdf_embeddings, add state-specific pricing APIs for Hyundai/Mitsubishi/Ford when discovered, extract finance disclaimers for Kia/Hyundai/GWM offers
