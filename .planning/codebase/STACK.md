# Technology Stack

**Analysis Date:** 2026-03-21

## Languages

**Primary:**
- TypeScript 5.6.0 - Main language for Worker and backend code
- JavaScript/JSX - React components (legacy admin UI)
- Vue 3 - Dashboard UI (ShadcnVue-based admin interface)
- HTML/CSS - Static assets and dashboard styling

**Secondary:**
- Shell/Bash - Build scripts and deployment automation
- SQL - Supabase migrations and database queries

## Runtime

**Environment:**
- Node.js 20+ (Cloudflare Workers compatibility)
- Cloudflare Workers - Primary serverless execution platform
- Cloudflare Durable Objects - Persistent state for sandbox container
- Cloudflare Containers - Zig-based headless browser runtime

**Package Manager:**
- pnpm 9.15.0 (root), 10.29.3 (dashboard)
- Lock files: package-lock.json (monorepo)

## Frameworks

**Core:**
- Hono 4.6.0 - Lightweight HTTP framework for Worker routes
- Cloudflare Sandbox (@cloudflare/sandbox 0.7.2) - Managed container runtime with SQLite support
- Cloudflare Puppeteer (@cloudflare/puppeteer 1.0.6) - Headless browser automation via CDP

**Frontend:**
- Vue 3 (5.0.2) - Dashboard framework
- Vite 7.3.1 - Frontend build tool
- TailwindCSS 4.1.18 - Utility-first CSS
- Shadcn-vue 2.8.0 (via Reka UI) - Component library
- VueRouter 5.0.2 - SPA routing
- Pinia 3.0.4 - State management

**Testing:**
- Vitest 2.1.0 - Unit test runner (configured for root src/ and skills/)
- Playwright Core 1.58.2 - Browser automation (dev dependency)
- Puppeteer 24.37.2 - E2E testing (dev dependency)

**Build/Dev:**
- Wrangler 4.69.0 - Cloudflare Workers CLI
- TypeScript 5.6.0 (root) / 5.9.3 (dashboard) - Type checking
- Vite 7.3.1 - Dashboard dev server and bundler
- Vue TSC 3.2.4 - Vue TypeScript compiler
- ESLint 9.39.2 - Code linting
- Autoprefixer 10.4.24 - CSS vendor prefixes

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.45.0 (root), 2.97.0 (dashboard) - PostgreSQL client and realtime subscriptions
- @cloudflare/workers-types 4.20260305.0 - Cloudflare bindings type definitions
- jose 6.1.3 - JWT verification for Cloudflare Access tokens
- cheerio 1.0.0 (root), 1.2.0 (dashboard) - HTML parsing and DOM manipulation
- pdf-parse 2.4.5 - PDF text extraction and parsing

**Infrastructure:**
- uuid 13.0.0 - UUID generation for entity IDs
- dotenv 17.3.1 - Environment variable loading
- p-limit 7.3.0 - Concurrency control for parallel tasks
- @tanstack/vue-query 5.92.9 - Async state management (dashboard)
- @tanstack/vue-table 8.21.3 - Data table component (dashboard)
- axios 1.13.5 - HTTP client (dashboard)
- nprogress 0.2.0 - Progress bar UI (dashboard)

**UI & Components:**
- Lucide Vue Next 0.553.0 - SVG icons
- Embla Carousel 8.6.0 - Carousel component
- Motion-v 1.7.4 - Animation library
- Reka UI 2.8.0 - Headless component system (dashboard)
- Vue Sonner 2.0.9 - Toast notifications
- Vaul Vue 0.4.1 - Drawer/sheet components
- Vue Input OTP 0.3.2 - One-time password input

**Forms & Validation:**
- Vee-Validate 4.15.1 - Form validation framework
- Zod 4.3.6 - TypeScript schema validation
- @vee-validate/zod 4.15.1 - Vee-Validate + Zod integration
- @formkit/auto-animate 0.9.0 - Animation on form changes

**Utilities:**
- Day.js 1.11.19 - Date/time manipulation
- Cronstrue 3.12.0 - Cron expression parser
- Clsx 2.1.1 - Conditional CSS class names
- Tailwind Merge 3.4.1 - Tailwind CSS class merging
- @vueuse/core 14.2.1 - Vue Composition API utilities
- Universal Cookie 8.0.1 - Cookie management
- pg 8.18.0 - PostgreSQL client (dashboard)

## Configuration

**Environment:**
- `.env` (not committed) - Secret credentials:
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` - Database access
  - `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` - DB-level auth
  - AI Provider keys: `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `TOGETHER_API_KEY`, `GEMINI_API_KEY`
  - Search/Research: `BRAVE_API_KEY`, `PERPLEXITY_API_KEY`
  - Communication: `SLACK_WEBHOOK_URL`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`
  - Optional: `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`
  - Browser rendering: `LIGHTPANDA_URL` (optional, falls back to Cloudflare Browser)

**Build:**
- `wrangler.jsonc` - Worker configuration with:
  - R2 bucket binding: `oem-agent-assets` (production) / `oem-agent-assets-dev`
  - Cloudflare Browser binding for headless rendering
  - AI Gateway binding for multi-provider LLM routing
  - Vectorize binding for semantic search (`ux-knowledge-base`)
  - Container/Durable Object binding for Sandbox runtime
  - Cron triggers (5 schedules spanning 17:00-20:00 UTC for AEST timezone)
  - Dev/prod environment configuration

- `tsconfig.json` - TypeScript compiler options:
  - Target: ES2022
  - Module: ESNext with bundler resolution
  - Strict mode enabled
  - Path aliases: `@lib/*`, `@shared/*`, `@extractors/*`, `@ai/*`, `@skills/*`

- `supabase/config.toml` - Local Supabase configuration:
  - PostgreSQL 15 with Realtime enabled
  - Auth (email/SMS/OAuth capable)
  - Storage buckets (50MiB limit, image transformation)
  - Email via Resend SMTP
  - Edge runtime for functions

- `dashboard/tsconfig.json` - Vue-specific TypeScript config
- `dashboard/vite.config.*` - Dashboard bundler setup

## Platform Requirements

**Development:**
- Node.js 20+
- pnpm 9.15.0+
- Cloudflare Wrangler 4.69.0+
- Docker (for Lightpanda browser or full stack)
- Supabase CLI (for DB migrations)

**Production:**
- Cloudflare Workers (serverless execution)
- Cloudflare R2 (object storage for assets)
- Cloudflare Containers (headless browser runtime)
- Cloudflare Durable Objects (state management)
- PostgreSQL 15+ (Supabase)
- Vercel (optional, dashboard deployment)

---

*Stack analysis: 2026-03-21*
