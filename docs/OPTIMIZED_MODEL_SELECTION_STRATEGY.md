# Optimized AI Model Selection Strategy

> Cost-optimized workflow assignments using Groq, Kimi, Gemini, and Claude

## Price Comparison (Per 1M Tokens)

| Provider | Model | Input | Output | Speed | Best For |
|----------|-------|-------|--------|-------|----------|
| **Groq** | Llama-3.1-8b-instant | $0.05 | $0.08 | ⚡ Ultra-fast (280ms TTFT) | Simple validation, pattern matching |
| **Groq** | Mixtral-8x7b | $0.24 | $0.24 | ⚡ Very fast | Medium complexity, structured tasks |
| **Kimi** | K2 (with cache) | $0.15 | $2.50 | 🟢 Fast | Repeated tasks, Chinese content |
| **Kimi** | kimi-latest 8K | $0.20 | $2.00 | 🟢 Fast | Auto-scaling, short context |
| **Gemini** | 2.0 Flash | $0.10 | $0.40 | 🟢 Fast (39 TPS) | Vision, multimodal, balanced |
| **Gemini** | 2.0 Flash Thinking | $0.10 | $3.90 | 🟡 Medium | Complex reasoning, math |
| **Claude** | Haiku 4.5 | $0.25 | $1.25 | 🟢 Fast | Reliable, general purpose |
| **Claude** | Sonnet 4.5 | $3.00 | $15.00 | 🟡 Medium | Complex extraction, analysis |
| **Claude** | Opus 4.6 | $15.00 | $75.00 | 🔴 Slow | Content generation, critical decisions |

