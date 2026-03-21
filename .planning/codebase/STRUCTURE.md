# Codebase Structure

**Analysis Date:** 2026-03-21

## Directory Layout

```
oem-agent/
├── src/                          # Worker + backend code (Cloudflare)
│   ├── index.ts                  # Worker entry point, Hono app setup
│   ├── container.ts              # Sandbox container HTTP server
│   ├── config.ts                 # Global config (port, timeouts)
│   ├── types.ts                  # TypeScript env types (MoltbotEnv, AppEnv)
│   ├── orchestrator.ts           # Main pipeline orchestrator (145K)
│   ├── scheduled.ts              # Cron handler entry point
│   ├── logging.test.ts           # Logging tests
│   ├── test-utils.ts             # Test helpers
│   ├── ai/                       # LLM routing & agents
│   │   ├── router.ts             # Model selection, cost/speed tradeoffs
│   │   ├── multi-provider.ts     # Groq/Together/Gemini client
│   │   ├── sales-rep.ts          # Content generation agent
│   │   └── index.ts              # Exports
│   ├── auth/                     # Authentication
│   │   ├── index.ts              # CF Access JWT verification
│   │   └── [other auth files]
│   ├── crawl/                    # Scheduling & cost control
│   │   ├── scheduler.ts          # CrawlScheduler (should/when to crawl)
│   │   └── index.ts              # Exports
│   ├── extract/                  # Data extraction from HTML
│   │   ├── engine.ts             # ExtractionEngine (JSON-LD, OpenGraph, CSS, LLM)
│   │   ├── orchestrator.ts       # Extract pipeline coordination
│   │   ├── cache.ts              # Extraction caching
│   │   ├── self-heal.ts          # Fallback extraction strategies
│   │   └── index.ts              # Exports
│   ├── design/                   # Brand token & page layout extraction
│   │   ├── agent.ts              # DesignAgent (vision API integration)
│   │   ├── pipeline.ts           # Design capture workflow
│   │   ├── page-capturer.ts      # Screenshots + rendering
│   │   ├── page-generator.ts     # AI-powered page generation
│   │   ├── component-generator.ts# Component JSON from vision
│   │   ├── prompt-builder.ts     # Kimi K2.5 prompt construction
│   │   ├── ux-knowledge.ts       # Vectorize semantic search
│   │   ├── page-cloner.ts        # Copy page structure
│   │   ├── page-structurer.ts    # Extract page sections
│   │   ├── extraction-runner.ts  # Run extraction on captured pages
│   │   ├── memory.ts             # Design session state
│   │   └── index.ts              # Exports
│   ├── oem/                      # OEM registry & type definitions
│   │   ├── registry.ts           # Built-in OEM definitions (17 OEMs)
│   │   ├── types.ts              # Entity types (Product, Offer, Banner, etc.)
│   │   └── [other OEM files]
│   ├── sync/                     # Data synchronization
│   │   ├── kia-colors.ts         # Kia-specific color sync (API-based)
│   │   ├── all-oem-sync.ts       # Bulk OEM data sync
│   │   └── orchestrator-controller.ts
│   ├── routes/                   # HTTP route handlers
│   │   ├── index.ts              # Route exports
│   │   ├── public.ts             # Public routes (landing page)
│   │   ├── api.ts                # /api/* product/offer endpoints
│   │   ├── oem-agent.ts          # /oem-agent/* OEM management
│   │   ├── dealer-api.ts         # /dealer/* dealer integrations
│   │   ├── cron.ts               # /cron/* cron management
│   │   ├── cdp.ts                # /cdp/* browser CDP protocol
│   │   ├── media.ts              # /media/* asset serving
│   │   ├── agents.ts             # /agents/* agent orchestration
│   │   ├── debug.ts              # /debug/* debugging tools
│   │   ├── admin-ui.ts           # /_admin/* admin interface
│   │   └── onboarding.ts         # OEM onboarding workflow
│   ├── notify/                   # Notifications & change detection
│   │   ├── change-detector.ts    # ChangeDetector, ChangeEvent logic
│   │   ├── slack.ts              # SlackNotifier, MultiChannelNotifier
│   │   └── [other notification files]
│   ├── gateway/                  # Moltbot Gateway integration
│   │   ├── [gateway-specific files]
│   │   └── index.ts              # Exports
│   ├── client/                   # Client-side code (if any)
│   │   ├── pages/                # Client pages
│   │   └── [other client files]
│   ├── workflows/                # OpenClaw/Moltbot workflows
│   │   └── [workflow definitions]
│   ├── utils/                    # Shared utilities
│   │   ├── supabase.ts           # Supabase client factory
│   │   ├── logging.ts            # Log formatting, redaction
│   │   ├── embeddings.ts         # Vector embedding utilities
│   │   ├── network-capture.ts    # Network request logging
│   │   ├── network-browser.ts    # Browser network interception
│   │   ├── cron-runs.ts          # Cron run tracking
│   │   ├── api-chainer.ts        # API discovery chaining
│   │   └── [other utilities]
│   ├── assets/                   # Static assets
│   │   ├── loading.html          # Loading page
│   │   ├── config-error.html     # Config error page
│   │   └── [other assets]
│   └── assets.d.ts               # Asset type declarations
│
├── dashboard/                    # Vue 3 admin dashboard (separate monorepo)
│   ├── package.json              # Shadcn-vue + Vue Router + Pinia
│   ├── vite.config.ts            # Build config
│   ├── src/
│   │   ├── main.ts               # Vue app entry
│   │   ├── App.vue               # Root component
│   │   ├── plugins/              # Plugin setup (router, pinia, i18n, query)
│   │   ├── router/               # Vue Router definitions
│   │   ├── pages/                # Page components
│   │   │   ├── dashboard/        # Main dashboard, agents, cron, settings
│   │   │   ├── apps/             # App management
│   │   │   ├── tasks/            # Task management
│   │   │   ├── users/            # User management
│   │   │   ├── ai-talk/          # AI chat interface
│   │   │   ├── settings/         # Settings pages
│   │   │   ├── auth/             # Login/registration
│   │   │   ├── billing/          # Billing & pricing
│   │   │   ├── errors/           # Error pages
│   │   │   └── marketing/        # Landing page
│   │   ├── components/           # Reusable UI components
│   │   │   ├── ui/               # Shadcn-vue component library (60+ components)
│   │   │   ├── app-sidebar/      # Navigation sidebar
│   │   │   ├── global-layout/    # Layout wrapper
│   │   │   ├── data-table/       # Data table (products, offers)
│   │   │   ├── custom-theme/     # Theme customization
│   │   │   ├── inspira-ui/       # Advanced components
│   │   │   ├── prop-ui/          # Prop components
│   │   │   ├── sva-ui/           # Storybook components
│   │   │   └── [other components]
│   │   ├── composables/          # Vue composables
│   │   │   ├── use-realtime.ts   # Supabase real-time subscription
│   │   │   ├── use-oem-data.ts   # OEM data querying
│   │   │   ├── use-cron-jobs.ts  # Cron job management
│   │   │   ├── use-agents.ts     # Agent status monitoring
│   │   │   ├── use-auth.ts       # Authentication
│   │   │   ├── use-axios.ts      # HTTP client wrapper
│   │   │   └── [other composables]
│   │   ├── stores/               # Pinia state stores
│   │   │   ├── theme.ts          # Theme state
│   │   │   ├── auth.ts           # Auth state
│   │   │   └── [other stores]
│   │   ├── services/             # API service layer
│   │   │   ├── api/              # REST API clients
│   │   │   └── types/            # Service type definitions
│   │   ├── utils/                # Utility functions
│   │   ├── constants/            # Constants (routes, pagination)
│   │   ├── types/                # TypeScript type definitions
│   │   ├── layouts/              # Layout components
│   │   └── assets/               # Images, icons, fonts
│   ├── public/                   # Static files
│   └── dist/                     # Build output
│
├── supabase/                     # Database migrations & configuration
│   ├── migrations/               # SQL migrations (schema, triggers)
│   │   ├── 20240101_init_schema.sql       # Core tables (products, offers, etc.)
│   │   ├── 20260319_chery_oem.sql        # Chery AU onboarding
│   │   ├── 20260301_foton_oem.sql        # Foton AU onboarding
│   │   └── [other migrations]
│   └── config.toml              # Supabase local config
│
├── skills/                       # OpenClaw autonomous agent skills
│   ├── oem-crawl/                # Page crawling skill
│   ├── oem-extract/              # Data extraction skill
│   ├── oem-orchestrator/         # Orchestration skill
│   ├── oem-design-capture/       # Design capture skill
│   ├── oem-data-sync/            # Data synchronization skill
│   ├── oem-api-discover/         # API discovery skill
│   ├── oem-build-price-discover/ # Build & price discovery skill
│   ├── oem-brand-ambassador/     # Brand extraction (quarterly)
│   ├── oem-report/               # Report generation
│   ├── oem-sales-rep/            # Sales rep content agent
│   ├── oem-semantic-search/      # Semantic search skill
│   ├── oem-ux-knowledge/         # UX knowledge retrieval
│   ├── autonomous-agents/        # Autonomous agent skills
│   │   ├── product-enricher/     # Product data enrichment
│   │   ├── price-validator/      # Price validation
│   │   ├── image-validator/      # Image validation
│   │   ├── link-validator/       # Link validation
│   │   ├── offer-manager/        # Offer management
│   │   ├── variant-sync/         # Variant color sync
│   │   └── compliance-checker/   # Compliance checking
│   ├── cloudflare-browser/       # Browser rendering skill
│   │   └── scripts/              # Rendering scripts
│   └── oem-api-hooks/            # API webhook handlers
│
├── config/                       # Configuration files
│   └── openclaw/                 # OpenClaw cron & job configs
│       ├── cron-jobs.json        # Cron job definitions
│       └── agent-config.json     # Agent configuration
│
├── lib/                          # Shared libraries (monorepo)
│   └── shared/                   # Types & utils shared across packages
│       └── types.ts              # Shared type definitions
│
├── docs/                         # Documentation
│   ├── oem-discovery/            # OEM discovery process docs
│   └── oem-knowledge-base/       # OEM knowledge base
│
├── test/                         # Test suite
│   └── e2e/                      # End-to-end tests
│       └── fixture/              # Test fixtures
│           └── server/           # Mock server
│
├── scripts/                      # Build & utility scripts
│   └── [scripts for seeding, migration, etc.]
│
├── workspace*/                   # Workspace definitions (monorepo)
│   ├── workspace-crawler/
│   ├── workspace-extractor/
│   ├── workspace-designer/
│   ├── workspace-reporter/
│   └── workspace-agent/
│
├── .github/                      # GitHub Actions workflows
│   └── workflows/                # CI/CD pipelines
│
├── .claude/                      # Claude AI configuration
│   ├── agents/                   # AI agent definitions
│   │   └── skills/               # Agent skills
│   └── [Claude workspace files]
│
├── .planning/                    # GSD planning documents
│   └── codebase/                 # Architecture docs (this file's location)
│
├── Dockerfile                    # Container image for Sandbox
├── wrangler.jsonc                # Cloudflare Worker configuration
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Root dependencies
├── package-lock.json             # Lock file
└── README.md                      # Project documentation
```

