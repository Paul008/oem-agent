# Architecture

**Analysis Date:** 2026-03-21

## Pattern Overview

**Overall:** Multi-layer event-driven pipeline with Cloudflare Workers as orchestrator + Sandbox container runtime

**Key Characteristics:**
- **Cloudflare-native**: Workers (request/response), Durable Objects (state), R2 (storage), Vectorize (embeddings), Browser rendering (CDP)
- **Database-centric**: Supabase for state management (products, offers, source pages, cron runs), real-time subscriptions via Postgres
- **Modular AI**: Multi-provider routing (Groq, Together, Gemini, Moonshot) with task-specific model selection
- **Scheduled crawling**: Cron-based triggers with cost control (cheap checks before expensive renders)
- **Bidirectional sync**: OEM website crawling → Supabase + R2, dashboard queries → real-time updates

## Layers

**Request/Response Layer (HTTP):**
- Location: `src/index.ts`, `src/routes/`
- Contains: Hono web framework, routing handlers, middleware (auth, CORS)
- Depends on: Container runtime, Sandbox execution, all business logic
- Used by: Worker requests (scheduled cron, webhooks, API calls), dashboard

**Crawl & Extract Layer:**
- Purpose: Fetch pages from OEM websites, detect changes, extract structured data
- Location: `src/crawl/`, `src/extract/`
- Contains: CrawlScheduler (cost control), ExtractionEngine (JSON-LD → OpenGraph → CSS → LLM), ChangeDetector
- Depends on: Browser rendering (Lightpanda fallback, Cloudflare Browser), Cheerio (HTML parsing), OEM registry (site-specific selectors)
- Used by: Orchestrator (main pipeline), scheduled crawls

**Orchestration Layer:**
- Purpose: Coordinates entire multi-OEM pipeline: scheduling → crawling → extraction → storage → notifications
- Location: `src/orchestrator.ts` (145K lines — main orchestrator), `src/scheduled.ts` (cron entry points)
- Contains: OemAgentOrchestrator (primary entry point), ImportRun tracking, CrawlPipelineResult handling
- Depends on: All layers below (crawl, extract, AI router, storage, notifications)
- Used by: Scheduled worker, API handlers, dashboard backend

**AI Router Layer:**
- Purpose: Route extraction tasks to optimal LLM based on cost/speed/capability
- Location: `src/ai/`
- Contains: AiRouter (model selection), MultiProviderClient (Groq, Together, Gemini, Moonshot), SalesRepAgent (content generation)
- Depends on: External LLM APIs, Supabase for logging inference metrics
- Used by: Orchestrator (fallback for extraction), DesignAgent (brand token extraction), ExtractedContent enrichment

**Storage Layer:**
- Purpose: Persist OEM data (products, offers, banners, colors, specs), crawl logs, design captures
- Location: `src/utils/supabase.ts`, R2 binding (MOLTBOT_BUCKET)
- Contains: Supabase client (products, offers, banners, variant_colors, variant_pricing, source_pages, import_runs, design_captures), R2 (OEM assets, PDFs, screenshots)
- Depends on: Supabase service role key, R2 credentials
- Used by: Orchestrator (writes), API/dashboard (reads), real-time subscriptions

**Design Capture Layer:**
- Purpose: Extract brand tokens and page layouts from OEM websites (colors, typography, spacing, components)
- Location: `src/design/`
- Contains: DesignAgent (brand extraction), PageCapturer (screenshots), PromptBuilder (Kimi K2.5 vision prompts)
- Depends on: Kimi K2.5 vision API, Lightpanda/Cloudflare Browser, image processing
- Used by: Brand Ambassador cron trigger (quarterly), DesignCapture table in Supabase

**Notification Layer:**
- Purpose: Alert users of significant changes (price drops, new products, offers added)
- Location: `src/notify/`
- Contains: ChangeDetector (identifies events), SlackNotifier (Slack webhook), AlertBatcher (deduplicates)
- Depends on: Slack webhook URL, change event logic
- Used by: Orchestrator (after extraction), scheduled handlers