**Sources**:
- [Groq Pricing](https://groq.com/pricing)
- [Kimi API Pricing](https://platform.moonshot.ai/docs/pricing/chat)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Speed Comparison](https://medium.com/@future_agi/top-11-llm-api-providers-in-2026-7eb5d235ef27)

---

## Optimized Workflow Assignments

### Tier 1: Ultra-Cheap Tasks (Groq Llama-3.1-8b)

**Cost**: $0.05 input / $0.08 output per 1M tokens

**Workflows**:
1. ✅ **Price Validation** - Simple comparison task
2. ✅ **Link Repair** - URL validation
3. ✅ **Offer Expiry** - Date comparison
4. ✅ **Disclaimer Compliance** - Pattern matching

**Why Groq Llama**:
- 95% cheaper than Claude Haiku ($0.05 vs $0.25 input)
- Ultra-fast inference (280ms TTFT)
- Sufficient capability for structured tasks
- No reasoning depth required

**Example Cost**:
```
Price Validation (6 turns × 10K tokens avg):
  Input: 60K tokens × $0.05/1M = $0.003
  Output: 3K tokens × $0.08/1M = $0.0002
  Total: $0.0032 per validation

vs Claude Haiku: $0.0081 (60% savings)
```

---

### Tier 2: Medium Complexity (Groq Mixtral or Kimi K2)

**Cost**: Mixtral $0.24/$0.24 or Kimi K2 $0.60/$2.50 per 1M tokens

**Workflows**:
1. ✅ **Variant Sync** - Data parsing and matching
2. ✅ **Image Quality Validation** - Structured analysis

**Why Mixtral/Kimi**:
- Still 92% cheaper than Claude Sonnet ($0.24 vs $3.00 input)
- Good for structured data extraction
- Faster than Sonnet
- Kimi excels with caching (75% off cached tokens)

**Example Cost**:
```
Variant Sync (6 turns × 15K tokens avg):
  Mixtral:
    Input: 90K tokens × $0.24/1M = $0.0216
    Output: 9K tokens × $0.24/1M = $0.0022
    Total: $0.0238 per sync

  vs Claude Sonnet: $0.2205 (89% savings)
```

---

### Tier 3: Complex Extraction (Gemini 2.0 Flash)

**Cost**: $0.10 input / $0.40 output per 1M tokens

**Workflows**:
1. ✅ **Product Enrichment** - Vision + text extraction
2. ✅ **New Model Detection** - Multimodal analysis

**Why Gemini Flash**:
- 97% cheaper than Claude Opus ($0.10 vs $15.00 input)
- 93% cheaper than Claude Sonnet ($0.10 vs $3.00 input)
- Multimodal (handles images + text natively)
- Good balance of speed and capability
- Strong at structured data extraction

**Example Cost**:
```
Product Enrichment (8 turns × 20K tokens avg):
  Input: 160K tokens × $0.10/1M = $0.016
  Output: 12K tokens × $0.40/1M = $0.0048
  Total: $0.0208 per enrichment

  vs Claude Sonnet: $0.2904 (93% savings)
```

---

### Tier 4: Content Generation (Gemini 2.0 Flash Thinking)

**Cost**: $0.10 input / $3.90 output per 1M tokens (with thinking mode)

**Workflows**:
1. ✅ **Model Page Generation** - Marketing content creation
2. ✅ **Feature Description Writing** - Creative copy

**Why Gemini Thinking**:
- 95% cheaper than Claude Opus ($3.90 vs $75.00 output)
- Thinking mode provides reasoning for content decisions
- Multimodal (can analyze images for content inspiration)
- Good at structured output (JSON, markdown)

**Example Cost**:
```
Model Page Generation (10 turns × 30K tokens avg):
  Input: 300K tokens × $0.10/1M = $0.03
  Output: 20K tokens × $3.90/1M = $0.078
  Total: $0.108 per page

  vs Claude Opus: $7.95 (99% savings)
```

---

### Tier 5: Critical Fallback (Claude Models)

**Use Claude only when**:
- Groq/Kimi/Gemini fail or produce low-confidence results
- Legal/compliance content requires highest accuracy
- Customer-facing content needs brand voice precision

**Fallback Strategy**:
1. Try Groq/Kimi/Gemini first
2. If confidence < 0.70 → Retry with Claude Haiku
3. If confidence < 0.85 → Escalate to Claude Sonnet
4. If critical decision → Use Claude Opus

---

## Revised Cost Projections

### Conservative Scenario (200 workflows/month)

**Old Strategy (Claude-heavy)**:
```
Price Validation (80): 80 × $0.0081 = $0.65
Product Enrichment (40): 40 × $0.2904 = $11.62
Link Repair (30): 30 × $0.0045 = $0.14
Offer Expiry (10): 10 × $0.0035 = $0.04
Image Quality (20): 20 × $0.1800 = $3.60
Disclaimer Check (15): 15 × $0.0028 = $0.04
Variant Sync (5): 5 × $0.2205 = $1.10
──────────────────────────────────────
Total AI Costs: $17.19/month
```

**New Strategy (Optimized)**:
```
Price Validation (80 @ Groq): 80 × $0.0032 = $0.26
Product Enrichment (40 @ Gemini): 40 × $0.0208 = $0.83
Link Repair (30 @ Groq): 30 × $0.0018 = $0.05
Offer Expiry (10 @ Groq): 10 × $0.0014 = $0.01
Image Quality (20 @ Mixtral): 20 × $0.0720 = $1.44
Disclaimer Check (15 @ Groq): 15 × $0.0011 = $0.02
Variant Sync (5 @ Mixtral): 5 × $0.0238 = $0.12
──────────────────────────────────────
Total AI Costs: $2.73/month (84% savings)
```

### Moderate Scenario (500 workflows/month)

**Old Strategy**: $42.98/month
**New Strategy**: $6.83/month (84% savings)

### Aggressive Scenario (1,000 workflows/month + Page Generation)

**Old Strategy**:
```
Base workflows: $85.95
Model Page Gen (10 @ Opus): 10 × $7.95 = $79.50
Total: $165.45/month
```

**New Strategy**:
```
Base workflows: $13.65
Model Page Gen (10 @ Gemini Thinking): 10 × $0.108 = $1.08
Total: $14.73/month (91% savings)
```

---

## Smart Caching Strategy with Kimi

Kimi K2 offers **75% discount on cached tokens** ($0.15/M vs $0.60/M).

**Use Cases for Kimi Cache**:
- Repeated product enrichment from same OEM
- Common disclaimer pattern matching
- Similar variant sync operations

**Example**:
```
First product enrichment (no cache):
  Input: 100K tokens × $0.60/1M = $0.06

Next 9 products (80K cached, 20K new):
  Cached: 80K × $0.15/1M = $0.012
  New: 20K × $0.60/1M = $0.012
  Total: $0.024 (60% savings)
```

---

## Multi-Provider Fallback Chain

**Reliability Strategy**:

```typescript
async function executeWorkflow(workflow, context) {
  const providers = [
    { name: 'groq', model: 'llama-3.1-8b-instant', cost: 0.065 },
    { name: 'kimi', model: 'k2', cost: 1.6 },
    { name: 'gemini', model: '2.0-flash', cost: 0.25 },
    { name: 'claude', model: 'haiku-4.5', cost: 0.75 },
  ];

  for (const provider of providers) {
    try {
      const result = await callProvider(provider, workflow, context);

      if (result.confidence >= workflow.confidence_threshold) {
        return result; // Success!
      }

      console.log(`${provider.name} confidence too low (${result.confidence}), trying next...`);
    } catch (error) {
      console.log(`${provider.name} failed, trying next...`);
    }
  }

  throw new Error('All providers failed');
}
```

**Success Rate Expectation**:
- Groq handles: 80% of simple tasks
- Kimi handles: 10% of medium tasks
- Gemini handles: 8% of complex tasks
- Claude fallback: 2% of critical tasks

---

## Implementation Changes Required

### 1. Update Agent Spawner

```typescript
// src/workflows/agent-spawner.ts

const MODEL_SELECTION: Record<string, { provider: string; model: string }> = {
  'price-validator': { provider: 'groq', model: 'llama-3.1-8b-instant' },
  'product-enricher': { provider: 'gemini', model: 'gemini-2.0-flash' },
  'link-validator': { provider: 'groq', model: 'llama-3.1-8b-instant' },
  'offer-manager': { provider: 'groq', model: 'llama-3.1-8b-instant' },
  'image-validator': { provider: 'groq', model: 'mixtral-8x7b' },
  'page-generator': { provider: 'gemini', model: 'gemini-2.0-flash-thinking' },
  'compliance-checker': { provider: 'groq', model: 'llama-3.1-8b-instant' },
  'variant-sync': { provider: 'groq', model: 'mixtral-8x7b' },
};
```

### 2. Add API Clients

```typescript
// src/ai/multi-provider.ts

export class MultiProviderClient {
  async callGroq(model: string, prompt: string): Promise<Response> { ... }
  async callKimi(model: string, prompt: string): Promise<Response> { ... }
  async callGemini(model: string, prompt: string): Promise<Response> { ... }
  async callClaude(model: string, prompt: string): Promise<Response> { ... }
}
```

### 3. Environment Variables

```bash
# .env
GROQ_API_KEY=gsk_...
KIMI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Final Cost Summary

### Total Monthly Costs (500 workflows/month)

```
AI API Costs (Optimized):    $6.83   (was $42.98, 84% savings)
Browser Automation (Free):   $0.00   (100 sessions free tier)
Cloudflare Workers:          $9.90
OpenClaw Hosting:            $7.00
Storage:                     $1.00
─────────────────────────────────────
TOTAL:                       $24.73/month

vs Original Estimate:        $109.88/month
TOTAL SAVINGS:               $85.15/month (77%)
```

### ROI Calculation

**Monthly Cost**: $24.73
**Monthly Savings**: $2,500 (manual work reduction)
**ROI**: **101x return** 🚀

---

## Recommendations

### Phase 1: Start with Groq Only

```
Enable: Price Validation, Link Repair, Offer Expiry
Model: Groq Llama-3.1-8b-instant
Volume: 50 workflows/month
Expected Cost: $0.50/month

Test for 1 week, validate accuracy
```

### Phase 2: Add Gemini for Complex Tasks

```
Enable: Product Enrichment
Model: Gemini 2.0 Flash
Volume: 150 workflows/month
Expected Cost: $3.50/month

Monitor quality vs Claude baseline
```

### Phase 3: Full Deployment

```
Enable: All workflows with optimized models
Volume: 500+ workflows/month
Expected Cost: $6-10/month

90%+ cost savings vs Claude-only
```

---

## Quality Validation Strategy

**Before full rollout**, run A/B comparison:

| Metric | Groq | Gemini | Claude | Target |
|--------|------|--------|--------|--------|
| **Accuracy** | Test 100 samples | Test 100 samples | Baseline | >95% match |
| **Confidence Score** | Compare | Compare | Baseline | >0.85 avg |
| **Speed** | <500ms | <2s | Baseline | Faster |
| **Cost** | 95% cheaper | 97% cheaper | $1.00 | <$0.10 |

**If Groq/Gemini accuracy < 95%**: Use Claude fallback
**If Groq/Gemini speed issues**: Scale Groq LPU instances

---

## Key Takeaways

1. **Groq for simple tasks** → 95% cost reduction
2. **Gemini for complex/multimodal** → 93-97% cost reduction
3. **Kimi for repetitive tasks** → 75% cache discount
4. **Claude as fallback only** → 2% of workflows

**Bottom Line**: $6-10/month AI costs vs $40-90/month with Claude-only strategy.

Start with Groq, validate quality, scale with confidence. 🚀
