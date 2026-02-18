# OEM Agent System Briefing

**Last Updated**: 2026-02-18
**Deployment**: https://oem-agent.adme-dev.workers.dev/
**Status**: ✅ Operational (conversation persistence enabled)

## Executive Summary

Multi-OEM automotive intelligence platform running OpenClaw on Cloudflare Workers with:
- 10 specialized skills for automotive data collection
- R2-backed conversation persistence
- Headless Chrome automation via Cloudflare Browser Rendering
- Supabase for structured data storage
- Scheduled crawls for 30+ automotive manufacturers

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker (Hono)                   │
│  - Manages OpenClaw container lifecycle                     │
│  - Proxies HTTP/WebSocket to gateway                        │
│  - Scheduled cron triggers for automated crawls             │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│          Cloudflare Sandbox Container (Docker)              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  OpenClaw Gateway (Node.js 22, OpenClaw 2026.2.3)    │  │
│  │  - Control UI on port 18789                           │  │
│  │  - WebSocket RPC protocol                             │  │
│  │  - Agent runtime with 10 custom skills                │  │
│  │  - R2 sync every 30s (rclone)                         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
      ┌─────────┐         ┌─────────┐        ┌──────────┐
      │   R2    │         │Supabase │        │ Browser  │
      │ Bucket  │         │Database │        │Rendering │
      └─────────┘         └─────────┘        └──────────┘