## Directory Purposes

**src/:**
- Purpose: Cloudflare Worker source code (request handlers, business logic)
- Contains: All production code for the OEM Agent
- Key files: `index.ts` (entry), `orchestrator.ts` (main pipeline), `scheduled.ts` (cron)

**dashboard/:**
- Purpose: Vue 3 admin dashboard for managing OEM data, monitoring agents, viewing analytics
- Contains: Frontend application (separate build from Worker)
- Tech: Vue 3, Shadcn-vue, Pinia, TanStack Query, Tailwind CSS
- Build: `npm run build` produces dist/ for deployment

**supabase/:**
- Purpose: Database schema and migrations
- Contains: PostgreSQL table definitions, RLS policies, triggers
- Key tables: products, offers, banners, variant_colors, variant_pricing, source_pages, import_runs, design_captures

**skills/:**
- Purpose: OpenClaw autonomous agent skills (reusable task definitions)
- Contains: Modular skill definitions for crawling, extraction, design capture, data sync
- Used by: OpenClaw orchestrator for scheduling autonomous tasks

**config/:**
- Purpose: Configuration for external systems (OpenClaw cron, agent orchestration)
- Contains: cron-jobs.json (cron schedules), agent-config.json (runtime config)

**lib/:**
- Purpose: Monorepo shared libraries
- Contains: Types and utilities used by both Worker and Dashboard
- Import path: `@oem-agent/shared`

