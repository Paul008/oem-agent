# Cron System Documentation

## Overview

The OEM Agent uses **two separate cron systems** working in parallel:

1. **Cloudflare Workers Cron Triggers** - Basic page crawling schedules
2. **OpenClaw Cron System** - Advanced job management with run history

## System 1: Cloudflare Workers Cron

### Configuration
**File**: `wrangler.jsonc`

```json
{
  "triggers": {
    "crons": [
      "0 4 * * *",     // Daily at 4am — Homepage crawl
      "0 5 * * *",     // Daily at 5am — Offers crawl
      "0 */12 * * *",  // Every 12 hours — Vehicles crawl
      "0 6 * * *",     // Daily at 6am — News crawl
      "0 7 * * *"      // Daily at 7am — Sitemap crawl
    ]
  }
}
```

### Handler
**File**: `src/scheduled.ts`

Maps cron expressions to crawl types:
- `0 4 * * *` → Homepage crawl (daily 4am AEST)
- `0 5 * * *` → Offers crawl (daily 5am AEST)
- `0 */12 * * *` → Vehicles crawl (every 12 hours)
- `0 6 * * *` → News crawl (daily 6am AEST)
- `0 7 * * *` → Sitemap crawl (daily 7am AEST)

### Execution Flow
```
1. Cloudflare cron trigger fires
   ↓
2. src/index.ts → scheduled() handler
   ↓
3. handleOemScheduled() in src/scheduled.ts
   ↓
4. Creates OemAgentOrchestrator
   ↓
5. orchestrator.runScheduledCrawl()
   ↓
6. Queries source_pages table for due pages
   ↓
7. Processes each page, updates import_runs
```

### What It Does
- Crawls OEM source pages based on check frequency
- Updates products, offers, prices in database
- Auto-syncs `variant_colors` for all OEMs during every product upsert (`orchestrator.syncVariantColors()`)
- Auto-builds `specs_json` on every product upsert (`orchestrator.buildSpecsJson()`), consolidating `meta_json` + individual spec columns
- Populates individual spec columns (`engine_size`, `cylinders`, `transmission`, `drive`, `drivetrain`) from `meta_json`
- Tracks changes in import_runs table
- Sends Slack notifications on changes

## System 2: OpenClaw Cron

### Configuration
**File**: `config/openclaw/cron-jobs.json`

```json
{
  "jobs": [
    {
      "id": "oem-extract-daily",
      "schedule": "0 6 * * *",
      "skill": "oem-extract",
      "enabled": true
    },
    {
      "id": "oem-brand-ambassador",
      "schedule": "0 4 * * 2",
      "skill": "oem-brand-ambassador",
      "enabled": true
    }
    // ... 7 more jobs
  ]
}
```

### Handler
**File**: `src/routes/cron.ts`

Provides:
- Job status dashboard at `/cron`
- Manual trigger at `POST /cron/run/:jobId`
- Run history at `/cron/runs/:jobId`

### Job Skills

#### 1. `oem-extract`
**Purpose**: Extract prices and offers from all configured OEMs
**Schedule**: Daily at 6am (`0 6 * * *`)
**OEMs**: kia-au, hyundai-au, mazda-au, toyota-au, nissan-au, gwm-au

#### 2. `oem-build-price-discover`
**Purpose**: Re-run discovery for OEMs with degraded cache health
**Schedule**: Sunday at 2am (`0 2 * * 0`)

#### 3. `oem-agent-hooks`
**Purpose**: Health check, memory sync, reports, embeddings
**Schedule**: Various (every 30 min, every 4 hours, weekly)
**Actions**:
- `health_check` — Queries import_runs per OEM, flags degraded (<70% success) and missed (0 runs/24h), sends Slack alert
- `memory_sync` — Backs up OEM configs + discovered APIs to R2, auto-cleans >7 day old backups
- `generate_report` — 7-day crawl metrics (runs, success rate, changes detected), current platform totals, Slack digest
- `sync_embeddings` — Checks for unpriced products

#### 4. `oem-data-sync`
**Purpose**: Color + pricing sync for all 18 OEMs
**Schedule**: Daily 3am (`0 3 * * *`) + Monthly 1st 3am
**Syncs**: Kia BYO (8-state driveaway), Hyundai CGI, Mazda /cars/, Mitsubishi GraphQL, VW OneHub + 13 OEMs generic pricing + auto-fix offer images

#### 5. `oem-brand-ambassador`
**Purpose**: Generate AI-powered dealer model pages
**Schedule**: Tuesday at 4am (`0 4 * * 2`)
**Note**: Respects `manually_edited` flag — pages edited in page builder are not overwritten