```

## Core Components

### 1. OpenClaw Container
- **Image**: cloudflare/sandbox:0.7.0
- **Runtime**: Node.js 22.13.1
- **Package**: openclaw@2026.2.3
- **Config**: /root/.openclaw/openclaw.json
- **Workspace**: /root/clawd/
- **Skills**: /root/clawd/skills/ (10 custom skills)

### 2. R2 Persistence (Fixed 2026-02-18)
**Recent Fix**: Added R2 credentials to container environment variables

```typescript
// src/gateway/env.ts - Now passes these to container:
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME (oem-agent-assets)
CF_ACCOUNT_ID
```

**R2 Structure**:
```
r2://oem-agent-assets/
├── openclaw/          # OpenClaw config (synced every 30s)
├── workspace/         # Conversation history (synced every 30s)
└── skills/            # Custom skills (synced every 30s)
```

**Background Sync**: Runs every 30 seconds via rclone in container startup script

### 3. Supabase Database
- **Tables**: oem_manufacturers, pages, page_snapshots, api_endpoints, crawl_jobs
- **Purpose**: Structured storage for automotive data
- **Access**: Via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

### 4. Cloudflare Browser Rendering
- **CDP WebSocket**: /cdp?secret=$CDP_SECRET
- **Purpose**: Headless Chrome for screenshots, scraping, video capture
- **Binding**: Available to container as BROWSER env binding

## Available Skills (10 Total)

| Skill | Purpose | Key Capability |
|-------|---------|----------------|
| **cloudflare-browser** | Browser automation | CDP control, screenshots, videos, network monitoring |
| **oem-agent-hooks** | Lifecycle hooks | Pre/post crawl actions, data validation |
| **oem-api-discover** | API discovery | Classify network requests, identify data APIs |
| **oem-build-price-discover** | Pricing extraction | Build & Price tools, trim/package pricing |
| **oem-crawl** | Page crawling | Scheduled crawls, change detection, content extraction |
| **oem-design-capture** | Design assets | Screenshots, color palettes, visual themes |
| **oem-extract** | Content parsing | Structured data extraction from HTML |
| **oem-report** | Reporting | Generate crawl reports, analytics dashboards |
| **oem-sales-rep** | Sales intelligence | Dealer locators, inventory availability |
| **oem-semantic-search** | Search & discovery | Vector embeddings, semantic similarity |

## Scheduled Cron Jobs

| Schedule | Frequency | Purpose | Target |
|----------|-----------|---------|--------|
| `0 */2 * * *` | Every 2 hours | Homepage crawl | OEM homepages |
| `0 */4 * * *` | Every 4 hours | Offers crawl | Special promotions |
| `0 */12 * * *` | Every 12 hours | Vehicles crawl | Vehicle inventory |
| `0 6 * * *` | Daily 6am | News crawl | OEM news updates |
| `0 7 * * *` | Daily 7am | Sitemap crawl | Sitemap + design checks |

**Handler**: `src/scheduled.ts` → `OemAgentOrchestrator.runScheduledCrawl()`

## Environment Variables (Container)

### AI Providers
- `ANTHROPIC_API_KEY` - Direct Anthropic access
- `OPENAI_API_KEY` - OpenAI models
- `CLOUDFLARE_AI_GATEWAY_API_KEY` - AI Gateway proxy
- `CF_AI_GATEWAY_ACCOUNT_ID` - Account ID
- `CF_AI_GATEWAY_GATEWAY_ID` - Gateway ID

### R2 Storage (Fixed 2026-02-18)
- `R2_ACCESS_KEY_ID` ✅ Now passed to container
- `R2_SECRET_ACCESS_KEY` ✅ Now passed to container
- `R2_BUCKET_NAME` ✅ Now passed to container
- `CF_ACCOUNT_ID` ✅ Already passed

### Gateway & Channels
- `OPENCLAW_GATEWAY_TOKEN` - Gateway authentication
- `OPENCLAW_DEV_MODE` - Development mode (true)
- `TELEGRAM_BOT_TOKEN` - Telegram channel
- `DISCORD_BOT_TOKEN` - Discord channel
- `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` - Slack channel

### OEM Agent
- `SUPABASE_URL` - Database endpoint
- `SUPABASE_SERVICE_ROLE_KEY` - Database auth
- `GROQ_API_KEY` - Fast inference
- `TOGETHER_API_KEY` - Alternative models

### Browser & Research
- `CDP_SECRET` - Browser Rendering auth
- `BRAVE_API_KEY` - Web search
- `PERPLEXITY_API_KEY` - Research API
- `GOOGLE_API_KEY` - Embeddings

## Recent Fixes (2026-02-18)

### Issue: Conversation Memory Not Persisting
**Root Cause**: Worker wasn't passing R2 credentials to container
- `r2_configured()` check in start-openclaw.sh failed
- No R2 restore on startup
- No background sync loop started

**Fix**: Updated `src/gateway/env.ts` to pass:
```typescript
if (env.R2_ACCESS_KEY_ID) envVars.R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
if (env.R2_SECRET_ACCESS_KEY) envVars.R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;
if (env.R2_BUCKET_NAME) envVars.R2_BUCKET_NAME = env.R2_BUCKET_NAME;
```

**Result**: ✅ Conversations now persist across container restarts

### Previous Fix: Gateway Exit Code 1
**Issue**: Gateway failed to start with browser profile validation error
**Root Cause**: Custom `browser.profiles.cloudflare.color: 'blue'` (expected hex format)
**Fix**: Replaced entire start-openclaw.sh with official cloudflare/moltworker version (rclone-based)

## Documentation Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Development guide for AI agents (architecture, patterns, commands) |
| `CONTRIBUTING.md` | Contribution guidelines |
| `docs/IMPLEMENTATION_SUMMARY.md` | Implementation notes |
| `docs/crawl-config-v1.2.md` | Crawl configuration reference |
| `skills/*/SKILL.md` | Individual skill documentation |
| `README.md` | User-facing setup and usage (if exists) |
| **`BRIEFING.md`** | This file - system overview |

## Key URLs

- **Gateway**: https://oem-agent.adme-dev.workers.dev/
- **Control UI**: https://oem-agent.adme-dev.workers.dev/ (served by OpenClaw)
- **Admin UI**: https://oem-agent.adme-dev.workers.dev/_admin/ (device management)
- **API Endpoints**: /api/* (device pairing, gateway status)
- **Debug Endpoints**: /debug/* (requires DEBUG_ROUTES=true)
- **Browser CDP**: wss://oem-agent.adme-dev.workers.dev/cdp?secret=$CDP_SECRET

## Commands

```bash
# Deployment
npm run build      # Build worker + client
npm run deploy     # Deploy to Cloudflare
wrangler deploy    # Direct deploy

# Development
npm run dev        # Vite dev server (client UI)
npm run start      # wrangler dev (local worker)
npm test           # Run tests (vitest)
npm run typecheck  # TypeScript validation

# Monitoring
wrangler tail      # Live logs
wrangler secret list  # List configured secrets
```

## Testing OpenClaw

1. **Access Control UI**: https://oem-agent.adme-dev.workers.dev/
2. **Start Conversation**: Chat with OpenClaw
3. **Test Persistence**: Refresh page - conversation should be remembered
4. **Test Skills**: Ask OpenClaw to use cloudflare-browser for a screenshot
5. **Test Browser**: Ask to navigate and capture a page

## Next Steps

### For OpenClaw Configuration
- Skills are already loaded (10 skills in /root/clawd/skills/)
- Documentation is in skills/*/SKILL.md
- OpenClaw can read these on startup

### For New Skills
- Add to `skills/` directory
- Include SKILL.md with frontmatter (name, description)
- Add scripts/ subdirectory if needed
- Deploy via wrangler

### For System Context
- OpenClaw doesn't automatically know about THIS troubleshooting session
- Skills provide domain-specific capabilities (browser, crawling, extraction)
- To give OpenClaw broader system context, configure via Control UI settings

## Support & Troubleshooting

- **Logs**: `wrangler tail --format pretty`
- **Secrets**: `wrangler secret list`
- **Debug Routes**: Set `DEBUG_ROUTES=true` → /debug/processes, /debug/env
- **R2 Data**: Stored in bucket `oem-agent-assets` under openclaw/, workspace/, skills/
- **Container Restart**: Cloudflare automatically restarts on crash, restores from R2

---

**Status**: ✅ Production Ready
**Last Deployment**: 2026-02-18 (7d04469e)
**Next Maintenance**: Monitor R2 backup size, optimize scheduled crawls