**test/:**
- Purpose: Test suite for end-to-end testing
- Contains: E2E tests with fixtures and mock servers
- Run: `npm test` or `npm run test:skill`

**docs/:**
- Purpose: Documentation on OEM discovery processes, knowledge base
- Contains: Markdown documentation for team reference

## Key File Locations

**Entry Points:**
- `src/index.ts`: Worker entry (fetch handler, Hono app setup)
- `src/container.ts`: Sandbox container entry (Node.js server)
- `src/scheduled.ts`: Cron trigger handler (scheduled crawls)
- `dashboard/src/main.ts`: Vue app bootstrap
- `wrangler.jsonc`: Worker configuration, cron schedules, bindings

**Configuration:**
- `src/config.ts`: Global constants (MOLTBOT_PORT, timeouts)
- `src/types.ts`: TypeScript environment types (MoltbotEnv, AppEnv)
- `wrangler.jsonc`: Cloudflare Worker config (R2, Browser, Vectorize, Containers)
- `supabase/config.toml`: Local Supabase configuration

**Core Logic:**
- `src/orchestrator.ts`: Main pipeline (crawl → extract → store → notify)
- `src/crawl/scheduler.ts`: Cost control logic (when to crawl)
- `src/extract/engine.ts`: Data extraction (JSON-LD → LLM)
- `src/design/agent.ts`: Brand token extraction
- `src/ai/router.ts`: LLM model selection
- `src/notify/change-detector.ts`: Change detection & alerts

