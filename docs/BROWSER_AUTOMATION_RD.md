# Browser Automation R&D Summary

> Research findings on browser automation frameworks for OEM Agent enhancement.

**Date**: 2026-02-13
**Status**: Research Complete
**Recommendation**: Adopt self-healing patterns from Stagehand; keep CDP core

---

## Executive Summary

We evaluated three browser automation approaches for improving OEM Agent's extraction reliability:

| Approach | Verdict | Reason |
|----------|---------|--------|
| **Direct CDP** (current) | Keep | Fast, low cost, already integrated |
| **browser-use** | Reference only | Python-based, not directly usable |
| **Stagehand** | Adopt patterns | Self-healing selectors are valuable |

**Key takeaway**: We should implement Stagehand's **self-healing selector pattern** and **action caching** without replacing our CDP infrastructure.

---

## 1. browser-use

**Repository**: https://github.com/browser-use/browser-use
**Language**: Python
**License**: MIT (free)

### What It Does

browser-use is an open-source Python framework that wraps Playwright with AI reasoning. The agent decides what actions to take (click, type, navigate) using vision or DOM analysis.

```python
from browser_use import Agent
from langchain_openai import ChatOpenAI

agent = Agent(
    task="Find the price for Kia Sportage GT-Line",
    llm=ChatOpenAI(model="gpt-4o"),
)
result = await agent.run()
```

### Architecture

```
User Task → LLM Agent → browser-use → Playwright → Chrome
                ↑
    Screenshots + DOM extraction
```

### Cost Structure

- **Framework**: Free (MIT license)
- **LLM costs**: Your own API keys
- **ChatBrowserUse model**: $0.20/$2.00 per million tokens (input/output)

### Key Features

1. **Vision-based element detection**: Uses screenshots for element location
2. **Multi-tab support**: Handle complex flows across tabs
3. **Custom actions**: Extend with domain-specific operations
4. **MCP integration**: Works with Groq via Model Context Protocol

### Evaluation for OEM Agent