#### 6. `oem-orchestrator` (Traffic Controller)
**Purpose**: Central orchestrator — monitors all 18 OEMs, retries failed extractions with exponential backoff, escalates to Slack
**Schedule**: Every 2 hours (`0 */2 * * *`)
**API**: `GET /admin/system-status` for on-demand health check
**State**: Retry state persisted in R2 (`memory/controller/retry-state.json`)
**Pilot OEMs**: gwm-au, kia-au, hyundai-au
**See**: `docs/BRAND_AMBASSADOR.md`

### Execution Flow
```
1. User navigates to /cron OR cron timer fires
   ↓
2. src/routes/cron.ts → cron router
   ↓
3. Job lookup in cron-jobs.json
   ↓
4. executeJob() dispatcher
   ↓
5. Skill-specific handler (e.g., executeBrandAmbassador)
   ↓
6. Save run history to R2
   ↓
7. Return results
```

## Key Differences

| Feature | Cloudflare Cron | OpenClaw Cron |
|---------|----------------|---------------|
| **Config Location** | wrangler.jsonc | cron-jobs.json |
| **Handler** | src/scheduled.ts | src/routes/cron.ts |
| **Run History** | import_runs table | R2 (openclaw/cron-runs/) |
| **Manual Trigger** | No | Yes (POST /cron/run/:jobId) |
| **Dashboard** | No | Yes (/cron) |
| **Job Types** | Page crawling only | Multiple skills |
| **Retry Logic** | No | Yes (configurable) |
| **Notification** | Slack (on change) | Configurable per job |

## Monitoring

### Cloudflare Cron
**Check logs**:
```bash
wrangler tail --format pretty
```

**Check database**:
```sql
SELECT * FROM import_runs
WHERE oem_id = 'kia-au'
ORDER BY started_at DESC
LIMIT 10;
```

### OpenClaw Cron
**Dashboard**: Navigate to `/cron` in browser

**API Check**:
```bash
curl https://oem-agent.workers.dev/cron
```

**Run History**:
```bash
curl https://oem-agent.workers.dev/cron/runs/oem-brand-ambassador
```

## Manual Triggers

### Cloudflare Cron
Cannot be manually triggered - runs on schedule only.

Workaround: Use orchestrator directly via API:
```bash
curl -X POST https://oem-agent.workers.dev/api/crawl/kia-au
```

### OpenClaw Cron
```bash
curl -X POST https://oem-agent.workers.dev/cron/run/oem-brand-ambassador
```

## Adding New Jobs

### Cloudflare Cron
1. Add cron expression to `wrangler.jsonc`
2. Add case in `src/scheduled.ts` → `handleScheduled()`
3. Deploy: `wrangler deploy`

### OpenClaw Cron
1. Add job definition to `config/openclaw/cron-jobs.json`
2. Add skill handler in `src/routes/cron.ts` → `executeJob()`
3. Deploy: `wrangler deploy`

## Troubleshooting

### Jobs Not Running
1. Check `wrangler.jsonc` triggers array
2. Verify job `enabled: true` in cron-jobs.json
3. Check Cloudflare dashboard → Workers → Triggers
4. Review logs: `wrangler tail`

### Import Runs Showing Zero Counts
**Fixed**: Orchestrator now tracks products_upserted, offers_upserted, changes_found counters.
**Solution**: Counters are now properly updated in orchestrator.ts

### Stuck Import Runs
**Symptom**: Status shows "running" for >1 hour
**Fix**:
```sql
UPDATE import_runs
SET status = 'failed',
    finished_at = NOW(),
    error_message = 'Timeout - manually marked failed'
WHERE status = 'running'
AND started_at < NOW() - INTERVAL '1 hour';
```

### Brand Ambassador Not Generating Pages
1. Check if cron is actually running: `/cron`
2. Verify pilot OEMs have vehicle_models in database
3. Check regeneration strategy settings
4. Review run history: `/cron/runs/oem-brand-ambassador`
5. See `docs/BRAND_AMBASSADOR.md` for detailed troubleshooting

## Best Practices

1. **Use OpenClaw Cron for new features** - Better monitoring, run history, manual triggers
2. **Keep Cloudflare Cron simple** - Basic page crawling only
3. **Monitor run history** - Check `/cron` dashboard regularly
4. **Set appropriate thresholds** - Adjust regeneration_strategy for cost optimization
5. **Use Slack notifications** - Configure webhooks for critical jobs
6. **Test manually first** - Use `POST /cron/run/:jobId` before enabling scheduled runs

## Code References

- **Cloudflare Cron**: `src/index.ts`, `src/scheduled.ts`
- **OpenClaw Cron**: `src/routes/cron.ts`
- **Configuration**: `wrangler.jsonc`, `config/openclaw/cron-jobs.json`
- **Orchestrator**: `src/orchestrator.ts`
- **Import Runs**: Supabase `import_runs` table
