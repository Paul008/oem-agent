# Tools — Local Environment

## Infrastructure

- **Worker**: https://oem-agent.adme-dev.workers.dev
- **Dashboard**: https://oem-agent.pages.dev
- **Supabase**: https://nnihmdmsglkxpmilmjjc.supabase.co
- **Browser CDP**: `wss://oem-agent.adme-dev.workers.dev/cdp?secret=$CDP_SECRET`

## API Shortcuts

- **Status**: `GET /api/status` — gateway health
- **Crawl status**: `GET /api/v1/admin/crawl-status` — per-OEM crawl health
- **Force crawl**: `POST /api/v1/admin/force-crawl/:oemId` — trigger immediate crawl
- **Debug processes**: `GET /debug/processes` — container process list
- **Debug version**: `GET /debug/version` — OpenClaw + Node versions
- **Destroy container**: `POST /debug/destroy-container` — force image refresh

## Dealer API (public, no auth)

- `GET /api/wp/v2/catalog?oem_id={id}` — full catalog
- `GET /api/wp/v2/models?oem_id={id}` — model list
- `GET /api/wp/v2/variants?filter[variant_category]={slug}&oem_id={id}` — variants

OEM IDs accept both short (`kia`) and full (`kia-au`) formats.

## Browser Rendering Tier

1. Lightpanda (`env.LIGHTPANDA_URL`) — fast, 15s timeout, raw CDP WebSocket
2. Cloudflare Browser (`env.BROWSER`) — Smart Mode with network interception (fallback)
3. Basic fetch — for SSR pages (17/19 OEMs skip browser)
