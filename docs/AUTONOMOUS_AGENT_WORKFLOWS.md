# Autonomous AI Agent Workflows

> Self-healing system that responds to change events with AI-powered analysis and corrective actions

## Overview

The Autonomous Agent System monitors change events and dispatches specialized Claude AI agents to investigate, analyze, and fix issues without human intervention.

## Architecture

```
┌─────────────────┐
│  Change Event   │ → New product, price change, missing data, etc.
└────────┬────────┘
         ↓
┌─────────────────┐
│ Workflow Router │ → Match event to appropriate workflow
└────────┬────────┘
         ↓
┌─────────────────┐
│  Agent Spawner  │ → Launch Claude agent via OpenClaw
└────────┬────────┘
         ↓
┌─────────────────┐
│  AI Analysis    │ → Agent investigates root cause
└────────┬────────┘
         ↓
┌─────────────────┐
│ Action Decision │ → Determine if fix is safe to apply
└────────┬────────┘
         ↓
┌─────────────────┐
│    Execute      │ → Apply fix, update database, notify
└────────┬────────┘
         ↓
┌─────────────────┐
│   Audit Log     │ → Record all actions for review
└─────────────────┘
```

## OpenClaw Tool Architecture

Agents are spawned via OpenClaw and granted access to specific **OpenClaw tools** — not the underlying libraries. Understanding this separation is critical for infrastructure work.

### Two-Layer Browser System

```
Layer 1 — OpenClaw Agent Tools (what agents see)
  ┌──────────────────────────────────────────────────────┐
  │  browser · exec · read · write · edit · image        │
  │  web_fetch · web_search · apply_patch · process      │
  └──────────────────────┬───────────────────────────────┘
                         │ CDP WebSocket
Layer 2 — Backend Infrastructure (what runs on the server)
  ┌──────────────────────┴───────────────────────────────┐
  │  src/routes/cdp.ts          CDP shim (WebSocket)     │
  │  @cloudflare/puppeteer      Browser Rendering API    │
  │  src/design/page-capturer   Direct Puppeteer usage   │
  │  src/utils/network-browser  Network interception     │
  └──────────────────────────────────────────────────────┘
```

**Layer 1 — OpenClaw tools**: When an agent is granted `browser`, OpenClaw provides a browser tool that sends CDP commands over WebSocket to our Worker. The agent never touches Puppeteer directly.

**Layer 2 — Cloudflare infrastructure**: The Worker's `/cdp` endpoint (`src/routes/cdp.ts`) receives CDP commands and translates them to `@cloudflare/puppeteer` calls against the Cloudflare Browser Rendering binding. This same Puppeteer binding is also used directly by the page capturer and network browser utilities.

### OpenClaw Tool Reference

