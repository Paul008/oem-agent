---
name: oem-agent-hooks
description: OpenClaw integration hooks for automated maintenance, health monitoring, reporting, and vector embedding synchronization.
---

# OEM Agent Hooks

Integration hooks for OpenClaw's cron system providing automated maintenance and monitoring capabilities.

## Actions

### `health_check`

Monitors cache health and triggers repairs when degradation is detected.

**Configuration:**
```json
{
  "action": "health_check",
  "thresholds": {
    "selector_success_rate": 0.7,
    "api_success_rate": 0.8,
    "max_consecutive_failures": 3
  },
  "auto_repair": true,
  "notify_on_degradation": true
}
```

**Output:** Health status for all cached OEMs with recommendations.

### `memory_sync`

Persists in-memory discovery cache to filesystem for cross-session retention.

**Configuration:**
```json
{
  "action": "memory_sync",
  "storage_path": "discoveries/",
  "backup_enabled": true,
  "backup_retention_days": 7
}
```

### `generate_report`

Creates weekly/monthly extraction performance summaries.

**Configuration:**
```json
{
  "action": "generate_report",
  "report_type": "weekly_summary",
  "include_metrics": [
    "total_extractions",
    "success_rate",
    "selector_repairs",
    "api_discoveries",
    "cost_breakdown"
  ],
  "notify_channel": "slack:#oem-reports"
}
```

### `sync_embeddings`

Generates vector embeddings for products, offers, and change events to enable semantic search.

**Configuration:**
```json
{
  "action": "sync_embeddings",
  "tables": ["products", "offers", "change_events"],
  "batch_size": 50,
  "provider": "gemini",
  "model": "text-embedding-004",
  "max_items_per_run": 200
}
```

**Supported Providers:**
| Provider | Model | Dimensions | Cost/1M tokens |
|----------|-------|------------|----------------|
| `gemini` | text-embedding-004 | 768 | ~$0.001 |
| `openai` | text-embedding-3-small | 768 | $0.02 |
| `groq` | nomic-embed-text-v1.5 | 768 | Free tier |

**Output:**
```json
{
  "products": { "processed": 45, "errors": 0 },
  "offers": { "processed": 12, "errors": 0 },
  "change_events": { "processed": 28, "errors": 1 },
  "total_tokens": 15420,
  "estimated_cost_usd": 0.0154
}
```

### `repair_selectors`

Manually triggers self-healing selector repair for degraded OEMs.

**Configuration:**
```json
{
  "action": "repair_selectors",
  "oem_ids": ["kia-au", "hyundai-au"]
}
```

### `cleanup`

Removes stale cache entries and optimizes storage.

## Prerequisites

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key for DB access |
| `GROQ_API_KEY` | Yes | For LLM-based operations |
| `GOOGLE_API_KEY` | For embeddings | Gemini embedding API |
| `OPENAI_API_KEY` | For embeddings | OpenAI embedding API |

## Cron Schedule

These hooks are typically scheduled via OpenClaw cron:

| Job | Schedule | Action |
|-----|----------|--------|
| Cache Health Monitor | Every 4 hours | `health_check` |
| Memory Persistence | Every 30 minutes | `memory_sync` |
| Weekly Report | Monday 9am AEST | `generate_report` |
| Embedding Sync | Every 6 hours | `sync_embeddings` |

## Triggered By

- OpenClaw cron scheduler
- Manual invocation via skill handler
- Webhook triggers (future)

## Output

All actions return a `HookResult`:

```typescript
interface HookResult {
  success: boolean;
  action: string;
  timestamp: string;
  data?: unknown;
  errors?: string[];
}
```