**Testing:**
- `src/logging.test.ts`: Logger tests
- `test/e2e/fixture/`: Mock server and test fixtures
- `src/test-utils.ts`: Test helper functions

## Naming Conventions

**Files:**
- Snake_case for utilities: `api-chainer.ts`, `network-capture.ts`
- PascalCase for classes: `ExtractionEngine`, `ChangeDetector`, `CrawlScheduler`
- Index files: `index.ts` for barrel exports (e.g., `src/ai/index.ts`)
- Test files: `*.test.ts` or `*.spec.ts`

**Directories:**
- Kebab-case: `src/crawl/`, `src/extract/`, `src/design/`
- Feature-based grouping: `src/routes/`, `src/notify/`, `src/sync/`
- Plural for collections: `skills/`, `components/`, `pages/`, `utils/`

**Classes & Interfaces:**
- PascalCase: `OemAgentOrchestrator`, `ExtractionEngine`, `CrawlScheduler`, `DesignAgent`
- Suffixes: `-Agent` (AI behavior), `-Engine` (processing), `-Detector` (analysis), `-Scheduler` (timing)

**Types:**
- Interfaces: `OemConfig`, `Product`, `SourcePage` (data shapes)
- Unions: `PageType`, `OfferType`, `OemId` (enumerated choices)
- Enums: `Availability`, `PriceType`, `FuelType`

