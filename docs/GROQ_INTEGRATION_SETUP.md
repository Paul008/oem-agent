# Groq Integration Setup Guide

> Step-by-step guide to set up and test the Groq API integration for autonomous agent workflows

## Prerequisites

- ✅ Groq API account (free tier available)
- ✅ Node.js 22+ installed
- ✅ pnpm package manager

## Step 1: Get Groq API Key

### Create Groq Account

1. Visit [groq.com/cloud](https://console.groq.com/)
2. Sign up for a free account (no credit card required)
3. Navigate to **API Keys** section
4. Click **Create API Key**
5. Copy the key (starts with `gsk_...`)

**Free Tier Limits**:
- 14,400 requests per day
- 60 requests per minute
- Plenty for testing and production use

## Step 2: Configure Environment Variables

### Local Development (.env.local)

```bash
# Add to .env.local (create if doesn't exist)
GROQ_API_KEY=gsk_your_key_here

# Optional: Other providers for fallback
KIMI_API_KEY=sk_your_kimi_key_here
GEMINI_API_KEY=AIza_your_gemini_key_here
ANTHROPIC_API_KEY=sk-ant_your_claude_key_here
```

### Cloudflare Workers (wrangler.toml)

```toml
# Add to wrangler.toml or wrangler.jsonc
[vars]
# ... existing vars

[env.production.vars]
# GROQ_API_KEY is set via wrangler secret (see below)
```

### Set Secrets (Production)

```bash
# Set Groq API key as secret
npx wrangler secret put GROQ_API_KEY

# Paste your key when prompted
```

## Step 3: Test Groq Integration

### Install Dependencies

```bash
# Install tsx for running TypeScript directly
pnpm add -D tsx
```

### Run Test Script

```bash
# Export API key
export GROQ_API_KEY=gsk_your_key_here

# Run tests
npx tsx src/workflows/test-groq.ts
```

### Expected Output

```
🚀 Groq Multi-Provider Integration Tests
════════════════════════════════════════════════════════════

🧪 Test 1: Simple Price Validation
════════════════════════════════════════════════════════════

✅ Response received
⏱️  Duration: 423ms
💰 Cost: $0.000032
📊 Tokens: 245 in, 156 out
🤖 Model: llama-3.1-8b-instant

📝 Agent Result:
   Success: true
   Confidence: 0.98
   Actions: update_price, log_validation
   Reasoning: Price extracted from source matches database exactly

🧪 Test 2: Complex Data Extraction (Mixtral)
════════════════════════════════════════════════════════════

✅ Response received
⏱️  Duration: 672ms
💰 Cost: $0.000089
📊 Tokens: 312 in, 189 out
🤖 Model: mixtral-8x7b-32768

📊 Test Summary
════════════════════════════════════════════════════════════

✅ Tests passed: 2/2
💰 Total cost: $0.000121
⏱️  Avg duration: 547ms

💡 Cost Comparison:
   Groq (actual): $0.000121
   Claude Haiku (estimated): $0.000605 (5x more expensive)
   Claude Sonnet (estimated): $0.007260 (60x more expensive)

✨ Groq integration working! Ready for production.
```

## Step 4: Run Database Migration

### Apply Migration Locally

```bash
# Link to Supabase project (if not already linked)
supabase link --project-ref your-project-ref

# Apply migration
supabase db push

# Or apply specific migration
supabase migration up --name 20260223_agent_actions
```

### Verify Tables Created

```bash
# Check if tables exist
supabase db reset --dry-run

# Should show:
# - agent_actions
# - workflow_settings
```

## Step 5: Test with Real Change Event

### Create Test Change Event

```typescript
// Create a test change event in Supabase
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-service-role-key'
);

const changeEvent = {
  id: crypto.randomUUID(),
  oem_id: 'toyota',
  entity_type: 'product',
  entity_id: 'prod-test-123',
  event_type: 'price_changed',
  severity: 'critical',
  summary: 'Toyota Hilux SR5: price changed from $45,990 to $46,990',
  diff_json: {
    price_amount: { old: 45990, new: 46990 }
  },
  created_at: new Date().toISOString(),
};

await supabase.from('change_events').insert(changeEvent);
```

### Trigger Workflow Manually

```typescript
// Test the workflow router
import { WorkflowRouter } from './src/workflows/router';
import { AgentSpawner } from './src/workflows/agent-spawner';
import { createMultiProviderClient } from './src/ai/multi-provider';

const router = new WorkflowRouter(supabase);
const aiClient = createMultiProviderClient(process.env);
const spawner = new AgentSpawner(supabase, aiClient);

// Match workflows
const matches = router.matchWorkflows(changeEvent);
console.log(`Found ${matches.length} matching workflows`);

// Spawn agent for best match
if (matches.length > 0) {
  const agentId = await spawner.spawnAgent(matches[0]);
  console.log(`Agent ${agentId} spawned successfully`);
}
```

## Step 6: Monitor Agent Actions

### Query Agent Actions Table

```sql
-- Check recent agent actions
SELECT
  id,
  workflow_id,
  status,
  confidence_score,
  actions_taken,
  cost_usd,
  execution_time_ms,
  created_at
FROM agent_actions
ORDER BY created_at DESC
LIMIT 10;
```

### Expected Results

```
id          | workflow_id       | status    | confidence | cost_usd  | exec_time
------------|-------------------|-----------|------------|-----------|----------
agent-a1b2  | price-validation  | completed | 0.98       | 0.000032  | 423
agent-c3d4  | product-enrichment| completed | 0.87       | 0.000156  | 892
```

## Step 7: Production Deployment

### Update wrangler.toml

```toml
# Add Groq configuration
[env.production]
name = "oem-agent-production"
vars = { }

# Set secrets via CLI:
# npx wrangler secret put GROQ_API_KEY
# npx wrangler secret put KIMI_API_KEY
# npx wrangler secret put GEMINI_API_KEY
```

### Deploy Worker

```bash
# Deploy to Cloudflare
npx wrangler deploy

# Verify secrets are set
npx wrangler secret list
```

### Enable Workflows

Update workflow settings in database:

```sql
-- Enable price validation workflow
UPDATE workflow_settings
SET enabled = true
WHERE id = 'price-validation';

-- Enable product enrichment workflow
UPDATE workflow_settings
SET enabled = true
WHERE id = 'product-enrichment';
```

## Troubleshooting

### Issue: "GROQ_API_KEY not configured"

**Solution**: Verify environment variable is set:
```bash
echo $GROQ_API_KEY
# Should output: gsk_...
```

### Issue: "Groq API error: 401"

**Solution**: Invalid API key. Check:
1. Key is copied correctly (no extra spaces)
2. Key starts with `gsk_`
3. Key is active in Groq console

### Issue: "Groq API error: 429 (Rate Limit)"

**Solution**: You've hit the free tier limit:
- Wait 1 minute (60 req/min limit)
- Or wait 24 hours (14,400 req/day limit)
- Upgrade to paid tier if needed

### Issue: "response_format not supported"

**Solution**: Some Groq models don't support JSON mode:
- Use `llama-3.1-8b-instant` (supports JSON)
- Or remove `response_format` and parse manually

### Issue: High costs

**Check**: Are you using the right model?
- Llama 3.1 8B: $0.05/$0.08 per 1M tokens ✅
- Mixtral 8x7B: $0.24/$0.24 per 1M tokens ✅
- If costs are high, you may be calling wrong provider

## Cost Monitoring

### Track Costs in Database

```sql
-- Total AI costs by provider
SELECT
  provider,
  SUM(cost_usd) as total_cost,
  COUNT(*) as request_count,
  AVG(cost_usd) as avg_cost
FROM ai_inference_log
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY provider;
```

### Set Up Alerts

Create alert in Supabase:

```sql
-- Alert if daily costs exceed $1
SELECT
  DATE(created_at) as date,
  SUM(cost_usd) as daily_cost
FROM ai_inference_log
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
HAVING SUM(cost_usd) > 1.00;
```

## Performance Benchmarks

### Expected Latency

| Model | P50 Latency | P95 Latency |
|-------|-------------|-------------|
| Llama 3.1 8B | 300-500ms | 800ms |
| Mixtral 8x7B | 500-800ms | 1,200ms |

### Expected Costs (500 workflows/month)

| Workflow | Model | Monthly Cost |
|----------|-------|--------------|
| Price Validation (200x) | Llama 3.1 8B | $0.64 |
| Product Enrichment (100x) | Gemini Flash | $2.08 |
| Link Repair (75x) | Llama 3.1 8B | $0.15 |
| Others (125x) | Mixed | $0.50 |
| **Total** | - | **$3.37** |

## Next Steps

1. ✅ Groq integration working
2. ⏳ Add Gemini integration for complex tasks
3. ⏳ Build dashboard UI for monitoring
4. ⏳ Enable workflows in production
5. ⏳ Monitor costs and performance

## Resources

- [Groq Documentation](https://console.groq.com/docs)
- [Groq Pricing](https://groq.com/pricing)
- [Model Benchmarks](https://wow.groq.com)
- [API Reference](https://console.groq.com/docs/api-reference)

---

**Ready to scale!** 🚀 Your Groq integration is set up and tested.
