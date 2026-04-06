# Heartbeat

When the heartbeat fires, check these silently and only alert if something is wrong:

1. **Crawl health** — Call `GET /api/v1/admin/crawl-status` and flag any OEM with errors > 3 or last_success older than 48 hours
2. **Stale data** — Check if any OEM's offers or banners haven't been updated in 7+ days
3. **Agent stuck** — Check `agent_actions` for any actions with status `running` older than 1 hour

If everything is fine, say nothing. Only report problems.
