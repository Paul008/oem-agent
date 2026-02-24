# System Architecture & Technical Context

## Platform Stack

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
│  │  - Agent runtime with 10 custom skills                │  │
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

### OpenClaw Container
- **Image**: cloudflare/sandbox:0.7.0
- **Runtime**: Node.js 22.13.1
- **Package**: openclaw@2026.2.3
- **Config**: /root/.openclaw/openclaw.json
- **Workspace**: /root/clawd/

### R2 Persistence Structure
```
r2://oem-agent-assets/
├── openclaw/          # OpenClaw config (synced every 30s)
├── workspace/         # Conversation history (synced every 30s)
└── skills/            # Custom skills (synced every 30s)
```

### Supabase Database
- **URL**: https://nnihmdmsglkxpmilmjjc.supabase.co
- **Access**: Via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

#### Tables

| Table | Rows | Purpose |
|-------|------|---------|
| `oems` | 16 | OEM registry with config_json.api_docs, design_profile_json |
| `vehicle_models` | 132 | Models per OEM (unique: oem_id, slug), has `brochure_url` (96/132) |
| `products` | 709 | Variants/grades, `specs_json` JSONB (692/709, 97.6%, 8 categories at 100%), model_id FK |
| `variant_colors` | ~4496 | Colour options per product (14/16 OEMs) |
| `variant_pricing` | 547 | Per-state driveaway pricing (NSW/VIC/QLD/WA/SA/TAS/ACT/NT) |
| `accessories` | 2702 | Accessory catalog per OEM (unique: oem_id, external_key) |
| `accessory_models` | 2826 | Many-to-many join: accessories ↔ vehicle_models |
| `discovered_apis` | 466 | API endpoints per OEM (unique: oem_id, url) |
| `source_pages` | 110 | URLs monitored for changes |
| `change_events` | 516 | Audit log of detected changes |
| `offers` | ~194 | Promotional offers (5 OEMs: hyundai 46, kia 52, gwm 35, nissan 18, kgm 8) |
| `import_runs` | 1823 | Crawl job tracking |
| `banners` | 50 | Homepage/offers hero banners (12 OEMs, 2 with video) |
| `oem_portals` | 31 | Marketing portal credentials per OEM (from Monday.com) |
| `pdf_embeddings` | — | Vectorized PDF chunks (brochures + guidelines), vector(768), HNSW index, `search_pdfs_semantic()` RPC |
| `extraction_runs` | — | Design pipeline run history (quality_score, cost, per oem_id + model_slug) |

#### Entity Hierarchy
```
oems (16) → vehicle_models (132) → products (709) → variant_colors (~4496)
                                                   → variant_pricing (547)
                                 → accessories (2702) via accessory_models (2826)
           → oem_portals (31) — portal credentials, brand guidelines
           → pdf_embeddings — vectorized brochures + guidelines for semantic search
           → extraction_runs — design pipeline run history with quality metrics
```

#### OEM IDs
ford-au, foton-au, gmsv-au, gwm-au, hyundai-au, isuzu-au, kgm-au, kia-au, ldv-au, mazda-au, mitsubishi-au, nissan-au, subaru-au, suzuki-au, toyota-au, volkswagen-au

### Cloudflare Browser Rendering
- **CDP WebSocket**: /cdp?secret=$CDP_SECRET
- **Purpose**: Headless Chrome for screenshots, scraping, video capture

### Dashboard UI
- **URL**: https://oem-agent.pages.dev (Cloudflare Pages)
- **Stack**: Vue 3 + shadcn-vue-admin + Supabase client
- **Source**: `dashboard/` directory
- **Sections**: OEM Intelligence, Catalog (Models & Variants, Pricing, Colors, Banners, Accessories, Offers, Model Pages), Design (Design Memory, Template Gallery, Page Builder, Page Builder Docs), Infrastructure (APIs, Source Pages, OEM Portals, API Docs)

### Design Memory & Adaptive Pipeline
- **7-step pipeline**: Clone → Screenshot → Classify → Extract → Validate → Generate → Learn
- **Source files**: `src/design/memory.ts`, `src/design/prompt-builder.ts`, `src/design/extraction-runner.ts`, `src/design/pipeline.ts`, `src/design/ux-knowledge.ts`, `src/design/component-generator.ts`
- **AI routing**: Groq (classification/validation), Gemini 2.5 Pro (extraction), Claude Sonnet 4.5 (bespoke components), Google text-embedding-004 (vectors)
- **Migration**: `supabase/migrations/20260222_design_memory.sql`
- **Vectorize index**: `ux-knowledge-base` (768-dim cosine) on Cloudflare Vectorize

