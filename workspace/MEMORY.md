# System Architecture & Technical Context

## Platform Stack

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

### OpenClaw Container
- **Image**: cloudflare/sandbox:0.7.0
- **Runtime**: Node.js 22.13.1
- **Package**: openclaw@2026.2.3
- **Config**: /root/.openclaw/openclaw.json
- **Workspace**: /root/clawd/

### R2 Persistence Structure
```
r2://oem-agent-assets/
├── openclaw/          # OpenClaw config (synced every 30s)
├── workspace/         # Conversation history (synced every 30s)
└── skills/            # Custom skills (synced every 30s)
```

### Supabase Database
- **Tables**: oem_manufacturers, pages, page_snapshots, api_endpoints, crawl_jobs
- **Purpose**: Structured storage for automotive data
- **Access**: Via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

### Cloudflare Browser Rendering
- **CDP WebSocket**: /cdp?secret=$CDP_SECRET
- **Purpose**: Headless Chrome for screenshots, scraping, video capture

## Recent Fixes (2026-02-18)

### ✅ R2 Persistence Fixed
- **Issue**: Conversations not persisting across restarts
- **Cause**: Worker wasn't passing R2 credentials to container
- **Fix**: Updated src/gateway/env.ts to pass R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
- **Result**: Conversations now persist successfully

### ✅ Gateway Startup Fixed
- **Issue**: Exit code 1, wouldn't start
- **Cause**: Attempted to use unsupported `systemPrompt` config key
- **Fix**: Reverted to official cloudflare/moltworker baseline
- **Result**: Gateway starts reliably

### ✅ Skills Loading Fixed
- **Issue**: Only 3 default skills visible instead of 10 custom ones
- **Cause**: OpenClaw looks in /root/.openclaw/workspace/skills/ but files were in /root/clawd/skills/
- **Fix**: Added symlink creation in startup script
- **Result**: All 10 custom skills now available

## Key URLs

- **Gateway**: https://oem-agent.adme-dev.workers.dev/
- **Control UI**: https://oem-agent.adme-dev.workers.dev/
- **Browser CDP**: wss://oem-agent.adme-dev.workers.dev/cdp?secret=$CDP_SECRET

## Available Environment Variables

### AI Providers
- ANTHROPIC_API_KEY, OPENAI_API_KEY, CLOUDFLARE_AI_GATEWAY_API_KEY

### R2 Storage
- R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME

### OEM Agent Resources
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- CDP_SECRET (Browser Rendering)
- BRAVE_API_KEY, PERPLEXITY_API_KEY, GOOGLE_API_KEY

**Status**: ✅ All systems operational
**Last Updated**: 2026-02-19
