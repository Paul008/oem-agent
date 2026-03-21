# External Integrations

**Analysis Date:** 2026-03-21

## APIs & External Services

**Large Language Models (Multi-Provider):**
- Anthropic Claude - Primary AI provider via API or Cloudflare AI Gateway
  - SDK/Client: `@cloudflare/workers-types` + fetch API
  - Models supported: claude-haiku-4.5, claude-sonnet-4.5, claude-opus-4.6
  - Auth: `ANTHROPIC_API_KEY` (direct) or `AI_GATEWAY_API_KEY` (via gateway)
  - Used for: Text extraction, design recommendations, chat

- Groq - Fast inference API
  - SDK/Client: Fetch API (`src/ai/multi-provider.ts`)
  - Models: llama-3.1-8b-instant, llama-3.3-70b-versatile, openai/gpt-oss variants
  - Auth: `GROQ_API_KEY`
  - Used for: PDF text extraction, LLM repair/self-healing

- Google Gemini - Vision and embedding models
  - SDK/Client: Fetch API to `generativelanguage.googleapis.com`
  - Models: gemini-2.0-flash, gemini-2.5-pro, gemini-embedding-001 (768-dim vectors)
  - Auth: `GOOGLE_API_KEY`
  - Used for: PDF vision extraction (Gemini 2.5 Flash), semantic embeddings

- Together AI - Open source model hosting
  - SDK/Client: Fetch API
  - Auth: `TOGETHER_API_KEY`
  - Used for: Alternative inference option

- Moonshot/Kimi - Long-context vision models
  - SDK/Client: Fetch API
  - Models: kimi-k2, kimi-k2-turbo
  - Auth: `KIMI_API_KEY` or `MOONSHOT_API_KEY`
  - Used for: Vision-based content extraction

**Embedding & Vector Search:**
- Cloudflare Vectorize - Semantic search index
  - Binding: `UX_KNOWLEDGE` (VectorizeIndex)
  - Index name: `ux-knowledge-base`
  - Vector dimension: 768 (from gemini-embedding-001)
  - Used for: Storing and retrieving extracted UX patterns across OEMs

**Search & Research APIs:**
- Brave Search API - Web search for OEM discovery
  - Auth: `BRAVE_API_KEY`
  - Used in Layer 1 (Research) of extraction orchestrator

- Perplexity API - AI-powered web research
  - Auth: `PERPLEXITY_API_KEY`
  - Used in Layer 1 (Research) for contextual discovery

**Browser Rendering:**
- Cloudflare Browser (Smart Mode) - Primary headless browser
  - Binding: `BROWSER` (Fetcher)
  - Protocol: Chrome DevTools Protocol (CDP)
  - Features: Network interception, JavaScript execution, screenshot capture
  - Fallback to when Lightpanda unavailable
  - Used for: Page rendering, JavaScript-heavy site crawling

- Lightpanda - Optional fast headless browser
  - Connection: WebSocket CDP at `LIGHTPANDA_URL` (env var)
  - Performance: 11x faster, 9x less memory than Chrome
  - Timeout: 15 seconds (falls back to Cloudflare Browser)
  - Used for: Fast page rendering when available

## Data Storage

**Databases:**
- PostgreSQL 15 (Supabase)
  - Connection: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  - Client: `@supabase/supabase-js` 2.45.0
  - Schema: `public` + `graphql_public` (auto-exposed via PostgREST API)
  - Features: Realtime subscriptions via Supabase Realtime
  - Tables: oems, products, variants, colors, accessories, offers, banners, brochures, pdf_embeddings, cron_job_overrides, agent_actions, discovered_apis
  - Used for: All product, OEM, and operational data

**File Storage:**
- Cloudflare R2 - Object storage for assets and agent memory
  - Binding: `MOLTBOT_BUCKET` (R2Bucket)
  - Bucket names: `oem-agent-assets` (prod), `oem-agent-assets-dev`
  - Mounted at: `/r2/` in sandbox via `mountR2Storage()`
  - Used for: Agent memory, cron run history, extracted assets (images, PDFs)

**Caching:**
- In-memory cache (extraction selector cache) - Layer 2 (Fast Path)
  - Location: `src/extract/cache.ts`
  - Stored in: R2 bucket as JSON
  - Used for: OEM discovery cache, CSS selector cache, performance optimization

- Cloudflare Workers KV Cache - Not currently used, available for future optimization

## Authentication & Identity

