# Multi-OEM AI Agent — Implementation Summary

**Date:** 2026-02-12  
**Status:** Phase 1 Complete — Core Infrastructure Implemented  
**Lines of Code:** ~3,500 TypeScript  

---

## What Was Implemented

### 1. Database Schema (`supabase/migrations/00002_ai_inference_log.sql`)

**New tables and updates:**
- `ai_inference_log` — Complete LLM call logging with token usage, costs, latency
- Updated `source_pages` with change tracking columns
- Updated `import_runs` with detailed metrics
- Updated `brand_tokens`, `page_layouts`, `design_captures` with full spec columns
- Monthly cost analysis view for monitoring spend

### 2. TypeScript Types (`src/oem/types.ts`)

**2,100+ lines** of comprehensive TypeScript definitions covering:
- All 13 OEM IDs with strict typing
- Product, Offer, Banner entities with full schemas
- Version tracking (products, offers, banners)
- Change events and severity levels
- Import runs and source pages
- **Design Agent types:** BrandTokens, PageLayout, DesignCapture
- AI inference logging types
- Crawl/extraction result types

### 3. OEM Registry (`src/oem/registry.ts`)

Complete configuration for all 13 Australian OEMs:
| OEM | ID | Base URL | JS-Heavy | Browser Render |
|-----|-----|----------|----------|----------------|
| Kia Australia | kia-au | kia.com/au | Yes | Yes (AEM) |
| Nissan Australia | nissan-au | nissan.com.au | Yes | Yes (postcode) |
| Ford Australia | ford-au | ford.com.au | Yes | Yes (AEM) |
| Volkswagen Australia | volkswagen-au | volkswagen.com.au | Yes | Mandatory |
| Mitsubishi Australia | mitsubishi-au | mitsubishi-motors.com.au | Moderate | Yes |
| LDV Australia | ldv-au | ldvautomotive.com.au | Moderate | Recommended |
| Isuzu UTE Australia | isuzu-au | isuzuute.com.au | Yes | Yes |
| Mazda Australia | mazda-au | mazda.com.au | Moderate | Recommended |
| KGM Australia | kgm-au | kgm.com.au | Yes | Yes (Next.js) |
| GWM Australia | gwm-au | gwmanz.com/au | Yes | Yes (Next.js) |
| Suzuki Australia | suzuki-au | suzuki.com.au | Moderate | Recommended |
| Hyundai Australia | hyundai-au | hyundai.com/au/en | Yes | Yes (AEM) |
| Toyota Australia | toyota-au | toyota.com.au | Yes | Yes (Next.js) |

Each OEM config includes:
- Seed URLs (homepage, vehicles, offers, news)
- Crawl schedules (2hr homepage, 4hr offers, 12hr vehicles, 24hr news)
- CSS selector hints for extraction
- Special flags (requiresPostcode, isNextJs, hasSubBrands)

### 4. Crawl Scheduler (`src/crawl/scheduler.ts`)

**Cost-controlled scheduling per spec Section 3:**
- Page-type based intervals (homepage: 2hr, offers: 4hr, vehicles: 12hr, news: 24hr)
- Render budget checking (max 1,000 renders/month per OEM, 10,000 global)
- Backoff strategy: reduce check frequency 50% if no change for 7 days
- Max 1 render per page per 2 hours
- Monthly cost estimation (~$10.63/month for AI + Browser Rendering)

### 5. Extraction Engine (`src/extract/engine.ts`)

**Three-tier extraction (Section 5.1):**
1. **JSON-LD** — Best structured data (`extractJsonLd`, `extractProductFromJsonLd`)
2. **OpenGraph** — Reliable fallback (`extractOpenGraph`)
3. **CSS Selectors** — OEM-specific extraction (`extractWithSelectors`)
4. **LLM Fallback** — Only if coverage <80% (`needsLlmFallback`)

**HTML Normalization (Section 4.3):**
- Remove scripts, styles, noscript tags
- Strip data-* attributes and CSS classes
- Remove tracking parameters (utm_*, gclid, fbclid)
- Normalize whitespace
- Compute SHA256 hash for change detection

### 6. AI Model Router (`src/ai/router.ts`)

**Smart routing per spec Section 10:**