**API Gateway Layer:**
- Purpose: HTTP endpoints for dashboard, public APIs, webhooks
- Location: `src/routes/api.ts`, `src/routes/oem-agent.ts`, `src/routes/dealer-api.ts`
- Contains: REST endpoints (GET/POST products, offers, cron runs), WebSocket support, authentication middleware
- Depends on: Supabase queries, Redis (optional caching), auth tokens (CF Access, custom)
- Used by: Dashboard frontend, external integrations, webhook consumers

**Container Runtime Layer:**
- Purpose: Execute long-running code (Node.js) inside Cloudflare Sandbox
- Location: `src/container.ts` (server entry point), `Dockerfile`
- Contains: HTTP server, code execution sandbox, health checks
- Depends on: Cloudflare Containers API, Worker-to-container communication
- Used by: Worker sends requests via CDP shim or HTTP fetch

**Dashboard Frontend Layer:**
- Purpose: Visual management of OEM data, cron jobs, agent monitoring
- Location: `dashboard/src/`
- Contains: Vue 3 components, pages (products, offers, cron, agents), composables (Supabase subscriptions, API client)
- Depends on: Supabase client (realtime), Axios API client, Pinia stores
- Used by: End users (browser), internal team

## Data Flow

**Scheduled Crawl Flow (Main Workflow):**

1. Cron trigger fires (via `wrangler.jsonc` schedule)
2. `scheduled.ts:handleScheduled()` routes to orchestrator
3. `OemAgentOrchestrator.runScheduledCrawl()` queries due pages from Supabase
4. For each page:
   - CrawlScheduler determines if crawl needed (cost control)
   - Fetch via Lightpanda (if configured) or Cloudflare Browser
   - ExtractionEngine extracts products/offers/banners (JSON-LD → OpenGraph → CSS → LLM fallback)
   - Upsert to Supabase (products, offers, variant_colors, variant_pricing)
   - Auto-populate specs_json and variant colors during upsert
5. ChangeDetector identifies new/updated/removed entities
6. SlackNotifier sends alerts for significant changes
7. Return summary (products_upserted, offers_upserted, changes_found)

**API Request Flow (Dashboard Query):**

1. Dashboard makes axios request to `/api/products` or `/api/oem/{oemId}`
2. `src/routes/api.ts` route handler executes
3. Authenticates user (CF Access JWT or token)
4. Queries Supabase (with filters, pagination, realtime subscriptions)
5. Returns JSON response
6. Dashboard Vue component updates with real-time Supabase subscription

**Design Capture Flow (Brand Token Extraction):**

1. Brand Ambassador cron triggers (separate schedule)
2. `DesignAgent.captureBrandTokens()` renders OEM pages (homepage, vehicle detail, offers)
3. Takes screenshots at desktop/tablet/mobile widths
4. Sends screenshots + prompts to Kimi K2.5 vision API
5. Extracts JSON: colors, typography, spacing, components
6. Stores in Supabase design_captures table + R2 (screenshots)
7. Dashboard visualizes brand tokens

**State Management (Real-time Dashboard Updates):**

- Dashboard uses `useRealtimeSubscription` composable
- Subscribes to Supabase postgres_changes on products/offers/import_runs
- On change event, Vue state automatically updates
- No polling needed — event-driven via WebSocket

## Key Abstractions

**OemAgentOrchestrator:**
- Purpose: Single entry point coordinating entire pipeline
- Examples: `src/orchestrator.ts` (lines 103+)
- Pattern: Constructor accepts DI (supabase, r2Bucket, browser, aiRouter, notifier), public methods (runScheduledCrawl, runSinglePageCrawl, syncVariantColors, buildSpecsJson)

**ExtractionEngine:**
- Purpose: Extract structured data using priority order (JSON-LD → OpenGraph → CSS → LLM)
- Examples: `src/extract/engine.ts` (extractJsonLd, extractProductFromJsonLd, ExtractedProduct interface)
- Pattern: Static methods per extraction type, returns ExtractionResult<T> with confidence/coverage metrics

**CrawlScheduler:**
- Purpose: Determine if page needs crawl based on schedule + cost control
- Examples: `src/crawl/scheduler.ts` (shouldCrawl method, backoff multiplier)
- Pattern: Accepts SourcePage state, returns {shouldCrawl: boolean, reason: string, nextCheckAt: Date}

