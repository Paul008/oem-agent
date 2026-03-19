---
name: oem-orchestrator
description: Traffic Controller — central orchestrator that monitors, retries, and escalates across all 18 OEMs autonomously
---

# OEM Orchestrator (Traffic Controller)

Central intelligence skill that provides autonomous oversight of all 18 OEMs. Runs every 2 hours via OpenClaw cron, with on-demand access via admin API.

## Capabilities

### 1. Health Monitoring
- Queries `import_runs` from the last 24 hours per OEM
- Classifies each OEM: **healthy** (>70% success), **degraded** (30-70%), **failing** (<30%), **stale** (0 runs/36h)
- Tracks per-OEM metrics: success rate, run count, last success time, last error

### 2. Auto-Retry with Exponential Backoff
- Automatically re-triggers crawls for **failing** and **stale** OEMs
- Exponential backoff: 30min → 60min → 2h → 4h → 8h → 12h max
- Maximum 5 consecutive retries before escalation
- Retry state persisted in R2 (`memory/controller/retry-state.json`)

### 3. Slack Escalation
- Sends alerts when OEMs are degraded, failing, or stale
- Per-OEM status with emoji indicators (🔴 failing, 🟡 degraded, ⚪ stale)
- Escalation alert when max retries exceeded (human intervention needed)
- Retry count + last error included in alerts

### 4. System Status API
- `GET /api/v1/oem-agent/admin/system-status` — on-demand health check
- Returns full per-OEM breakdown: status, success rate, runs, products, offers, retry count
- Used by dashboard and support staff

## Configuration

```json
{
  "id": "oem-orchestrator",
  "schedule": "0 */2 * * *",
  "skill": "oem-orchestrator",
  "config": {
    "max_consecutive_failures": 5,
    "base_backoff_minutes": 30,
    "max_backoff_minutes": 720,
    "success_rate_threshold": 0.7,
    "stale_hours_threshold": 36,
    "notify_on_degradation": true
  }
}
```

## Implementation

- **Controller**: `src/sync/orchestrator-controller.ts`
- **Cron handler**: `src/routes/cron.ts` → `case 'oem-orchestrator'`
- **Admin API**: `src/routes/oem-agent.ts` → `GET /admin/system-status`
- **R2 state**: `memory/controller/retry-state.json`

## Companion Skills

| Skill | Schedule | Relationship |
|-------|----------|-------------|
| `oem-agent-hooks` (health_check) | Every 4h | Detailed per-OEM import_run analysis, Slack alerts |
| `oem-agent-hooks` (memory_sync) | Every 30min | R2 backup of OEM configs + discovered APIs |
| `oem-agent-hooks` (generate_report) | Monday 9am | Weekly metrics digest to Slack |
| `oem-data-sync` | Daily 3am | Color + pricing sync (Kia, Hyundai, Mazda, Mitsubishi, VW + generic) |
| `oem-extract` | Daily 6am | Page crawling across all 18 OEMs |
| `oem-brand-ambassador` | Tuesday 4am | AI page generation (respects manual edits) |

## Status Classification

| Status | Criteria | Action |
|--------|----------|--------|
| ✅ Healthy | >70% success rate, runs in last 36h | None |
| 🟡 Degraded | 30-70% success rate | Monitor, Slack alert |
| 🔴 Failing | <30% success rate | Auto-retry with backoff, Slack alert |
| ⚪ Stale | 0 runs in 36h | Auto-retry, investigate if persists |
| 🚨 Escalated | 5+ consecutive failures | Slack escalation, human intervention needed |