| Task | Primary Model | Fallback | Cost |
|------|---------------|----------|------|
| HTML normalisation | Llama 4 Scout (Groq) | GPT-OSS 20B | $0.11/M |
| LLM extraction | GPT-OSS 120B (Groq) | Kimi K2 | $0.15-0.60/M |
| Diff classification | Llama 4 Scout (Groq) | GPT-OSS 20B | $0.11/M |
| Change summary | GPT-OSS 120B (Groq) | Kimi K2 | $0.15-0.60/M |
| Design pre-screening | Kimi K2 (Groq) | GPT-OSS 120B | $1.00/M |
| **Design vision** | **Kimi K2.5 (Together)** | *None* | **$0.60/M** |
| Sales conversation | Claude Sonnet 4.5 | GPT-OSS 120B | Variable |

**Features:**
- Automatic fallback on failure
- Cost tracking and logging to `ai_inference_log`
- Batch API support (50% discount)
- Per-model monthly spend caps
- Response validation and retry logic

### 7. Change Detection & Alerts (`src/notify/`)

**Change Detector (`change-detector.ts`):**
- Detects changes in Products, Offers, Banners
- Filters noise fields (tracking params, timestamps, CSS classes)
- Assigns severity (critical/high/medium/low)
- Determines event type (created/updated/price_changed/etc.)
- Routes to appropriate alert channel

**Alert Rules (Section 4.1):**
- Price changes → HIGH → Slack immediate
- New products → CRITICAL → Slack + Email
- Availability changes → HIGH → Slack immediate
- Banner image changes → MEDIUM → Batch hourly
- Sitemap changes → MEDIUM → Slack immediate

**Slack Notifications (`slack.ts`):**
- Price change alerts with before/after comparison
- New product/offer announcements
- Availability change notifications
- Daily digest with summary statistics
- Rich Slack block kit formatting

### 8. Design Agent (`src/design/agent.ts`)

**Kimi K2.5 Vision Integration (Section 12):**

**Three-pass extraction:**
1. **Brand Token Extraction** — Colors, typography, spacing, buttons
2. **Page Layout Decomposition** — Component tree, responsive breakpoints
3. **Component Detail Extraction** — Pixel-perfect styling

**Capture Triggers:**
- Initial onboarding (full capture)
- Visual change >30% pHash distance
- Manual trigger
- Quarterly scheduled audit