## Where to Add New Code

**New Feature (e.g., price comparison):**
- Primary code: `src/[feature-name]/` (new directory)
- Tests: `src/[feature-name]/index.test.ts`
- Types: `src/oem/types.ts` (extend Product/Offer if needed)
- API: `src/routes/api.ts` (add new GET/POST endpoint)
- Dashboard: `dashboard/src/pages/[feature-name]/`
- DB: `supabase/migrations/[timestamp]_[feature].sql`

**New OEM:**
- Registry: `src/oem/registry.ts` (add to OemDefinitions)
- Migration: `supabase/migrations/[timestamp]_[oem_id].sql` (insert OEM + source pages)
- Seed script: `dashboard/scripts/seed-[oem-id].mjs` (if custom data extraction needed)
- Crawler logic: Only if site-specific extraction needed (`src/oem/registry.ts` CSS selectors)

**New API Endpoint:**
- Route handler: `src/routes/[feature].ts` or extend `src/routes/api.ts`
- Type: Add interface to `src/types.ts` or `src/oem/types.ts`
- Supabase query: `src/utils/supabase.ts` helper function
- Test: `test/e2e/` test suite

**New Extraction Method:**
- Implementation: `src/extract/engine.ts` (new extraction function)
- Fallback: `src/extract/self-heal.ts` (add recovery strategy)
- Registration: `src/extract/orchestrator.ts` (add to pipeline)
- Test: Unit test with sample HTML

**New Notification Channel:**
- Handler: `src/notify/slack.ts` (extend SlackNotifier or create new)
- Config: Update `MoltbotEnv` in `src/types.ts` (add API key)
- Integration: `src/notify/change-detector.ts` (wire into ChangeEvent)

**New Dashboard Page:**
- Page component: `dashboard/src/pages/[feature]/index.vue`
- Route: `dashboard/src/router/` (add route definition)
- Composable: `dashboard/src/composables/use-[feature].ts` (state/API)
- Service: `dashboard/src/services/api/[feature].ts` (HTTP client)

**New Autonomous Skill:**
- Definition: `skills/[skill-name]/manifest.json`
- Code: `skills/[skill-name]/[skill-name].ts`
- Registration: `config/openclaw/agent-config.json`
- Tests: `skills/[skill-name]/tests/`

## Special Directories

**supabase/migrations/:**
- Purpose: Database schema versioning
- Generated: `supabase db pull` downloads schema, `supabase db push` applies migrations
- Committed: Yes (tracked in git)
- Pattern: `[timestamp]_[description].sql` (e.g., `20260319_chery_oem.sql`)

**dashboard/dist/:**
- Purpose: Built frontend bundle
- Generated: `npm run build` produces optimized SPA
- Committed: No (gitignored)
- Deploy: Serve from static hosting or embed in Worker

**.wrangler/:**
- Purpose: Wrangler local state (cache, KV, Durable Objects)
- Generated: Auto-created by `wrangler dev`
- Committed: No (gitignored)
- Usage: Local development only

**.planning/codebase/:**
- Purpose: Architecture documentation (this directory)
- Generated: Manual (created by GSD `/map-codebase` command)
- Committed: Yes (tracked in git)
- Content: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md, STACK.md, INTEGRATIONS.md

**config/openclaw/:**
- Purpose: OpenClaw/Moltbot orchestration configuration
- Committed: Yes (tracked in git)
- Files: `cron-jobs.json` (when to run skills), `agent-config.json` (agent runtime)

**workspace*/:**
- Purpose: Monorepo workspace definitions for agents/workers
- Generated: Manual (created during project setup)
- Committed: Yes (tracked in git)
- Used by: OpenClaw for task orchestration

---

*Structure analysis: 2026-03-21*
