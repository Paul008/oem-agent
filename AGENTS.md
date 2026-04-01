# Agent Instructions

Guidelines for AI agents working on this codebase.

## Project Overview

This is a Cloudflare Worker that runs [OpenClaw](https://github.com/openclaw/openclaw) (formerly Moltbot/Clawdbot) in a Cloudflare Sandbox container. It provides:
- Proxying to the OpenClaw gateway (web UI + WebSocket)
- Admin UI at `/_admin/` for device management
- API endpoints at `/api/*` for device pairing
- Debug endpoints at `/debug/*` for troubleshooting

**Note:** The CLI tool and npm package are now named `openclaw`. Config files use `.openclaw/openclaw.json`. Legacy `.clawdbot` paths are supported for backward compatibility during transition.

## Project Structure

```
src/
├── index.ts          # Main Hono app, route mounting
├── types.ts          # TypeScript type definitions (OemId union, etc.)
├── config.ts         # Constants (ports, timeouts, paths)
├── orchestrator.ts   # Core: upsertProduct, syncVariantColors, buildSpecsJson, renderPageLightpanda
├── scheduled.ts      # Cloudflare cron triggers (homepage, offers, vehicles, news, sitemap)
├── auth/             # Cloudflare Access authentication
│   ├── jwt.ts        # JWT verification
│   ├── jwks.ts       # JWKS fetching and caching
│   └── middleware.ts # Hono middleware for auth
├── gateway/          # OpenClaw gateway management
│   ├── process.ts    # Process lifecycle (find, start)
│   ├── env.ts        # Environment variable building
│   ├── r2.ts         # R2 bucket mounting
│   ├── sync.ts       # R2 backup sync logic
│   └── utils.ts      # Shared utilities (waitForProcess)
├── oem/              # OEM definitions
│   ├── types.ts      # OemId union type (18 OEMs)
│   └── registry.ts   # OEM definitions + registry entries
├── design/           # Recipe Design System pipeline
│   ├── index.ts      # Design module exports
│   ├── agent.ts      # OEM_BRAND_NOTES, brand-specific rendering config
│   ├── token-crawler.ts       # Headless CSS token extraction from OEM sites
│   ├── token-crawler.test.ts  # Token crawler tests
│   ├── recipe-extractor.ts    # Screenshot → structured recipe JSON via vision AI
│   ├── recipe-extractor.test.ts # Recipe extractor tests
│   ├── component-generator.ts # Recipe JSON + tokens → production HTML/CSS
│   ├── component-generator.test.ts # Component generator tests
│   ├── extraction-runner.ts   # Orchestrates multi-step extraction pipeline
│   ├── memory.ts              # Design memory persistence (extraction_runs, design_profile_json)
│   ├── pipeline.ts            # 7-step adaptive pipeline: Clone→Screenshot→Classify→Extract→Validate→Generate→Learn
│   ├── prompt-builder.ts      # AI prompt construction for extraction/generation
│   ├── page-generator.ts      # getPageBySlug, getGeneratedPage (R2 lookup)
│   ├── page-capturer.ts       # Screenshot capture for pages
│   ├── page-cloner.ts         # Clone OEM pages for editing
│   ├── page-structurer.ts     # Structure pages from screenshots
│   └── ux-knowledge.ts        # UX pattern knowledge base with vector retrieval
├── routes/           # API route handlers
│   ├── index.ts      # Route aggregation
│   ├── api.ts        # /api/* endpoints (devices, gateway)
│   ├── oem-agent.ts  # 70+ admin endpoints (crawl, design, recipes, pages, etc.)
│   ├── admin-ui.ts   # /_admin/* static file serving
│   ├── agents.ts     # Autonomous agent endpoints
│   ├── cron.ts       # OpenClaw cron job execution
│   ├── dealer-api.ts # WP-compatible dealer API (/catalog, /offers)
│   ├── media.ts      # R2 media upload/listing
│   ├── onboarding.ts # OEM onboarding wizard endpoints
│   ├── public.ts     # Public-facing endpoints
│   ├── cdp.ts        # CDP browser proxy
│   └── debug.ts      # /debug/* endpoints
├── sync/             # OEM-specific data sync scripts
│   └── kia-colors.ts # Kia-specific color sync (dedicated)
└── client/           # React admin UI (Vite)
    ├── App.tsx
    ├── api.ts        # API client
    └── pages/

dashboard/
├── src/
│   ├── pages/dashboard/       # 40+ Vue pages (see Dashboard Pages below)
│   │   ├── style-guide.vue    # Per-OEM style guides with live font loading
│   │   ├── recipes.vue        # Recipe browser with quality scores
│   │   ├── recipe-analytics.vue # Recipe usage breakdowns
│   │   ├── design-health.vue  # Design drift monitoring
│   │   ├── stock-health.vue   # Data freshness dashboard
│   │   ├── page-templates.vue # Template composition manager
│   │   ├── agents/            # Autonomous agent UI
│   │   ├── settings/          # AI models, regeneration, webhooks
│   │   └── page-builder/      # Visual page editor
│   └── composables/           # Vue composables
│       ├── use-page-builder.ts
│       ├── use-template-gallery.ts
│       └── use-realtime.ts    # Supabase realtime subscriptions
└── scripts/                   # 38+ seed/enrich scripts

config/
└── openclaw/
    └── cron-jobs.json         # 17 jobs (16 scheduled + 1 event-driven banner-triage)

skills/                        # 16 OpenClaw skills
├── autonomous-agents/         # 8 agents: price-validator, product-enricher, link-validator,
│                              #   offer-manager, compliance-checker, image-validator, variant-sync,
│                              #   banner-triage (5-layer discovery cascade)
├── cloudflare-browser/
├── oem-agent-hooks/
├── oem-api-discover/
├── oem-brand-ambassador/
├── oem-build-price-discover/
├── oem-crawl/
├── oem-data-sync/
├── oem-design-capture/
├── oem-extract/
├── oem-orchestrator/
├── oem-report/
├── oem-sales-rep/
├── oem-semantic-search/
└── oem-ux-knowledge/
```

## Key Patterns

### Environment Variables

- `DEV_MODE` - Skips CF Access auth AND bypasses device pairing (maps to `OPENCLAW_DEV_MODE` for container)
- `DEBUG_ROUTES` - Enables `/debug/*` routes (disabled by default)
- See `src/types.ts` for full `MoltbotEnv` interface

### CLI Commands

When calling the OpenClaw CLI from the worker, always include `--url ws://localhost:18789`:
```typescript
sandbox.startProcess('openclaw devices list --json --url ws://localhost:18789')
```

CLI commands take 10-15 seconds due to WebSocket connection overhead. Use `waitForProcess()` helper in `src/routes/api.ts`.

### Success Detection

The CLI outputs "Approved" (capital A). Use case-insensitive checks:
```typescript
stdout.toLowerCase().includes('approved')
```

### Recipe Composition Pattern

Recipes are reusable section definitions extracted from OEM screenshots. The composition flow:
1. `TokenCrawler` extracts CSS tokens (colors, fonts, spacing) from live OEM sites
2. `RecipeExtractor` takes a screenshot URL → vision AI → structured recipe JSON
3. `ComponentGenerator` takes recipe JSON + brand tokens → production HTML/CSS
4. Recipes are stored in Supabase and can be composed into pages via the Page Builder

### Smart AI Model Routing

AI tasks are routed to different providers based on cost/quality tradeoffs:
- **Classification/Validation**: Groq Llama 3.3 70B (fast, cheap) or Workers AI Llama Vision (free)
- **Extraction**: Gemini 2.5 Pro (vision-capable, good at structured output)
- **Component Generation**: Claude Sonnet 4.5 (best code quality)
- **Embeddings**: Google text-embedding-004 (768-dim vectors)
- Model routing is configurable via `/admin/ai-model-config` endpoint and `settings/ai-models.vue` dashboard page

### Design Token Consolidation

OEM design tokens flow through multiple stages:
1. **Crawled tokens**: `TokenCrawler` extracts raw CSS from live sites
2. **Applied tokens**: Admin reviews and applies via `/admin/tokens/apply-crawled`
3. **Stored tokens**: Persisted in `oems.design_profile_json` JSONB column
4. **Font hosting**: OEM fonts uploaded to R2, loaded dynamically via `@font-face` in style guides
5. **Drift detection**: Weekly cron compares live tokens against stored profile

## Design Pipeline

### TokenCrawler (`src/design/token-crawler.ts`)
Headless browser crawl of OEM websites to extract CSS design tokens. Uses Lightpanda (primary) or Cloudflare Browser (fallback). Extracts:
- Color palettes (primary, secondary, accent, background, text)
- Typography (font families, sizes, weights, line heights)
- Spacing scale (padding, margin, gap values)
- Border radius values
- Component-specific tokens (button styles, card styles)

### RecipeExtractor (`src/design/recipe-extractor.ts`)
Takes a screenshot URL and uses vision AI to:
- Identify the UI pattern type (hero, tabs, gallery, etc.)
- Extract structured recipe JSON with content, layout, and styling data
- Classify the section against 15 known section types
- Score extraction confidence

### ComponentGenerator (`src/design/component-generator.ts`)
Transforms recipe JSON + brand tokens into production-ready components:
- Injects OEM-specific brand tokens (colors, fonts, spacing)
- Generates semantic HTML with accessibility attributes
- Produces scoped CSS using design tokens as custom properties
- Supports theme variants per OEM brand guidelines

### Design Health Monitoring
- **Drift detection**: Compares live OEM site tokens against stored profiles
- **Quality scoring**: Evaluates generated components for accessibility, brand accuracy, rendering fidelity
- **Recipe analytics**: Tracks recipe usage, quality trends, per-OEM/per-type breakdowns

## Dashboard Pages

All pages are in `dashboard/src/pages/dashboard/`:

### Core Data Pages
| Page | Description |
|------|-------------|
| `index.vue` | Overview — summary stats and counts |
| `oems.vue` | OEM registry (18 manufacturers) |
| `products.vue` | Models & variants — expandable model → variant table |
| `variants.vue` | Variant-level data explorer |
| `colors.vue` | Variant colors — grid with hero images, swatch picker, 360 viewer |
| `specs.vue` | Technical specifications with category filters |
| `pricing.vue` | Per-state driveaway pricing |
| `offers.vue` | Offers — grid with hero images, savings/price badges, ABN pricing |
| `banners.vue` | Homepage/offers hero banners |
| `accessories.vue` | Accessory catalog with model links |

### Design & Recipe Pages
| Page | Description |
|------|-------------|
| `style-guide.vue` | Per-OEM style guides — live font loading, token visualization, brand palettes |
| `recipes.vue` | Recipe browser — thumbnails, OEM/type filters, quality scores |
| `recipe-analytics.vue` | Recipe usage breakdowns, quality trends |
| `design-health.vue` | Design drift monitoring, brand compliance scores, token freshness |
| `design-memory.vue` | Extraction run history, quality scores, pipeline analytics |
| `page-templates.vue` | Save and apply full page template compositions |

### Page Builder
| Page | Description |
|------|-------------|
| `page-builder/index.vue` | Template gallery — browse OEM sections, curated templates |
| `page-builder/[slug].vue` | Visual editor — split-pane, undo/redo, template drawer |
| `model-pages.vue` | AI-generated model pages — preview, regenerate, subpage management |
| `page-builder-docs.vue` | Page builder documentation |

### Operations & Monitoring
| Page | Description |
|------|-------------|
| `operations.vue` | System operations dashboard |
| `runs.vue` | Import/crawl run history |
| `changes.vue` | Change event audit log |
| `source-pages.vue` | Monitored URLs |
| `stock-health.vue` | Data freshness, stale products, crawl coverage |
| `cron.vue` | Cron job status and history |
| `agent-infra.vue` | Agent infrastructure diagnostics |
| `agents/index.vue` | Autonomous agent dashboard |
| `agents/[id].vue` | Individual agent run details |

### Configuration & Settings
| Page | Description |
|------|-------------|
| `settings/ai-models.vue` | AI model routing configuration |
| `settings/regeneration.vue` | Page regeneration strategy |
| `settings/webhooks.vue` | Webhook configuration |
| `portals.vue` | OEM portal credentials |
| `portal-assets.vue` | Brand asset management |
| `media.vue` | R2 media browser and upload |

### Discovery & Integration
| Page | Description |
|------|-------------|
| `apis.vue` | Discovered API endpoints |
| `docs.vue` | OEM API documentation |
| `dealer-api.vue` | Dealer API endpoint testing |
| `onboarding.vue` | New OEM onboarding wizard |
| `onboarding-docs.vue` | Onboarding documentation and checklist |

## Commands

```bash
npm test              # Run tests (vitest)
npm run test:watch    # Run tests in watch mode
npm run build         # Build worker + client
npm run deploy        # Build and deploy to Cloudflare
npm run dev           # Vite dev server
npm run start         # wrangler dev (local worker)
npm run typecheck     # TypeScript check
```

## Testing

Tests use Vitest. Test files are colocated with source files (`*.test.ts`).

Current test coverage:
- `auth/jwt.test.ts` - JWT decoding and validation
- `auth/jwks.test.ts` - JWKS fetching and caching
- `auth/middleware.test.ts` - Auth middleware behavior
- `gateway/env.test.ts` - Environment variable building
- `gateway/process.test.ts` - Process finding logic
- `gateway/r2.test.ts` - R2 mounting logic
- `gateway/sync.test.ts` - R2 backup sync logic

When adding new functionality, add corresponding tests.

## Code Style

- Use TypeScript strict mode
- Prefer explicit types over inference for function signatures
- Keep route handlers thin - extract logic to separate modules
- Use Hono's context methods (`c.json()`, `c.html()`) for responses

## Supabase Database

All data is stored in Supabase (https://nnihmdmsglkxpmilmjjc.supabase.co).

**Entity hierarchy**: `oems` → `vehicle_models` → `products` → `variant_colors` / `variant_pricing`
                                              → `accessories` (via `accessory_models` join)

| Table | Purpose | Key Constraints |
|-------|---------|----------------|
| `oems` (18) | OEM registry | PK: id (e.g. 'ford-au'). Has config_json.api_docs, design_profile_json |
| `vehicle_models` (~179) | Models per OEM | Unique: oem_id, slug. `brochure_url` (106/179) |
| `products` (796) | Variants/grades | `specs_json` JSONB (auto-built on every upsert via `orchestrator.buildSpecsJson()`). model_id FK |
| `variant_colors` (~4952) | Colour options | Unique: product_id, color_code. Auto-synced for all OEMs via `orchestrator.syncVariantColors()` |
| `pdf_embeddings` | Vectorized PDF chunks | vector(768), HNSW index, `search_pdfs_semantic()` RPC |
| `variant_pricing` (~1158) | Per-state driveaway | Columns: driveaway_nsw/vic/qld/wa/sa/tas/act/nt |
| `accessories` (2913) | Accessory catalog per OEM | Unique: oem_id, external_key. Has parent_id self-ref, inc_fitting |
| `accessory_models` (2981) | Accessories ↔ models join | Unique: accessory_id, model_id |
| `discovered_apis` (58+) | API endpoints | Unique: oem_id, url. Has schema_json, reliability_score |
| `source_pages` | Monitored URLs | |
| `change_events` | Change audit log | |
| `offers` (322) | Promotions (all 18 OEMs) | hero_image_r2_key, abn_price_amount, saving_amount |
| `extraction_runs` | Design pipeline run history | oem_id, model_slug, quality_score, cost tracking |
| `import_runs` | Crawl jobs | |

**OEM IDs**: chery-au, ford-au, foton-au, gac-au, gmsv-au, gwm-au, hyundai-au, isuzu-au, kgm-au, kia-au, ldv-au, mazda-au, mitsubishi-au, nissan-au, subaru-au, suzuki-au, toyota-au, volkswagen-au

### Dashboard
- **URL**: https://oem-agent.pages.dev (Cloudflare Pages)
- **Stack**: Vue 3 + shadcn-vue-admin + Supabase client
- **Auth**: Supabase magic link (email)
- **Source**: `dashboard/` directory
- **Seed scripts**: `dashboard/scripts/seed-{oem}-*.mjs` (products, colors, accessories, specs, brochures)
- **Pages**: 40+ pages — see Dashboard Pages section above for full listing

#### Page Builder Architecture
- **Editor** (`page-builder/[slug].vue`): Split-pane layout (sidebar + canvas), responsive toolbar, undo/redo, copy/paste
- **Template Gallery** (`page-builder/index.vue`): Browse sections from all OEM pages + 10 curated OEM-branded templates
- **In-editor Drawer** (`TemplateGalleryDrawer.vue`): Sheet drawer from Add Section picker, defaults to current OEM
- **Section Types** (15): hero, intro, tabs, color-picker, specs-grid, gallery, feature-cards, video, cta-banner, content-block, accordion, enquiry-form, map, alert, divider
- **Composables**: `use-page-builder.ts` (editor state, subpage context), `use-template-gallery.ts` (fetch/cache/filter)
- **Section Renderers**: 16 async components in `components/sections/` for live canvas preview
- **Section Editor** (`SectionProperties.vue`): Per-type property forms with image thumbnails, media upload (R2), theme/variant toggles
- **Data**: `oem-templates.ts` (curated templates), `section-templates.ts` (type definitions + defaults)
- **Subpages**: Convention-based `{modelSlug}--{subpageSlug}` stored flat in R2. 9 predefined types (specs, design, performance, safety, gallery, pricing, lifestyle, accessories, colours) + custom. Breadcrumb navigation in editor, source URL input for cloning. Endpoints: `POST /admin/create-subpage`, `DELETE /admin/delete-subpage`. Clone/Pipeline accept optional `source_url` body override.

## Documentation

- `README.md` - User-facing documentation (setup, configuration, usage)
- `AGENTS.md` - This file, for AI agents
- `BRIEFING.md` - System overview and status
- `docs/DATABASE_SETUP.md` - Database schema and setup
- `docs/DATABASE_RESTRUCTURE.md` - Schema restructure status

Development documentation goes in AGENTS.md, not README.md.

---

## Architecture

```
Browser
   │
   ▼
┌─────────────────────────────────────┐
│     Cloudflare Worker (index.ts)    │
│  - Starts OpenClaw in sandbox       │
│  - Proxies HTTP/WebSocket requests  │
│  - Passes secrets as env vars       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│     Cloudflare Sandbox Container    │
│  ┌───────────────────────────────┐  │
│  │     OpenClaw Gateway          │  │
│  │  - Control UI on port 18789   │  │
│  │  - WebSocket RPC protocol     │  │
│  │  - Agent runtime              │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Worker that manages sandbox lifecycle and proxies requests |
| `Dockerfile` | Container image based on `cloudflare/sandbox` with Node 22 + OpenClaw |
| `start-openclaw.sh` | Startup script: R2 restore → onboard → config patch → launch gateway |
| `wrangler.jsonc` | Cloudflare Worker + Container configuration |

## Local Development

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your ANTHROPIC_API_KEY
npm run start
```

### Environment Variables

For local development, create `.dev.vars`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
DEV_MODE=true           # Skips CF Access auth + device pairing
DEBUG_ROUTES=true       # Enables /debug/* routes
```

### WebSocket Limitations

Local development with `wrangler dev` has issues proxying WebSocket connections through the sandbox. HTTP requests work but WebSocket connections may fail. Deploy to Cloudflare for full functionality.

## Docker Image Caching

The Dockerfile includes a cache bust comment. When changing `start-openclaw.sh`, bump the version:

```dockerfile
# Build cache bust: 2026-02-06-v28-openclaw-upgrade
```

## Gateway Configuration

OpenClaw configuration is built at container startup:

1. R2 backup is restored if available (with migration from legacy `.clawdbot` paths)
2. If no config exists, `openclaw onboard --non-interactive` creates one based on env vars
3. `start-openclaw.sh` patches the config for channels, gateway auth, and trusted proxies
4. Gateway starts with `openclaw gateway --allow-unconfigured --bind lan`

### AI Provider Priority

The startup script selects the auth choice based on which env vars are set:

1. **Cloudflare AI Gateway** (native): `CLOUDFLARE_AI_GATEWAY_API_KEY` + `CF_AI_GATEWAY_ACCOUNT_ID` + `CF_AI_GATEWAY_GATEWAY_ID`
2. **Direct Anthropic**: `ANTHROPIC_API_KEY` (optionally with `ANTHROPIC_BASE_URL`)
3. **Direct OpenAI**: `OPENAI_API_KEY`
4. **Legacy AI Gateway**: `AI_GATEWAY_API_KEY` + `AI_GATEWAY_BASE_URL` (routes through Anthropic base URL)

### Container Environment Variables

These are the env vars passed TO the container (internal names):

| Variable | Config Path | Notes |
|----------|-------------|-------|
| `ANTHROPIC_API_KEY` | (env var) | OpenClaw reads directly from env |
| `OPENAI_API_KEY` | (env var) | OpenClaw reads directly from env |
| `CLOUDFLARE_AI_GATEWAY_API_KEY` | (env var) | Native AI Gateway key |
| `CF_AI_GATEWAY_ACCOUNT_ID` | (env var) | Account ID for AI Gateway |
| `CF_AI_GATEWAY_GATEWAY_ID` | (env var) | Gateway ID for AI Gateway |
| `OPENCLAW_GATEWAY_TOKEN` | `--token` flag | Mapped from `MOLTBOT_GATEWAY_TOKEN` |
| `OPENCLAW_DEV_MODE` | `controlUi.allowInsecureAuth` | Mapped from `DEV_MODE` |
| `TELEGRAM_BOT_TOKEN` | `channels.telegram.botToken` | |
| `DISCORD_BOT_TOKEN` | `channels.discord.token` | |
| `SLACK_BOT_TOKEN` | `channels.slack.botToken` | |
| `SLACK_APP_TOKEN` | `channels.slack.appToken` | |

## OpenClaw Config Schema

OpenClaw has strict config validation. Common gotchas:

- `agents.defaults.model` must be `{ "primary": "model/name" }` not a string
- `gateway.mode` must be `"local"` for headless operation
- No `webchat` channel - the Control UI is served automatically
- `gateway.bind` is not a config option - use `--bind` CLI flag

See [OpenClaw docs](https://docs.openclaw.ai/) for full schema.

## Common Tasks

### Adding a New API Endpoint

1. Add route handler in `src/routes/api.ts`
2. Add types if needed in `src/types.ts`
3. Update client API in `src/client/api.ts` if frontend needs it
4. Add tests

### Adding a New Environment Variable

1. Add to `MoltbotEnv` interface in `src/types.ts`
2. If passed to container, add to `buildEnvVars()` in `src/gateway/env.ts`
3. Update `.dev.vars.example`
4. Document in README.md secrets table

### Debugging

```bash
# View live logs
npx wrangler tail

# Check secrets
npx wrangler secret list
```

Enable debug routes with `DEBUG_ROUTES=true` and check `/debug/processes`.

## R2 Storage Notes

R2 is mounted via s3fs at `/data/moltbot`. Important gotchas:

- **rsync compatibility**: Use `rsync -r --no-times` instead of `rsync -a`. s3fs doesn't support setting timestamps, which causes rsync to fail with "Input/output error".

- **Mount checking**: Don't rely on `sandbox.mountBucket()` error messages to detect "already mounted" state. Instead, check `mount | grep s3fs` to verify the mount status.

- **Never delete R2 data**: The mount directory `/data/moltbot` IS the R2 bucket. Running `rm -rf /data/moltbot/*` will DELETE your backup data. Always check mount status before any destructive operations.

- **Process status**: The sandbox API's `proc.status` may not update immediately after a process completes. Instead of checking `proc.status === 'completed'`, verify success by checking for expected output (e.g., timestamp file exists after sync).

- **R2 prefix migration**: Backups are now stored under `openclaw/` prefix in R2 (was `clawdbot/`). The startup script handles restoring from both old and new prefixes with automatic migration.