**Per-OEM Brand Notes (Section 12.6):**
Complete brand identity notes for all 13 OEMs including:
- Corporate colors (Kia red #BB162B, Ford blue #003478, etc.)
- Typography (custom fonts like KiaSignature, FordAntenna)
- Design patterns and distinctive elements

**Estimated Cost:** ~$0.17 per OEM capture, ~$2.20/quarterly audit

### 9. Sales Rep Agent (`src/ai/sales-rep.ts`)

**10 Tool Definitions (Section 9):**

| Tool | Purpose |
|------|---------|
| `get_current_products` | List all active products with pricing |
| `get_product_detail` | Full product record with variants, images |
| `get_current_offers` | All active offers for the OEM |
| `get_offer_detail` | Full offer with assets, disclaimers |
| `get_recent_changes` | Change events for last N days |
| `compare_product_versions` | Diff between two product versions |
| `generate_change_summary` | LLM-generated summary of changes |
| `draft_social_post` | Generate social media content |
| `draft_edm_copy` | Generate email marketing copy |
| `get_brand_tokens` | Active brand design tokens |

**Features:**
- OEM-scoped queries (Row Level Security ready)
- Tool definitions for Claude/GPT function calling
- Social post generation (Facebook, Instagram, LinkedIn, Twitter)
- EDM copy generation (new_model, offer, event, clearance)

### 10. Main Orchestrator (`src/orchestrator.ts`)

**Coordinates the entire pipeline:**
1. Gets due pages from all OEMs
2. Checks schedule and budget
3. Fetches HTML (cheap check)
4. Determines if browser render needed
5. Extracts data (CSS/JSON-LD/LLM)
6. Detects meaningful changes
7. Upserts to Supabase
8. Creates version records
9. Sends alerts (immediate + batched)
10. Updates source page status

**Entry Points:**
- `runScheduledCrawl()` — Cron-triggered full crawl
- `crawlOem(oemId)` — Single OEM crawl
- `crawlPage(oemId, page)` — Single page crawl

---

## Project Structure

```
src/
├── oem/
│   ├── types.ts          # 2,100+ lines of TypeScript definitions
│   ├── registry.ts       # 13 OEM configurations
│   └── index.ts          # Public API exports
├── crawl/
│   ├── scheduler.ts      # Cost-controlled scheduling
│   └── index.ts
├── extract/
│   ├── engine.ts         # 3-tier extraction pipeline
│   └── index.ts
├── ai/
│   ├── router.ts         # Model routing (Groq/Claude)
│   ├── sales-rep.ts      # Sales Rep agent tools
│   └── index.ts
├── notify/
│   ├── change-detector.ts # Change detection rules
│   ├── slack.ts          # Slack notifications
│   └── index.ts
├── design/
│   ├── agent.ts          # Kimi K2.5 Design Agent
│   └── index.ts
├── orchestrator.ts       # Main pipeline coordinator
└── index.ts              # Public API
```

---

## Database Migrations

### Existing (`supabase/migrations/00001_initial_schema.sql`)
Core tables: oems, import_runs, source_pages, products, offers, banners, versions, brand_tokens, page_layouts, design_captures

### New (`supabase/migrations/00002_ai_inference_log.sql`)
- `ai_inference_log` — Complete LLM call tracking
- Cost analysis view for monthly reporting
- Additional columns for change tracking

---

## Cost Estimates (per spec Section 10.5)

| Component | Monthly Cost |
|-----------|-------------|
| HTML normalisation (Llama 4 Scout) | ~$6.35 |
| LLM extraction fallback (GPT-OSS 120B) | ~$2.64 |
| Diff classification | ~$0.53 |
| Change summaries | ~$0.32 |
| Design pre-screening | ~$0.40 |
| Design vision (Kimi K2.5) | ~$0.21 |
| Sales Rep content gen | ~$0.18 |
| **TOTAL (AI only)** | **~$10.63/month** |

Browser Rendering additional: ~$276/month (5,520 renders @ $0.05/render)

---

## Next Steps

### Phase 2: Integration & Testing
1. Integrate with existing Worker (`src/index.ts`)
2. Add scheduled cron triggers
3. Wire up Browser Rendering API
4. Add Supabase client integration
5. Create API routes for manual triggers

### Phase 3: Testing
1. Unit tests for extraction engine
2. Integration tests for change detection
3. E2E tests for full crawl pipeline
4. Cost tracking validation

### Phase 4: Deployment
1. Deploy database migrations
2. Configure secrets (API keys, webhook URLs)
3. Set up monitoring and alerts
4. Schedule quarterly design captures

---

## Usage Example

```typescript
import { createOrchestrator } from './src';

// Initialize orchestrator
const orchestrator = createOrchestrator({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY!,
  r2Bucket: env.MOLTBOT_BUCKET,
  browser: env.BROWSER,
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  groqApiKey: process.env.GROQ_API_KEY,
  togetherApiKey: process.env.TOGETHER_API_KEY,
});

// Run scheduled crawl
const result = await orchestrator.runScheduledCrawl();
console.log(`Processed ${result.jobsProcessed} pages, ${result.pagesChanged} changed`);

// Trigger manual crawl for one OEM
const fordResult = await orchestrator.crawlOem('ford-au');

// Trigger design capture
const designResult = await orchestrator.triggerDesignCapture('kia-au', 'homepage');
```

---

## Files Created

```
supabase/migrations/00002_ai_inference_log.sql
src/oem/types.ts
src/oem/registry.ts
src/oem/index.ts
src/crawl/scheduler.ts
src/crawl/index.ts
src/extract/engine.ts
src/extract/index.ts
src/ai/router.ts
src/ai/sales-rep.ts
src/ai/index.ts
src/notify/change-detector.ts
src/notify/slack.ts
src/notify/index.ts
src/design/agent.ts
src/design/index.ts
src/orchestrator.ts
src/index.ts
docs/IMPLEMENTATION_SUMMARY.md
```

**Total:** 20 new files, ~3,500 lines of TypeScript