### Page Builder
- **Editor** (`page-builder/[slug].vue`): Visual section editor with live preview, responsive toolbar, undo/redo, copy/paste
- **Template Gallery** (`page-builder/index.vue`): Browse sections from all 16 OEM generated pages + 10 curated templates
- **In-editor drawer**: Sheet drawer from Add Section picker, defaults to current page's OEM
- **Section types** (15): hero, intro, tabs, color-picker, specs-grid, gallery, feature-cards, video, cta-banner, content-block, accordion, enquiry-form, map, alert, divider
- **Tab variants**: `default` (horizontal tab bar), `kia-feature-bullets` (two-column bullet list)
- **Composables**: `use-page-builder.ts` (editor state, subpage context), `use-template-gallery.ts` (fetch/cache/filter)
- **Section renderers**: 16 async components in `components/sections/` for live canvas preview
- **Subpages**: `{modelSlug}--{subpageSlug}` slug convention, flat R2 storage. 9 predefined types + custom. Breadcrumb in editor, source URL input for clone. Endpoints: `create-subpage`, `delete-subpage`. Clone/Pipeline accept optional `source_url` body param.

## Recent Fixes (2026-02-18)

### ✅ R2 Persistence Fixed
- **Issue**: Conversations not persisting across restarts
- **Cause**: Worker wasn't passing R2 credentials to container
- **Fix**: Updated src/gateway/env.ts to pass R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
- **Result**: Conversations now persist successfully

### ✅ Gateway Startup Fixed
- **Issue**: Exit code 1, wouldn't start
- **Cause**: Attempted to use unsupported `systemPrompt` config key
- **Fix**: Reverted to official cloudflare/moltworker baseline
- **Result**: Gateway starts reliably

### ✅ Skills Loading Fixed
- **Issue**: Only 3 default skills visible instead of 10 custom ones
- **Cause**: OpenClaw looks in /root/.openclaw/workspace/skills/ but files were in /root/clawd/skills/
- **Fix**: Added symlink creation in startup script
- **Result**: All 10 custom skills now available

## OEM Data Seeding Status

| OEM | Models | Products | Specs | Colors | Pricing | Accessories | Offers | Banners | Brochures | Notes |
|-----|--------|----------|-------|--------|---------|-------------|--------|---------|-----------|-------|
| Toyota | 21 | 149 | 149/149 | 802 | 132 | — | — | 1 | 15/21 | Browser-session APIs |
| Hyundai | 15 | 76 | 76/76 | 468 | — | 526 | 46 | 1 | 13/17 | Content API v3 |
| Kia | 22 | 121 | 121/121 | 810 | — | 246 | 52 | 4 | 21/22 | JSON-LD + AEM KWCMS |
| Nissan | 10 | 47 | 41/47 | 422 | 0 | 179 | 18 | 5 | 7/11 | Multi-API |
| Mazda | 10 | 56 | 56/56 | 431 | — | 266 | — | 2 | 10/10 | React hydration |
| GWM | 9 | 35 | 35/35 | 184 | — | 181 | 35 | 11 | 5/8 | Storyblok CDN |
| Ford | 13 | 63 | 52/63 | 388 | — | — | — | 3 | 8/13 | GPAS, AEM CMS |
| Mitsubishi | 5 | 36 | 36/36 | 179 | state | 223 | — | — | 5/6 | Magento 2 GraphQL |
| KGM | 8 | 26 | 26/26 | 134 | 26 | 225 | 8 | 8 | 8/8 | Payload CMS |
| Subaru | 7 | 43 | 43/43 | 260 | — | 299 | — | — | 2/7 | Retailer API v1 |
| Suzuki | 7 | 18 | 18/18 | 115 | 18 | — | — | 5 | 0/7 | S3/CloudFront |
| Isuzu | 2 | 18 | 18/18 | 94 | — | 204 | — | 7 | 2/2 | Sitecore API |
| VW | — | 20 | 20/20 | — | 353 | — | 3 | — | — | E-catalogue GraphQL |
| LDV | — | 1 | 1/1 | — | — | — | — | — | — | Minimal data |
| GMSV | 7 | 7 | 7/7 | 55 | — | — | — | — | — | Dual-source: HTML scraping + Chevy API |
| Foton | 2 | 2 | 2/2 | 16 | — | — | — | — | — | HTML color dots, premium +$690 |

## Key URLs

- **Gateway**: https://oem-agent.adme-dev.workers.dev/
- **Control UI**: https://oem-agent.adme-dev.workers.dev/
- **Dashboard**: https://oem-agent.pages.dev
- **Browser CDP**: wss://oem-agent.adme-dev.workers.dev/cdp?secret=$CDP_SECRET

## Available Environment Variables

### AI Providers
- ANTHROPIC_API_KEY, OPENAI_API_KEY, CLOUDFLARE_AI_GATEWAY_API_KEY

### R2 Storage
- R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME

### OEM Agent Resources
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- CDP_SECRET (Browser Rendering)
- BRAVE_API_KEY, PERPLEXITY_API_KEY, GOOGLE_API_KEY

**Status**: ✅ All systems operational
**Last Updated**: 2026-02-24
