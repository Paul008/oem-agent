---
name: oem-report
description: Slack alerts and daily digest for OEM changes. Sends immediate alerts for critical/high severity changes and generates daily summaries across all monitored OEMs.
---

# OEM Report

Handles Slack notifications for OEM website changes.

## Alert Types

- **Immediate**: CRITICAL/HIGH severity changes sent instantly
- **Hourly batch**: MEDIUM severity changes grouped and sent hourly
- **Daily digest**: Summary of all changes across 13 OEMs (7am AEDT)

## Prerequisites

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for change events
- `GROQ_API_KEY` for generating summaries
- `SLACK_BOT_TOKEN` for posting messages

## Triggers

- Cron (daily at 7am AEDT for digest)
- `oem-extract` skill (after change events are created)
- Manual trigger

## Slack Message Format

- Rich blocks with OEM branding colours
- Threaded responses for related changes
- Action buttons for "View page", "Compare", "Dismiss"

## Input

```json
{
  "page_type": "daily_digest",
  "trigger": "cron"
}
```

Or for immediate alerts:

```json
{
  "page_type": "change_alert",
  "trigger": "change_event",
  "change_events": [
    {
      "oem_id": "ford",
      "event_type": "offer_updated",
      "severity": "high",
      "details": "Explorer financing changed from 2.9% to 0.9%"
    }
  ]
}
```

## Output

```json
{
  "messages_sent": 3
}
```
