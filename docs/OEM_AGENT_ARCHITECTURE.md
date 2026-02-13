# OEM Agent Architecture

> Intelligent OEM data extraction system with self-healing capabilities and automated discovery.

## Table of Contents

1. [Overview](#overview)
2. [Four-Layer Architecture](#four-layer-architecture)
3. [OpenClaw Integration](#openclaw-integration)
4. [Browser Automation Stack](#browser-automation-stack)
5. [Self-Healing Extraction](#self-healing-extraction)
6. [Memory & Learning System](#memory--learning-system)
7. [Semantic Search & Vector Embeddings](#semantic-search--vector-embeddings)
8. [Scheduling & Cost Control](#scheduling--cost-control)
9. [API Reference](#api-reference)

---

## Overview

The OEM Agent is an intelligent web scraping and monitoring system designed to extract vehicle data (prices, variants, colors, disclaimers) from 13+ Australian OEM websites. It runs on OpenClaw within a Cloudflare Sandbox container, leveraging browser automation, AI-powered discovery, and self-healing extraction patterns.

### Key Capabilities

- **Automated Discovery**: AI-driven pattern detection for new OEM configurators
- **Self-Healing Extraction**: Selectors that adapt when OEM sites change
- **Cost-Controlled Crawling**: Budget-aware scheduling with render caps
- **Multi-Source Intelligence**: Brave Search + Perplexity for research
- **Real-Time Alerting**: Slack notifications for price/offer changes

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Cloudflare Sandbox | Container hosting |
| Agent Framework | OpenClaw | Cron, memory, skills |
| Browser Automation | CDP (Chrome DevTools Protocol) | Page rendering, network interception |
| LLM Inference | Groq (llama-3.1-70b) | Classification, analysis |
| Database | Supabase (PostgreSQL) | Data persistence |
| Research | Brave Search + Perplexity | OEM tech stack discovery |

---

## Four-Layer Architecture

The OEM Agent uses a four-layer approach that optimizes for speed, cost, and reliability:

```
┌─────────────────────────────────────────────────────────────────┐
│                       OEM AGENT LAYERS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  LAYER 1: RESEARCH                                      │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│  │  • Brave Search API for tech stack discovery            │   │
│  │  • Perplexity API for pattern synthesis                 │   │
│  │  • Pre-crawl intelligence gathering                     │   │
│  │  • Runs: Weekly or on new OEM onboarding               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  LAYER 2: FAST PATH                                     │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│  │  • Known APIs → Direct JSON extraction                  │   │
│  │  • Cached selectors → DOM extraction                    │   │
│  │  • No LLM calls required                                │   │
│  │  • Cost: ~$0.001/page | Speed: <1s                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓ (on selector failure)            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  LAYER 3: ADAPTIVE PATH                                 │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│  │  • Self-healing selector repair                         │   │
│  │  • LLM finds new element → caches result                │   │
│  │  • Inspired by Stagehand's semantic actions             │   │
│  │  • Cost: ~$0.01/repair | Speed: 2-5s                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓ (on pattern unknown)             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  LAYER 4: DISCOVERY MODE                                │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│  │  • Full AI-driven exploration                           │   │
│  │  • Network interception for API discovery               │   │
│  │  • DOM analysis for selector generation                 │   │
│  │  • Cost: ~$0.10/OEM | Speed: 30-60s                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Layer 1: Research

**Purpose**: Gather intelligence about OEM tech stacks before crawling.

**Triggers**:
- New OEM onboarding
- Weekly refresh (cron)
- Manual request

**Tools**:
- **Brave Search API**: Technology stack, developer discussions
- **Perplexity API**: Pattern synthesis, CMS detection

**Output**: `ResearchFindings` stored in agent memory

```typescript
interface ResearchFindings {
  tech_stack?: string[];        // ["React", "Adobe AEM"]
  known_apis?: string[];        // API hints from search
  cms_platform?: string;        // "Adobe AEM" | "Sitecore"
  similar_oems?: string[];      // OEMs with similar patterns
  relevant_sources?: string[];  // URLs for reference
  pattern_hints?: string[];     // URL/data patterns
}
```

### Layer 2: Fast Path

**Purpose**: Extract data using known, cached patterns—no AI needed.

**Strategy Selection**:
```typescript
if (discoveryResult.strategy.primary === 'api') {
  // Direct API calls - fastest
  return fetchFromApis(discoveryResult.apis);
} else if (discoveryResult.strategy.primary === 'dom') {
  // Cached CSS selectors
  return extractFromDom(discoveryResult.selectors);
} else {
  // Hybrid: API + DOM fallback
  return hybridExtraction(discoveryResult);
}
```

**Performance**:
- No LLM calls
- ~$0.001 per page (render cost only)
- <1 second per extraction

### Layer 3: Adaptive Path

**Purpose**: Repair broken selectors without full re-discovery.

**Trigger**: Selector returns null/empty when it previously worked

**Process**:
1. Detect extraction failure
2. Capture page screenshot + DOM
3. Send to LLM with semantic description: "Find the price element"
4. LLM returns new selector
5. Cache updated selector
6. Continue extraction

**Inspired by**: Stagehand's self-healing actions

```typescript
async function extractWithFallback(config: ExtractionConfig) {
  try {
    // Fast path: use cached selector
    return await page.$eval(config.selector, extractFn);
  } catch {
    // Adaptive path: LLM repair
    const newSelector = await repairSelector({
      semantic: config.semantic,  // "variant price in AUD"
      screenshot: await page.screenshot(),
      dom: await page.content()
    });

    // Cache for next time
    await updateSelectorCache(config.key, newSelector);

    return await page.$eval(newSelector, extractFn);
  }
}
```

### Layer 4: Discovery Mode

**Purpose**: Full exploration of unknown OEM configurators.

**Trigger**:
- New OEM onboarding
- Major site redesign detected
- Manual discovery request

**Process**:
1. Navigate to entry URL
2. Enable CDP network interception
3. Click through configurator flow
4. Capture all XHR/fetch requests
5. Classify APIs with LLM
6. Extract DOM selectors
7. Store discovery result

**Output**: `DiscoveryResult` with APIs, selectors, URL patterns

---

## OpenClaw Integration

The OEM Agent runs as skills within OpenClaw, leveraging its automation infrastructure.

### Cron Jobs

Scheduled tasks run inside the Gateway and persist across restarts.

```json
// ~/.openclaw/cron/jobs.json
{
  "jobs": [
    {
      "id": "oem-crawl-scheduled",
      "name": "OEM Scheduled Crawls",
      "cron": "0 */2 * * *",
      "session": "isolated",
      "systemEvent": "Run oem-extract for all due pages",
      "delivery": { "mode": "slack", "channel": "#oem-alerts" }
    },
    {
      "id": "oem-discovery-weekly",
      "name": "OEM Pattern Refresh",
      "cron": "0 0 * * 0",
      "session": "isolated",
      "systemEvent": "Re-run oem-build-price-discover for all OEMs"
    },
    {
      "id": "oem-daily-digest",
      "name": "Daily Change Digest",
      "cron": "0 7 * * *",
      "session": "isolated",
      "systemEvent": "Generate and send daily OEM change digest",
      "delivery": { "mode": "slack", "channel": "#oem-daily" }
    }
  ]
}
```

### Memory System

OpenClaw's memory is Markdown files as source of truth:

```
~/.openclaw/workspace/
├── memory/
│   ├── 2026-02-13.md           # Daily log (append-only)
│   └── ...
├── MEMORY.md                    # Long-term curated facts
└── discoveries/
    ├── kia-au.json              # OEM discovery cache
    ├── hyundai-au.json
    └── ...
```

**Memory Flow**:
1. Each crawl appends findings to `memory/YYYY-MM-DD.md`
2. On session compaction, important facts flush to `MEMORY.md`
3. Vector search (Voyage AI) enables semantic retrieval
4. Next crawl reads memory → applies learned patterns

### Hooks

Custom hooks for OEM Agent event handling:

```typescript
// skills/oem-agent-hooks/handler.ts
export const handler: HookHandler = async (event, context) => {
  switch (event.type) {
    case 'command:extract':
      // Log extraction results
      await appendToMemory(event.payload);
      break;

    case 'gateway:startup':
      // Load cached discoveries
      await loadDiscoveryCache();
      break;
  }
};
```

---

## Browser Automation Stack

### Current Approach: Direct CDP

We use Chrome DevTools Protocol directly via Cloudflare Browser Rendering:

```typescript
// skills/cloudflare-browser/scripts/cdp-client.js
const client = await createCdpClient({
  cdpUrl: `${WORKER_URL}/cdp?secret=${CDP_SECRET}`
});

// Enable network interception
await client.send('Network.enable');
client.on('Network.responseReceived', (params) => {
  if (params.response.mimeType === 'application/json') {
    capturedApis.push(params);
  }
});

// Navigate and extract
await client.send('Page.navigate', { url: targetUrl });
const dom = await client.send('Runtime.evaluate', {
  expression: 'document.body.innerHTML'
});
```

### R&D: Alternative Approaches

#### browser-use (Python)

**Repository**: [browser-use/browser-use](https://github.com/browser-use/browser-use)

**What it is**: Open-source Python framework that wraps Playwright with AI reasoning.

**Cost**: Free (MIT license) + LLM API costs

**Key features**:
- Agent decides what actions to take (click, type, navigate)
- Vision-based element detection
- Multi-tab support
- MCP integration for Groq

**Architecture**:
```
User Prompt → LLM Agent → browser-use → Playwright → Browser
                ↑
         Vision/DOM extraction
```

**Evaluation**: Not directly usable (Python, we're TypeScript), but the vision-based approach is valuable for our Adaptive Path layer.

#### Stagehand (browserbase)

**Repository**: [browserbase/stagehand](https://github.com/browserbase/stagehand)

**What it is**: TypeScript SDK with hybrid AI/code browser automation.

**Cost**: Open-source SDK (MIT) + Browserbase cloud tiers

**Key innovation - Self-healing selectors**:
```typescript
// Instead of brittle CSS selectors:
await page.click('.btn-primary.submit-form')

// Stagehand uses semantic actions:
await stagehand.act({ action: "click the submit button" })
```

**Features we should adopt**:
1. **Action caching**: Learns successful actions, reduces LLM calls ~70%
2. **Semantic actions**: Describe intent, not implementation
3. **Self-healing**: If DOM changes, AI finds new selector

**Evaluation**: The self-healing pattern is directly applicable to our Layer 3 (Adaptive Path). We should implement this.

### Comparison Matrix

| Capability | Our CDP Approach | browser-use | Stagehand |
|------------|-----------------|-------------|-----------|
| Browser control | Direct CDP | Playwright + AI | Playwright + AI |
| Selector discovery | Manual/heuristic | AI vision | AI semantic |
| Maintenance | High (selectors break) | Medium | Low (self-healing) |
| Cost per page | ~$0.001 (render) | ~$0.01-0.05 (LLM) | ~$0.005 (cached) |
| Speed | Fast | Slower (LLM latency) | Fast after caching |
| Language | TypeScript | Python | TypeScript |

### Recommendation

**Enhance our approach, don't replace it**:

1. **Keep CDP** for Layer 2 (Fast Path) - maximum speed
2. **Add self-healing** for Layer 3 (Adaptive Path) - inspired by Stagehand
3. **Use action caching** to minimize LLM calls

---

## Self-Healing Extraction

### Pattern Design

Store both CSS selector AND semantic description:

```typescript
interface SelectorConfig {
  // Fast path: CSS selector
  selector: string;

  // Adaptive path: semantic description for LLM repair
  semantic: string;

  // Metadata
  lastVerified: string;
  successRate: number;
  failureCount: number;
}

// Example configuration
const variantPriceConfig: SelectorConfig = {
  selector: '.variant-card .price-value',
  semantic: 'The price in AUD for this vehicle variant, typically shown as "$XX,XXX"',
  lastVerified: '2026-02-13T10:00:00Z',
  successRate: 0.98,
  failureCount: 0
};
```

### Repair Flow

```typescript
async function selfHealingExtract(
  page: Page,
  config: SelectorConfig
): Promise<string | null> {
  try {
    // Layer 2: Fast Path
    const value = await page.$eval(config.selector, el => el.textContent);
    if (value) {
      config.failureCount = 0;
      return value;
    }
  } catch {
    config.failureCount++;
  }

  // Layer 3: Adaptive Path - selector failed
  if (config.failureCount > 0) {
    console.log(`[self-heal] Repairing selector: ${config.semantic}`);

    const newSelector = await repairWithLLM({
      semantic: config.semantic,
      screenshot: await page.screenshot({ encoding: 'base64' }),
      currentSelector: config.selector,
      dom: await page.content()
    });

    if (newSelector) {
      // Update cache
      config.selector = newSelector;
      config.lastVerified = new Date().toISOString();
      await persistSelectorConfig(config);

      // Retry with new selector
      return await page.$eval(newSelector, el => el.textContent);
    }
  }

  return null;
}
```

### LLM Repair Prompt

```typescript
const repairPrompt = `
You are a web scraping expert. A CSS selector has stopped working.

TASK: Find a new CSS selector that matches the described element.

SEMANTIC DESCRIPTION: ${config.semantic}

PREVIOUS SELECTOR (broken): ${config.currentSelector}

PAGE DOM (truncated):
${truncatedDom}

SCREENSHOT: [attached]

Return ONLY the new CSS selector, nothing else.
Example: .new-price-class span.value
`;
```

---

## Memory & Learning System

### Discovery Cache Structure

```typescript
// discoveries/{oem_id}.json
interface DiscoveryCache {
  oem_id: string;
  discovered_at: string;
  last_verified: string;

  // URL patterns for configurator navigation
  url_patterns: {
    model_index?: DiscoveredUrlPattern;
    variant_selection?: DiscoveredUrlPattern;
    color_selection?: DiscoveredUrlPattern;
  };

  // Direct API endpoints (Layer 2 fast path)
  apis: DiscoveredApi[];

  // CSS selectors with semantic descriptions
  selectors: {
    [key: string]: SelectorConfig;
  };

  // Extraction strategy
  strategy: {
    primary: 'api' | 'dom' | 'hybrid';
    requires_js_render: boolean;
    requires_interaction: boolean;
  };

  // Research findings
  research?: ResearchFindings;

  // Statistics
  stats: {
    total_extractions: number;
    successful_extractions: number;
    selector_repairs: number;
    last_failure?: string;
  };
}
```

### Learning Loop

```
┌──────────────────────────────────────────────────────────────┐
│                    OEM Agent Learning Loop                    │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│   ┌─────────┐    ┌─────────────┐    ┌────────────────┐       │
│   │  Cron   │───►│  Extract    │───►│  Log to        │       │
│   │  Trigger│    │  (Layer 2)  │    │  Daily Memory  │       │
│   └─────────┘    └──────┬──────┘    └────────────────┘       │
│                         │                                     │
│                    ┌────▼────┐                               │
│                    │ Failed? │                               │
│                    └────┬────┘                               │
│                    Yes  │  No                                │
│              ┌──────────┴──────────┐                         │
│              ▼                     ▼                         │
│   ┌─────────────────┐    ┌────────────────┐                 │
│   │  Self-Heal      │    │  Update Stats  │                 │
│   │  (Layer 3)      │    │  Cache Success │                 │
│   └────────┬────────┘    └────────────────┘                 │
│            │                                                  │
│            ▼                                                  │
│   ┌─────────────────┐                                        │
│   │  Still Failed?  │                                        │
│   └────────┬────────┘                                        │
│       Yes  │  No                                             │
│   ┌────────┴────────┐                                        │
│   ▼                 ▼                                        │
│ ┌───────────┐  ┌─────────────┐                              │
│ │ Discovery │  │ Cache New   │                              │
│ │ (Layer 4) │  │ Selector    │                              │
│ └───────────┘  └─────────────┘                              │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## Semantic Search & Vector Embeddings

The OEM Agent includes a vector embedding system for semantic search capabilities, enabling natural language queries across products, offers, and change events.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEMANTIC SEARCH PIPELINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────────┐  │
│  │  Products   │───►│  Embedding Gen  │───►│  pgvector DB   │  │
│  │  Offers     │    │  (Gemini/OpenAI)│    │  (768-dim)     │  │
│  │  Changes    │    └─────────────────┘    └───────┬────────┘  │
│  └─────────────┘                                   │            │
│                                                    ▼            │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────────┐  │
│  │  User Query │───►│  Query Embed    │───►│  HNSW Search   │  │
│  │  "family    │    │                 │    │  (cosine sim)  │  │
│  │   SUVs"     │    └─────────────────┘    └───────┬────────┘  │
│  └─────────────┘                                   │            │
│                                                    ▼            │
│                                           ┌────────────────┐   │
│                                           │  Ranked Results│   │
│                                           │  + Similarity  │   │
│                                           └────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Embedding Providers

| Provider | Model | Dimensions | Cost | Recommendation |
|----------|-------|------------|------|----------------|
| **Gemini** | text-embedding-004 | 768 | ~$0.001/1M tokens | Default (best value) |
| OpenAI | text-embedding-3-small | 768 | $0.02/1M tokens | Fallback |
| Groq | nomic-embed-text-v1.5 | 768 | Free tier | Budget option |

### Use Cases

1. **Product Semantic Search**
   - Query: "Find family SUVs with good fuel economy"
   - Returns: Products ranked by semantic similarity

2. **Cross-OEM Similarity**
   - Query: "Find vehicles similar to Kia Sportage"
   - Returns: Comparable vehicles from other OEMs with similarity scores

3. **Change Pattern Detection**
   - Clusters similar change events across OEMs
   - Detects coordinated price changes or offer patterns

### Database Schema

```sql
-- Product embeddings with HNSW index
CREATE TABLE product_embeddings (
  product_id UUID REFERENCES products(id),
  embedding vector(768),
  source_text TEXT,
  model TEXT DEFAULT 'text-embedding-004',
  content_hash TEXT
);

CREATE INDEX idx_product_embeddings_vector
  ON product_embeddings USING hnsw (embedding vector_cosine_ops);
```

### Semantic Search Functions

```typescript
// Natural language product search
const results = await searchProductsSemantic("electric SUV under $60k", {
  matchThreshold: 0.7,
  matchCount: 10,
  oemId: "kia-au"  // optional filter
});

// Cross-OEM similarity
const similar = await findSimilarProducts(productId, {
  matchThreshold: 0.8,
  excludeSameOem: true
});
```

### Sync Schedule

Embeddings are generated via cron job (`oem-agent-hooks`):

| Schedule | Action | Coverage |
|----------|--------|----------|
| Every 6 hours | Sync new items | Products, offers, change events |
| On content change | Auto-invalidate | Triggers re-embedding |

### Auto-Stale Triggers

When product/offer content changes, embeddings are automatically invalidated:

```sql
-- Trigger deletes embedding when source content changes
CREATE TRIGGER trg_product_embedding_stale
  AFTER UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION mark_product_embedding_stale();
```

---

## Scheduling & Cost Control

### Page Type Schedules

From `src/crawl/scheduler.ts`:

| Page Type | Interval | Rationale |
|-----------|----------|-----------|
| homepage | 2 hours | High visibility, frequent updates |
| offers | 4 hours | Promotions change regularly |
| vehicle | 12 hours | Model pages stable |
| build_price | 12 hours | Configurator data |
| news | 24 hours | Press releases infrequent |
| sitemap | 24 hours | Structure changes rare |

### Cost Control Rules

```typescript
interface CostControlConfig {
  skipRenderOnNoChange: true,        // Use hash check first
  maxRenderIntervalMinutes: 120,     // Max 1 render per 2 hours
  monthlyRenderCapPerOem: 1000,      // Per-OEM budget
  globalMonthlyRenderCap: 10000,     // Total budget
  backoffAfterDays: 7,               // Reduce frequency if no changes
  backoffMultiplier: 0.5,            // 50% reduction
}
```

### Cost Estimation

For 13 OEMs with ~20 pages each:

| Metric | Monthly Estimate |
|--------|------------------|
| Cheap checks (fetch) | ~15,000 |
| Full renders (~20% trigger) | ~3,000 |
| Render cost @ $0.05 | ~$150/month |
| LLM repairs (~5% of renders) | ~150 calls |
| LLM cost @ $0.01/call | ~$1.50/month |
| **Total** | **~$151.50/month** |

---

## API Reference

### Skills

| Skill | Purpose | Trigger |
|-------|---------|---------|
| `oem-extract` | Extract data from source pages | Cron, manual |
| `oem-build-price-discover` | Discover configurator patterns | Manual, weekly cron |
| `oem-report` | Send Slack alerts/digests | Change event, cron |
| `oem-agent-hooks` | Maintenance, health monitoring, embeddings | Cron |
| `oem-semantic-search` | Semantic search API for products/offers | API request |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service key |
| `GROQ_API_KEY` | Yes | Groq API for LLM inference |
| `CDP_SECRET` | Yes | Shared secret for browser automation |
| `WORKER_URL` | Yes | Public worker URL for CDP |
| `GOOGLE_API_KEY` | No | Gemini embeddings (recommended) |
| `OPENAI_API_KEY` | No | OpenAI embeddings (fallback) |
| `BRAVE_API_KEY` | No | Brave Search for research |
| `PERPLEXITY_API_KEY` | No | Perplexity for research synthesis |
| `SLACK_WEBHOOK_URL` | No | Slack notifications |

### Database Tables

| Table | Purpose |
|-------|---------|
| `source_pages` | URLs to monitor |
| `products` | Extracted vehicle data |
| `product_variants` | Variant details with colors |
| `offers` | Current promotions |
| `change_events` | Detected changes |
| `crawl_stats` | Monitoring metrics |
| `product_embeddings` | Vector embeddings for product search |
| `offer_embeddings` | Vector embeddings for offer search |
| `change_event_embeddings` | Vector embeddings for pattern detection |

---

## Next Steps

1. **Implement self-healing selectors** in oem-extract skill
2. **Add action caching** to reduce LLM calls
3. **Configure OpenClaw cron jobs** for automated crawling
4. **Set up ClawWatcher** for cost monitoring
5. **Create memory hooks** for discovery persistence

---

## References

- [OpenClaw Documentation](https://docs.openclaw.ai/)
- [OpenClaw Cron Jobs](https://docs.openclaw.ai/automation/cron-jobs)
- [OpenClaw Memory System](https://docs.openclaw.ai/concepts/memory)
- [Stagehand Self-Healing](https://github.com/browserbase/stagehand)
- [browser-use Framework](https://github.com/browser-use/browser-use)
- [ClawWatcher Monitoring](https://clawwatcher.com/)