**AiRouter:**
- Purpose: Select optimal LLM model for task (cost/speed/capability tradeoff)
- Examples: `src/ai/router.ts` (GROQ_CONFIG, GEMINI_CONFIG, selectModel method)
- Pattern: Static config per provider, instance method selectModel(taskType) returns model + cost estimate

**ChangeDetector:**
- Purpose: Identify new/updated/removed products, offers, banners
- Examples: `src/notify/change-detector.ts`
- Pattern: Compare extracted data vs stored data, generate ChangeEvent[], persist to change_events table

**DesignAgent:**
- Purpose: Extract brand tokens from screenshots using vision API
- Examples: `src/design/agent.ts` (generateBrandTokenExtractionPrompt, captureBrandTokens)
- Pattern: Kimi K2.5 vision API with detailed JSON schema, stores BrandTokens in design_captures

**PageExtractionResult:**
- Purpose: Standardized extraction output with confidence/method metadata
- Examples: `src/extract/engine.ts` (interface with products/offers/bannerSlides + confidence + method)
- Pattern: Every extraction returns this structure with confidence 0-1, method tag (jsonld|opengraph|css|llm)

## Entry Points

**Worker Request Handler:**
- Location: `src/index.ts:fetch()` exported function
- Triggers: All HTTP requests (GET/POST), scheduled crons, WebSocket upgrades
- Responsibilities: Route to handler (publicRoutes, api, cron, cdp, media), auth middleware, error handling

**Scheduled Cron Handler:**
- Location: `src/scheduled.ts:handleScheduled()`
- Triggers: Cron schedule in wrangler.jsonc (0 17,18,6,19,20 * * *)
- Responsibilities: Determine crawl type, invoke orchestrator.runScheduledCrawl(crawlType), batch results, notify

**API Routes:**
- Location: `src/routes/api.ts`, `src/routes/oem-agent.ts`
- Triggers: HTTP requests to `/api/*` paths
- Responsibilities: Query/insert products, offers, cron runs; authenticate; return JSON

**Container Entry:**
- Location: `src/container.ts:createServer()`
- Triggers: Worker creates instance via Cloudflare Containers binding
- Responsibilities: Health check `/health`, code execution POST `/execute`

## Error Handling

**Strategy:** Fail fast, log fully, retry with fallback

**Patterns:**
- **Extraction failure**: JSON-LD fails → try OpenGraph → try CSS → fallback to LLM. Each has confidence score.
- **Browser render failure**: Lightpanda timeout → fallback to Cloudflare Browser Smart Mode. If both fail, serve cached HTML.
- **AI router timeout**: Primary model timeout → retry with faster model (e.g., Llama 4 Scout). If all timeout, use rule-based fallback.
- **Storage failure**: Upsert to Supabase fails → retry with exponential backoff. Log error to import_runs.error_message.
- **Notification failure**: Slack webhook down → queue in change_events table for retry. Continue pipeline.

## Cross-Cutting Concerns

**Logging:**
- Framework: Console (structured via `src/utils/logging.ts`)
- Approach: Redact sensitive params (API keys), log duration/error/result for each step
- Examples: `[Orchestrator] Crawling 47 pages... [123 products upserted] [456ms]`

**Validation:**
- Approach: Zod schemas (dashboard), inline type checking (worker)
- Examples: ProductPrice validates currency/type/amount, SourcePage validates page_type

**Authentication:**
- Approach: CF Access JWT verification (production), token-based fallback (dev)
- Middleware: `src/auth/` validates JWT, extracts email, stores in context variables
- Used by: API routes check accessUser before returning sensitive data

**Cost Control:**
- Approach: Track render count, skip unnecessary renders, backoff on no-change
- CrawlScheduler implements max 1 render per 2 hours, global monthly cap
- Cheap checks (hash comparison) run on faster interval, full renders on slower

**Concurrency:**
- Approach: Process pages sequentially per OEM (Supabase transactions), parallel across OEMs
- Pattern: `Promise.all([oem1Crawl, oem2Crawl, ...])` in orchestrator
- Rate limits: Groq API 500 req/min, Gemini 60 req/min — router respects via queue

**Caching:**
- R2 stores: HTML snapshots (dedup via hash), PDF documents, screenshots
- Supabase: Real-time subscriptions cached in Vue component state
- Extraction: Cache CSS selectors per OEM in registry (static, compiled at build time)

---

*Architecture analysis: 2026-03-21*