These are the actual tool names from the [OpenClaw docs](https://docs.openclaw.ai/tools). Always use these in workflow definitions — never use library names like `playwright`, `puppeteer`, `bash`, or `grep`.

| Tool | Purpose | Workflows Using It |
|------|---------|-------------------|
| `browser` | Navigate pages, take screenshots, interact with UI | Price, Product, Offer, Image, Page Gen, Variant |
| `exec` | Run shell commands (replaces `bash`) | Product, Link, Image |
| `read` | Read files from workspace | All workflows |
| `write` | Write files to workspace | Product, Image, Page Gen |
| `edit` | Modify existing files | Price, Product, Link, Offer, Variant |
| `image` | Analyze images via vision model | Product, Image, Page Gen |
| `web_fetch` | HTTP fetch with markdown extraction | Link |
| `web_search` | Brave Search API queries | (available, not yet assigned) |
| `apply_patch` | Multi-hunk file edits | (available, not yet assigned) |
| `process` | Manage background processes | (available, not yet assigned) |

### Tool Profiles

OpenClaw supports security profiles that restrict tool access:

- **minimal**: Only `session_status` (monitoring only)
- **coding**: File system + runtime + sessions + image
- **messaging**: Chat operations + session visibility
- **full**: No restrictions (default for autonomous agents)

Tool groups can be referenced as shorthands: `group:fs`, `group:runtime`, `group:web`, `group:ui`, `group:sessions`.

### Key Distinction: Tools vs Models

The `tools` array controls what **actions** the agent can take. The AI model (Groq, Gemini, Claude) is selected separately in `agent-spawner.ts` via `WORKFLOW_MODELS`. Don't confuse model providers (like `groq`) with tools (like `exec`).

---

## Workflow Definitions

### 1. Price Validation & Correction

**Trigger**: `event_type: 'price_changed'` AND `severity: 'critical'`

**Agent Task**:
1. Navigate to source URL with browser automation
2. Extract current price from OEM website
3. Compare with detected change
4. Validate price format and currency
5. Check for pricing disclaimers or conditions
6. **Action**: Update database if confirmed, flag if mismatch

**Confidence Threshold**: 95% - Auto-fix if price matches source
**Rollback**: Yes - Store previous price for 30 days

**Agent Skill**: `price-validator`

```typescript
{
  workflow: "price-validation",
  trigger: {
    entity_type: "product",
    event_type: "price_changed",
    severity: "critical"
  },
  agent: {
    type: "browser-validator",
    skill: "price-validator",
    tools: ["browser", "read", "edit"],
    confidence_threshold: 0.95
  },
  actions: {
    auto_approve: ["update_price", "log_validation"],
    require_approval: ["flag_mismatch", "notify_team"],
    rollback_enabled: true
  }
}
```

---

### 2. Missing Product Data Enrichment

**Trigger**: `event_type: 'created'` AND `severity: 'critical'` AND missing fields detected

**Agent Task**:
1. Analyze product record for missing data
2. Navigate to source URL
3. Extract missing fields (specs, features, images)
4. Download and optimize images
5. Upload images to R2 bucket
6. **Action**: Enrich product record with complete data

**Confidence Threshold**: 85% - Auto-enrich if data extraction confidence high
**Rollback**: Partial - Can remove added fields, images remain in R2

**Agent Skill**: `product-enricher`

```typescript
{
  workflow: "product-enrichment",
  trigger: {
    entity_type: "product",
    event_type: "created",
    condition: "missing_fields > 3"
  },
  agent: {
    type: "data-enricher",
    skill: "product-enricher",
    tools: ["browser", "exec", "read", "write", "edit", "image"],
    confidence_threshold: 0.85
  },
  actions: {
    auto_approve: ["add_specs", "upload_images", "update_features"],
    require_approval: ["major_field_changes"],
    rollback_enabled: true
  }
}
```

---

### 3. Broken Link Repair

**Trigger**: `event_type: 'updated'` AND `field: 'cta_url'` AND HTTP 404/500 detected

**Agent Task**:
1. Validate all URLs in product/offer record
2. Check HTTP status codes
3. Search OEM site for correct URLs
4. Find replacement pages via sitemap
5. **Action**: Update broken links with working alternatives

**Confidence Threshold**: 90% - Auto-fix if replacement found on same domain
**Rollback**: Yes - Store old URLs for 90 days

**Agent Skill**: `link-validator`

```typescript
{
  workflow: "link-repair",
  trigger: {
    entity_type: ["product", "offer", "banner"],
    condition: "broken_links > 0"
  },
  agent: {
    type: "link-validator",
    skill: "link-validator",
    tools: ["web_fetch", "exec", "read", "edit"],
    confidence_threshold: 0.90
  },
  actions: {
    auto_approve: ["fix_same_domain_links"],
    require_approval: ["external_domain_links", "remove_links"],
    rollback_enabled: true
  }
}
```

---

### 4. Offer Expiry Management

**Trigger**: `event_type: 'updated'` AND `field: 'validity_end'` AND date < today + 7 days

**Agent Task**:
1. Check if offer is still active on OEM site
2. Verify expiry date accuracy
3. Archive offer if expired
4. Remove from homepage if applicable
5. **Action**: Update offer status, notify marketing team

**Confidence Threshold**: 100% - Only auto-archive if date confirmed
**Rollback**: Yes - Can restore archived offers

**Agent Skill**: `offer-manager`

```typescript
{
  workflow: "offer-expiry",
  trigger: {
    entity_type: "offer",
    condition: "validity_end <= now() + interval '7 days'"
  },
  agent: {
    type: "offer-manager",
    skill: "offer-manager",
    tools: ["browser", "read", "edit"],
    confidence_threshold: 1.0
  },
  actions: {
    auto_approve: ["archive_expired", "update_homepage"],
    require_approval: ["delete_offer"],
    rollback_enabled: true
  }
}
```

---

### 5. Image Quality Validation

**Trigger**: `event_type: 'updated'` AND `field: 'primary_image_r2_key'`

**Agent Task**:
1. Download image from R2
2. Check resolution (min 1200x800)
3. Validate aspect ratio
4. Check file size (< 500KB)
5. Run AI image quality analysis
6. **Action**: Re-download from source if quality issues detected

**Confidence Threshold**: 80% - Auto-replace if source has better quality
**Rollback**: Yes - Keep old image in R2 with version suffix

**Agent Skill**: `image-validator`

```typescript
{
  workflow: "image-quality",
  trigger: {
    entity_type: "product",
    event_type: "image_changed"
  },
  agent: {
    type: "image-validator",
    skill: "image-validator",
    tools: ["browser", "exec", "read", "write", "image"],
    confidence_threshold: 0.80
  },
  actions: {
    auto_approve: ["replace_low_quality", "optimize_filesize"],
    require_approval: ["manual_image_selection"],
    rollback_enabled: true
  }
}
```

---

### 6. New Model Page Generation

**Trigger**: `event_type: 'created'` AND `severity: 'critical'` AND `entity_type: 'product'`

**Agent Task**:
1. Detect new vehicle model
2. Extract comprehensive data from OEM site
3. Generate marketing content via AI
4. Create model subpage using design system
5. **Action**: Publish new page to R2, update sitemap

**Confidence Threshold**: 90% - Auto-generate if sufficient data available
**Rollback**: Yes - Can delete generated page

**Agent Skill**: `page-generator` (already exists as Brand Ambassador)

```typescript
{
  workflow: "new-model-page",
  trigger: {
    entity_type: "product",
    event_type: "created",
    condition: "is_new_model = true"
  },
  agent: {
    type: "brand-ambassador",
    skill: "page-generator",
    tools: ["browser", "read", "write", "image"],
    confidence_threshold: 0.90
  },
  actions: {
    auto_approve: ["generate_page", "publish_r2", "update_sitemap"],
    require_approval: ["major_content_changes"],
    rollback_enabled: true
  }
}
```

---

### 7. Disclaimer Text Compliance Check

**Trigger**: `event_type: 'updated'` AND `field: 'disclaimer_text'`

**Agent Task**:
1. Extract disclaimer text
2. Check for required legal terms
3. Compare against compliance templates
4. Validate character limits for display
5. **Action**: Flag non-compliant disclaimers for review

**Confidence Threshold**: 95% - Auto-approve if matches approved patterns
**Rollback**: Yes - Restore previous disclaimer

**Agent Skill**: `compliance-checker`

```typescript
{
  workflow: "disclaimer-compliance",
  trigger: {
    entity_type: ["product", "offer"],
    event_type: "disclaimer_changed"
  },
  agent: {
    type: "compliance-checker",
    skill: "compliance-checker",
    tools: ["read"],
    confidence_threshold: 0.95
  },
  actions: {
    auto_approve: ["approve_compliant"],
    require_approval: ["flag_non_compliant", "notify_legal"],
    rollback_enabled: true
  }
}
```

---

### 8. Variant Data Synchronization

**Trigger**: `event_type: 'updated'` AND `field: 'variants'`

**Agent Task**:
1. Detect variant additions/removals
2. Cross-reference with OEM source
3. Update variant pricing tables
4. Sync variant colors and specs
5. **Action**: Ensure all variants have complete data

**Confidence Threshold**: 85% - Auto-sync if variant IDs match
**Rollback**: Yes - Restore previous variant configuration

**Agent Skill**: `variant-sync`

```typescript
{
  workflow: "variant-sync",
  trigger: {
    entity_type: "product",
    event_type: "updated",
    condition: "variants_changed = true"
  },
  agent: {
    type: "variant-sync",
    skill: "variant-sync",
    tools: ["browser", "read", "edit"],
    confidence_threshold: 0.85
  },
  actions: {
    auto_approve: ["sync_variants", "update_pricing"],
    require_approval: ["remove_variants"],
    rollback_enabled: true
  }
}
```

---

## Agent Confidence Levels

| Level | Threshold | Auto-Execute | Requires Approval | Use Case |
|-------|-----------|--------------|-------------------|----------|
| **Critical** | 100% | ✅ Yes | No | Exact matches, date checks |
| **High** | 95%+ | ✅ Yes | No | Price validation, compliance |
| **Medium** | 85%+ | ✅ Yes | Human review optional | Data enrichment, link fixes |
| **Low** | 70-84% | ❌ No | ✅ Yes | Content generation, major changes |
| **Uncertain** | < 70% | ❌ No | ✅ Yes | Complex decisions, deletions |

## Safety Mechanisms

### 1. Approval Thresholds
- **Auto-execute**: Confidence ≥ 85% AND action in whitelist
- **Require approval**: Confidence < 85% OR destructive action
- **Block**: Confidence < 50% OR blacklisted action

### 2. Rollback Capability
- All agent actions stored in `agent_actions` table
- Previous values preserved for 30-90 days
- One-click rollback via dashboard
- Automated rollback if post-action validation fails

### 3. Rate Limiting
- Max 10 agents per OEM per hour
- Max 100 total agents per day
- Exponential backoff on failures
- Circuit breaker on repeated errors

### 4. Audit Trail
Every agent action logs:
- Change event that triggered workflow
- Agent reasoning and confidence score
- Actions taken and results
- Execution time and costs
- Success/failure status
- Rollback availability

### 5. Kill Switch
- Global on/off toggle in dashboard
- Per-workflow enable/disable
- Emergency stop via API endpoint
- Automatic disable on error rate > 10%

## Monitoring & Alerts

### Agent Performance Metrics
- **Success Rate**: % of actions that achieve desired outcome
- **Confidence Accuracy**: Correlation between confidence and actual success
- **Execution Time**: Average time per workflow
- **Cost per Action**: AI API costs + compute time
- **Human Intervention Rate**: How often approval is needed

### Alert Conditions
- Agent failure rate > 10% (Slack immediate)
- Confidence score declining trend (Daily digest)
- Rollback required > 5 times/day (Slack immediate)
- New workflow type detected (Email notification)
- Cost spike > 50% above baseline (Slack immediate)

## Dashboard Integration

### New Pages

#### `/dashboard/agents` - Agent Activity
- Real-time agent status (running, completed, failed)
- Recent actions table with confidence scores
- Filter by workflow type, OEM, status
- Action details modal with full audit trail

#### `/dashboard/workflows` - Workflow Management
- Enable/disable workflows
- Configure confidence thresholds
- View workflow performance metrics
- Edit workflow rules (admin only)

#### `/dashboard/agent-actions` - Audit Log
- Complete history of all agent actions
- Rollback button for reversible actions
- Approve/reject pending actions
- Filter by date, OEM, entity type, confidence

### Homepage Cards
- **Active Agents**: Count of currently running agents
- **Actions Today**: Number of automated actions taken
- **Pending Approvals**: Actions waiting for human review
- **Success Rate**: % of successful actions (last 7 days)

## Implementation Priority

### Phase 1: Foundation (Week 1-2)
1. ✅ Workflow router and rule engine
2. ✅ Agent spawner via OpenClaw integration
3. ✅ Audit logging table and API
4. ✅ Basic dashboard pages

### Phase 2: Core Workflows (Week 3-4)
1. ✅ Price validation workflow
2. ✅ Broken link repair workflow
3. ✅ Missing data enrichment workflow
4. ✅ Safety mechanisms and rollback system

### Phase 3: Advanced Workflows (Week 5-6)
1. ✅ Offer expiry management
2. ✅ Image quality validation
3. ✅ Disclaimer compliance checking
4. ✅ Variant synchronization

### Phase 4: Optimization (Week 7-8)
1. ✅ Performance monitoring and alerting
2. ✅ ML-based confidence calibration
3. ✅ Cost optimization
4. ✅ Advanced rollback strategies

## Cost Estimation

**Assumptions**:
- 500 change events per day
- 30% trigger workflows (150 actions)
- Average 3 AI API calls per action
- $0.50 per 1M tokens (Claude Sonnet)

**Monthly Costs**:
- AI API: ~$200-400/month
- Compute: ~$50/month (Cloudflare Workers)
- Storage: ~$10/month (R2 for audit logs)
- **Total**: ~$260-460/month

**Cost Savings**:
- Reduced manual review time: ~20 hours/week = $2,000/month
- Faster issue resolution: ~40% reduction in data quality issues
- Improved customer experience: Accurate pricing, complete data

**ROI**: ~4-8x return on investment

## Success Metrics

### Technical
- Agent uptime: > 99%
- Average execution time: < 2 minutes
- Success rate: > 95%
- Rollback rate: < 5%

### Business
- Data accuracy improvement: > 30%
- Manual review reduction: > 60%
- Time to resolution: < 1 hour (down from 24h)
- Customer-facing errors: < 1% of products

## Next Steps

1. **Review & Approve Architecture**: Confirm approach and priorities
2. **Build Foundation**: Implement workflow router and agent spawner
3. **Create Agent Skills**: Build OpenClaw skills for each workflow type
4. **Test with Single Workflow**: Start with price validation only
5. **Monitor & Iterate**: Adjust confidence thresholds based on results
6. **Scale Gradually**: Add workflows one at a time

---

**Ready to build this?** I can start with Phase 1: Foundation and have the basic infrastructure ready for testing.