**Auth Provider:**
- Cloudflare Access - Enterprise SSO for admin routes
  - Implementation: JWT verification middleware (`src/auth/jwt.ts`)
  - Config: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`
  - Token verification: OIDC token validation via jose library
  - Used for: Protecting `/admin/*` routes

- Development mode bypass - Dev/E2E testing
  - Flag: `DEV_MODE=true` or `E2E_TEST_MODE=true`
  - Skips CF Access validation in dev environments

**Secrets Management:**
- Wrangler secrets - Cloudflare secret storage
  - Set via: `wrangler secret put KEY` (encrypted at rest)
  - Retrieved as: Environment variables in handler context
  - Contains: API keys, database credentials, auth tokens

## Monitoring & Observability

**Error Tracking:**
- Cloudflare AI Gateway - Observability proxy (optional)
  - Binding: `AI` (Ai)
  - Config: `CF_AI_GATEWAY_ACCOUNT_ID`, `CF_AI_GATEWAY_GATEWAY_ID`, `CLOUDFLARE_AI_GATEWAY_API_KEY`
  - Features: Request/response logging, cost tracking, rate limiting
  - Used for: Routing LLM requests with observability

**Logs:**
- Cloudflare Workers Logs - Automatic logging
  - Console output captured by Workers logging service
  - Accessible via Wrangler CLI and Cloudflare Dashboard
  - Used for: Runtime errors, extraction status, API debug info

- R2 Cron Run History - Persistent job tracking
  - Location: `src/utils/cron-runs.ts`
  - Storage: R2 bucket as JSON files
  - Used for: Job status dashboard, failure history

**Debugging:**
- Chrome DevTools Protocol (CDP) endpoint (`/cdp`)
  - Binding: `CDP_SECRET` (auth header validation)
  - Used for: Browser automation, screenshot capture, PDF generation
  - Available at: `WORKER_URL` (requires `CDP_SECRET` auth)

## CI/CD & Deployment

**Hosting:**
- Cloudflare Workers - Serverless execution
  - Deploy via: `wrangler deploy -c wrangler.jsonc`
  - Environments: production (default), dev (`--env dev`)
  - Compatibility: 2026-02-11+ with nodejs_compat flag

**CI Pipeline:**
- GitHub Actions - Not currently configured, manual deployment
- Wrangler CLI - Local/CI deployment tooling

**Dashboard Deployment:**
- Vercel (optional) - For static dashboard frontend
  - Config: `dashboard/vercel.json`
  - Build: `vue-tsc -b && vite build`
  - Used for: Hosting separate admin dashboard SPA

## Webhooks & Callbacks

**Incoming:**
- Cloudflare Cron Triggers - Scheduled job execution
  - Schedules: 5 triggers in UTC (17:00, 18:00, 06:18, 19:00, 20:00)
  - Handler: `src/scheduled.ts` - `handleScheduled()`
  - Used for: Product crawl scheduling, PDF sync, nightly operations

- OpenClaw Cron System - Advanced job scheduling
  - Config: `config/openclaw/cron-jobs.json`
  - Skills: Custom Node.js scripts executed in Moltbot sandbox
  - Used for: Brand ambassador runs, complex multi-step jobs

**Outgoing:**
- Slack Webhooks - Notification delivery
  - Endpoint: `SLACK_WEBHOOK_URL` (for simple webhook posts)
  - Token: `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` (for bot interaction)
  - Client: `src/notify/slack.ts` - `MultiChannelNotifier`
  - Used for: Job completion alerts, error notifications

- Telegram Bot API - Optional chat notifications
  - Token: `TELEGRAM_BOT_TOKEN`
  - Policy: `TELEGRAM_DM_POLICY`
  - Not currently integrated

- Discord Bot API - Optional chat notifications
  - Token: `DISCORD_BOT_TOKEN`
  - Policy: `DISCORD_DM_POLICY`
  - Not currently integrated

## Email Service

**Provider:**
- Resend - Transactional email for auth
  - SMTP: `smtp.resend.com:465`
  - Auth: `RESEND_API_KEY`
  - Configured in: `supabase/config.toml` auth.email.smtp
  - Used for: Email confirmations, password resets, invitations

## Environment Configuration

**Required env vars (wrangler secret put):**
- `SUPABASE_URL` - Database URL
- `SUPABASE_SERVICE_ROLE_KEY` - Admin database access
- `GROQ_API_KEY` - Groq LLM API
- `TOGETHER_API_KEY` - Together AI LLM
- Minimum one AI provider: `ANTHROPIC_API_KEY` OR `OPENAI_API_KEY` OR Cloudflare AI Gateway config

**Optional env vars:**
- `GOOGLE_API_KEY` - Gemini vision/embedding
- `BRAVE_API_KEY` - Web search
- `PERPLEXITY_API_KEY` - Research API
- `SLACK_WEBHOOK_URL`, `SLACK_BOT_TOKEN` - Slack notifications
- `RESEND_API_KEY` - Email delivery
- `LIGHTPANDA_URL` - Fast browser rendering (WebSocket CDP URL)
- `KIMI_API_KEY` / `MOONSHOT_API_KEY` - Vision models
- `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` - Admin auth

**Secrets location:**
- Cloudflare Wrangler secrets (encrypted, set via CLI)
- `.env` file (local dev only, not committed)
- GitHub Secrets (for CI if configured)

---

*Integration audit: 2026-03-21*