| Aspect | Assessment |
|--------|------------|
| Language compatibility | ❌ Python (we're TypeScript) |
| Direct integration | ❌ Would require Python runtime |
| Concepts applicable | ✅ Vision-based fallback is useful |
| LLM cost per page | ~$0.01-0.05 (high for scale) |

**Verdict**: Not directly usable, but vision-based approach informs our Layer 3 design.

---

## 2. Stagehand (Browserbase)

**Repository**: https://github.com/browserbase/stagehand
**Language**: TypeScript
**License**: MIT (free)

### What It Does

Stagehand is a TypeScript SDK for browser automation with a hybrid AI/code approach. Its killer feature is **self-healing selectors** that adapt when pages change.

```typescript
import Stagehand from "@browserbase/stagehand";

const stagehand = new Stagehand();
await stagehand.init();

// Semantic action - no CSS selector needed
await stagehand.act({ action: "click the submit button" });

// Extraction with natural language
const price = await stagehand.extract({
  instruction: "get the vehicle price in AUD",
  schema: { price: "number" }
});
```

### Architecture

```
Semantic Action → Stagehand → LLM (element finding) → Playwright → Browser
                      ↓
              Action Cache (reduces LLM calls)
```

### Cost Structure

- **SDK**: Free (MIT license)
- **Browserbase cloud**: Free tier → $9/mo Pro → $29/mo Team
- **LLM costs**: Your own API keys

### Key Features

#### 1. Self-Healing Selectors

Instead of brittle CSS selectors that break when OEMs update their sites:

```typescript
// OLD: Brittle CSS selector
await page.click('.variant-card .price-container .value');

// NEW: Semantic action
await stagehand.act({ action: "click the price for this variant" });
```

When the DOM changes, Stagehand uses the LLM to find the new element location automatically.

#### 2. Action Caching

Stagehand caches successful actions, reducing LLM calls by ~70%:

```typescript
// First time: LLM analyzes DOM, finds element, executes action
// Subsequent times: Uses cached selector, no LLM call
```

#### 3. Hybrid Approach

Use code for known paths, AI for unknown:

```typescript
// Known path: direct navigation
await page.goto('https://www.kia.com/au/build-and-price');

// Unknown path: AI finds the element
const sportage = await stagehand.act({
  action: "click on Sportage model card"
});
```

### Evaluation for OEM Agent

| Aspect | Assessment |
|--------|------------|
| Language compatibility | ✅ TypeScript |
| Direct integration | ⚠️ Requires Browserbase cloud |
| Concepts applicable | ✅ Self-healing + caching very useful |
| LLM cost per page | ~$0.005 after caching |

**Verdict**: Don't adopt the full SDK (cloud dependency), but implement the patterns.

---

## 3. Our Current Approach: Direct CDP

### What We Have

We use Chrome DevTools Protocol directly via Cloudflare Browser Rendering:

```typescript
// skills/cloudflare-browser/scripts/cdp-client.js
const client = await createCdpClient({
  cdpUrl: `${WORKER_URL}/cdp?secret=${CDP_SECRET}`
});

await client.send('Page.navigate', { url });
const html = await client.send('Runtime.evaluate', {
  expression: 'document.documentElement.outerHTML'
});
```

### Strengths

- **Speed**: Direct CDP is fastest (~100ms per operation)
- **Cost**: ~$0.001 per page (Cloudflare render cost only)
- **No cloud dependency**: Runs in our Sandbox container
- **Network interception**: Full control over XHR/fetch capture

### Weaknesses

- **Brittle selectors**: When OEMs update, extraction breaks
- **Manual discovery**: No automatic pattern learning
- **High maintenance**: Need to fix selectors manually

---

## 4. Recommended Enhancements

### Pattern 1: Self-Healing Selectors

Store CSS selector + semantic description together:

```typescript
interface SelectorConfig {
  selector: string;      // '.variant-price'
  semantic: string;      // 'Price in AUD for vehicle variant'
  lastVerified: string;
  failureCount: number;
}

async function extractWithHealing(config: SelectorConfig): Promise<string> {
  try {
    return await page.$eval(config.selector, el => el.textContent);
  } catch {
    // Selector failed - use LLM to repair
    const newSelector = await repairSelector(config.semantic, pageContent);
    config.selector = newSelector;
    await cacheSelector(config);
    return await page.$eval(newSelector, el => el.textContent);
  }
}
```

### Pattern 2: Action Caching

Cache successful extraction patterns per OEM:

```typescript
// discoveries/kia-au.json
{
  "selectors": {
    "variant_price": {
      "selector": ".trim-card .price",
      "semantic": "Vehicle variant price in AUD",
      "cachedAt": "2026-02-13T10:00:00Z",
      "hitCount": 247,
      "missCount": 0
    }
  }
}
```

On cache hit: Use selector directly (no LLM)
On cache miss: LLM repair → update cache

### Pattern 3: Network Interception for API Discovery

Use CDP's Network domain to find APIs automatically:

```typescript
await client.send('Network.enable');

const capturedApis: DiscoveredApi[] = [];

client.on('Network.responseReceived', async (params) => {
  const { response, requestId } = params;

  if (response.mimeType === 'application/json') {
    const body = await client.send('Network.getResponseBody', { requestId });

    capturedApis.push({
      url: response.url,
      method: params.request?.method || 'GET',
      content_type: response.mimeType,
      sample_response: JSON.parse(body.body),
      provides: await classifyApiData(body.body) // LLM classification
    });
  }
});
```

---

## 5. Cost Impact Analysis

### Current State (CDP only)

| Operation | Volume/Month | Cost |
|-----------|--------------|------|
| Page renders | ~3,000 | $150 |
| Total | | **$150/month** |

### With Self-Healing (Proposed)

| Operation | Volume/Month | Cost |
|-----------|--------------|------|
| Page renders | ~3,000 | $150 |
| LLM repairs (~2% of renders) | ~60 | $0.60 |
| Total | | **$150.60/month** |

**Impact**: Minimal cost increase (+0.4%) for significant reliability improvement.

---

## 6. Implementation Plan

### Phase 1: Selector Config Schema

Add semantic descriptions to all existing selectors.

**Files to update**:
- `lib/shared/types.ts` - Add SelectorConfig interface
- `discoveries/*.json` - Add semantic field to each selector

### Phase 2: Self-Healing Extraction

Implement repair function with LLM fallback.

**New file**: `src/extract/self-heal.ts`

### Phase 3: Action Caching

Track selector hits/misses and optimize.

**New file**: `src/extract/cache.ts`

### Phase 4: Network Interception

Add API discovery to oem-build-price-discover skill.

**Update**: `skills/oem-build-price-discover/index.ts`

---

## 7. References

- [browser-use GitHub](https://github.com/browser-use/browser-use)
- [Stagehand GitHub](https://github.com/browserbase/stagehand)
- [Groq + browser-use](https://console.groq.com/docs/browseruse)
- [Groq + Browserbase](https://console.groq.com/docs/browserbase)
- [ClawWatcher Monitoring](https://clawwatcher.com/)
- [CDP Network Domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
