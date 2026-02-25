# Container & Deployment Guide

> **TL;DR**: The OEM Agent runs OpenClaw inside a Cloudflare Container (Sandbox). A Hono Worker proxies HTTP/WebSocket traffic to the container on port 18789, injecting gateway auth tokens automatically. All secrets are set via `wrangler secret put` and mapped to container env vars through `buildEnvVars()`.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Internet                                                                │
│                                                                         │
│   User ──► Cloudflare Access ──► Worker (Hono)                         │
│                                     │                                   │
│                    ┌────────────────┼────────────────┐                  │
│                    │  Sandbox DO    │                │                  │
│                    │                ▼                │                  │
│                    │  ┌──────────────────────────┐   │                  │
│                    │  │  Container               │   │                  │
│                    │  │                          │   │                  │
│                    │  │  start-openclaw.sh        │   │                  │
│                    │  │    ├─ rclone restore      │   │                  │
│                    │  │    ├─ openclaw onboard    │   │                  │
│                    │  │    ├─ config patching     │   │                  │
│                    │  │    ├─ workspace setup     │   │                  │
│                    │  │    └─ openclaw gateway    │   │                  │
│                    │  │         :18789            │   │                  │
│                    │  └──────────────────────────┘   │                  │
│                    │                                 │                  │
│                    │  containerFetch() / wsConnect()  │                  │
│                    └─────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Roles

| Component | Role |
|-----------|------|
| **Worker (Hono)** | Routes HTTP/WS requests, injects gateway token, serves loading page during cold start, handles cron triggers, mounts API routes |
| **Sandbox DO** | Durable Object that manages the container lifecycle. One DO instance = one container |
| **Container** | Runs the OpenClaw gateway process. Based on `cloudflare/sandbox:0.7.0` with Node.js 22 |
| **Gateway** | The OpenClaw process inside the container. Listens on port 18789, serves web UI + WebSocket chat |

### Networking

- Worker communicates with the container via `sandbox.containerFetch()` (HTTP) and `sandbox.wsConnect()` (WebSocket)
- Both target port **18789** inside the container (`MOLTBOT_PORT` in `src/config.ts`)
- The gateway binds to `lan` (0.0.0.0) with trusted proxy `10.1.0.0` for sandbox networking
- Startup timeout: **180 seconds** (`STARTUP_TIMEOUT_MS` in `src/config.ts`)

## Container Image (Dockerfile)

```dockerfile
FROM docker.io/cloudflare/sandbox:0.7.0

# Node.js 22 (replaces base image's Node 20)
ENV NODE_VERSION=22.13.1

# Install: Node.js 22, pnpm, rclone (R2 sync), OpenClaw
RUN npm install -g pnpm
RUN npm install -g openclaw@2026.2.22-2

# Copy startup script, skills, workspaces, docs
COPY start-openclaw.sh /usr/local/bin/start-openclaw.sh
COPY skills/ /root/clawd/skills/
COPY workspace/ /root/clawd/workspace/
COPY workspace-crawler/ /root/clawd/workspace-crawler/
COPY workspace-extractor/ /root/clawd/workspace-extractor/
COPY workspace-designer/ /root/clawd/workspace-designer/
COPY workspace-reporter/ /root/clawd/workspace-reporter/
COPY docs/ /root/clawd/docs/

WORKDIR /root/clawd
EXPOSE 18789
```

### Cache Busting

Docker layer caching means changes to `start-openclaw.sh` may not be picked up if earlier layers are unchanged. Use the comment-based cache bust:

```dockerfile
# Build cache bust: 2026-02-25-allowed-origins-fix
COPY start-openclaw.sh /usr/local/bin/start-openclaw.sh
```

Update the date/description in the comment to force a rebuild of that layer.

## Startup Sequence

The container runs `start-openclaw.sh` which executes these steps in order:

### 1. Guard: Prevent Duplicate Starts
If `openclaw gateway` is already running, the script exits immediately.

### 2. R2 Restore (if configured)
Restores persisted state from R2 via rclone:
- **Config**: `r2:{bucket}/openclaw/` → `/root/.openclaw/`
- **Workspace**: `r2:{bucket}/workspace/` → `/root/clawd/`
- **Skills**: `r2:{bucket}/skills/` → `/root/clawd/skills/`
- Handles legacy `clawdbot` → `openclaw` migration automatically

### 3. Onboard (first boot only)
If no `openclaw.json` exists, runs:
```bash
openclaw onboard --non-interactive --accept-risk \
    --mode local \
    --auth-choice apiKey --anthropic-api-key $ANTHROPIC_API_KEY \
    --gateway-port 18789 \
    --gateway-bind lan \
    --skip-channels --skip-skills --skip-health
```
Auth provider is auto-detected: Cloudflare AI Gateway → Anthropic → OpenAI.

### 4. Config Patching (Node.js)
A heredoc Node.js script patches `openclaw.json` with settings that `onboard` doesn't cover:
- **Gateway**: port 18789, bind lan, trusted proxy `10.1.0.0`
- **Token auth**: `OPENCLAW_GATEWAY_TOKEN` → `config.gateway.auth.token`
- **Control UI**: `allowInsecureAuth`, `dangerouslyDisableDeviceAuth`, `allowedOrigins`
- **Multi-agent**: 5 agents (main, crawler, extractor, designer, reporter)
- **AI Gateway model override**: `CF_AI_GATEWAY_MODEL` → custom provider entry
- **Channels**: Telegram, Discord, Slack (from env vars)

### 5. Background R2 Sync
Starts a background loop (30s intervals) that uploads changed files to R2:
- Excludes: `node_modules/`, `.git/`, `*.lock`, `*.log`, `*.tmp`
- Tracks changes via file modification timestamps

### 6. Workspace Setup
Creates 5 agent workspaces with selective skill symlinks:

| Agent | Skills |
|-------|--------|
| **main** | All skills (full symlink to skills dir) |
| **crawler** | oem-crawl, oem-api-discover, oem-build-price-discover, cloudflare-browser, oem-agent-hooks |
| **extractor** | oem-extract, oem-data-sync, oem-semantic-search, oem-agent-hooks |
| **designer** | oem-design-capture, oem-ux-knowledge, oem-brand-ambassador, cloudflare-browser, oem-agent-hooks |
| **reporter** | oem-report, oem-sales-rep, oem-agent-hooks |

### 7. Start Gateway
```bash
# With token auth (recommended):
exec openclaw gateway --port 18789 --verbose --allow-unconfigured --bind lan --token "$OPENCLAW_GATEWAY_TOKEN"

# Without token (device pairing mode):
exec openclaw gateway --port 18789 --verbose --allow-unconfigured --bind lan
```

## Environment Variables Reference

All secrets are set on the Worker via `wrangler secret put <NAME>`. The Worker's `buildEnvVars()` function (`src/gateway/env.ts`) maps them to container environment variables.

### AI Providers

| Worker Variable | Container Variable | Required | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | One of these | Direct Anthropic key |
| `OPENAI_API_KEY` | `OPENAI_API_KEY` | required | Direct OpenAI key |
| `CLOUDFLARE_AI_GATEWAY_API_KEY` | `CLOUDFLARE_AI_GATEWAY_API_KEY` | | CF AI Gateway key |
| `CF_AI_GATEWAY_ACCOUNT_ID` | `CF_AI_GATEWAY_ACCOUNT_ID` | | CF AI Gateway account |
| `CF_AI_GATEWAY_GATEWAY_ID` | `CF_AI_GATEWAY_GATEWAY_ID` | | CF AI Gateway ID |
| `CF_AI_GATEWAY_MODEL` | `CF_AI_GATEWAY_MODEL` | Optional | Model override (e.g. `anthropic/claude-sonnet-4-5`) |
| `AI_GATEWAY_BASE_URL` | `ANTHROPIC_BASE_URL` | Optional | Legacy AI Gateway base URL |
| `AI_GATEWAY_API_KEY` | `ANTHROPIC_API_KEY` | Optional | Legacy AI Gateway key (overrides direct key) |

### Gateway Auth

| Worker Variable | Container Variable | Required | Description |
|---|---|---|---|
| `MOLTBOT_GATEWAY_TOKEN` | `OPENCLAW_GATEWAY_TOKEN` | **Yes** | Gateway auth token. Worker injects this into HTTP and WS requests automatically |
| `DEV_MODE` / `OPENCLAW_DEV_MODE` | `OPENCLAW_DEV_MODE` | Optional | Enables `allowInsecureAuth` + `dangerouslyDisableDeviceAuth` on control UI |
| `WORKER_URL` | `WORKER_URL` | Optional | Worker origin for `allowedOrigins` (defaults to `https://oem-agent.adme-dev.workers.dev`) |

### Cloudflare Access

| Worker Variable | Container Variable | Required | Description |
|---|---|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | — | Yes (prod) | CF Access team domain for JWT verification |
| `CF_ACCESS_AUD` | — | Yes (prod) | CF Access Application Audience tag |

These are Worker-only — not passed to the container. Skipped in dev mode.

### Channels

| Worker Variable | Container Variable | Required | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `TELEGRAM_BOT_TOKEN` | Optional | Telegram bot token |
| `TELEGRAM_DM_POLICY` | `TELEGRAM_DM_POLICY` | Optional | `pairing` (default) or `open` |
| `DISCORD_BOT_TOKEN` | `DISCORD_BOT_TOKEN` | Optional | Discord bot token |
| `DISCORD_DM_POLICY` | `DISCORD_DM_POLICY` | Optional | `pairing` (default) or `open` |
| `SLACK_BOT_TOKEN` | `SLACK_BOT_TOKEN` | Optional | Slack bot token |
| `SLACK_APP_TOKEN` | `SLACK_APP_TOKEN` | Optional | Slack app-level token |

### R2 / Storage

| Worker Variable | Container Variable | Required | Description |
|---|---|---|---|
| `R2_ACCESS_KEY_ID` | `R2_ACCESS_KEY_ID` | Optional | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | `R2_SECRET_ACCESS_KEY` | Optional | R2 API token secret key |
| `R2_BUCKET_NAME` | `R2_BUCKET_NAME` | Optional | Bucket name (default: `moltbot-data`) |
| `CF_ACCOUNT_ID` | `CF_ACCOUNT_ID` | Yes | Cloudflare account ID (set as plain var in `wrangler.jsonc`) |

### OEM Agent

| Worker Variable | Container Variable | Required | Description |
|---|---|---|---|
| `SUPABASE_URL` | `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `GROQ_API_KEY` | `GROQ_API_KEY` | Optional | Groq API key for fast inference |
| `TOGETHER_API_KEY` | `TOGETHER_API_KEY` | Optional | Together AI key |
| `SLACK_WEBHOOK_URL` | `SLACK_WEBHOOK_URL` | Optional | Slack notification webhook |

### Research APIs

| Worker Variable | Container Variable | Required | Description |
|---|---|---|---|
| `BRAVE_API_KEY` | `BRAVE_API_KEY` | Optional | Brave Search API key |
| `PERPLEXITY_API_KEY` | `PERPLEXITY_API_KEY` | Optional | Perplexity API key |
| `GOOGLE_API_KEY` | `GOOGLE_API_KEY` | Optional | Google API key (embeddings) |

### Additional AI Providers

| Worker Variable | Container Variable | Required | Description |
|---|---|---|---|
| `KIMI_API_KEY` | `KIMI_API_KEY` | Optional | Kimi/Moonshot API key |

## Gateway Authentication

### Token Auth (Recommended)

The recommended approach: set `MOLTBOT_GATEWAY_TOKEN` as a Worker secret.

**How it works**:
1. Worker secret `MOLTBOT_GATEWAY_TOKEN` is mapped to `OPENCLAW_GATEWAY_TOKEN` in the container
2. `start-openclaw.sh` patches `config.gateway.auth.token` and starts the gateway with `--token`
3. The Worker proxy (`src/index.ts`) automatically injects the token into both HTTP and WebSocket requests via query param `?token=`
4. Users never need to know the token — they authenticate through Cloudflare Access

**Why the Worker injects the token**: Cloudflare Access redirects strip query parameters. So even if a user navigates with `?token=xxx`, the token is lost after the Access auth redirect. The Worker re-injects it server-side since the user has already passed CF Access authentication.

### Control UI Configuration

When `OPENCLAW_DEV_MODE=true`, the config patching enables:

```json
{
  "gateway": {
    "controlUi": {
      "allowInsecureAuth": true,
      "dangerouslyDisableDeviceAuth": true,
      "allowedOrigins": ["https://oem-agent.adme-dev.workers.dev"]
    }
  }
}
```

- **`allowInsecureAuth`**: Allows non-HTTPS connections (needed for container-internal networking)
- **`dangerouslyDisableDeviceAuth`**: Skips device pairing — redundant because the Worker is already protected by Cloudflare Access
- **`allowedOrigins`**: Required for non-loopback Control UI access. Must match the Worker URL

## Container Instance Management

### Configuration in `wrangler.jsonc`

```jsonc
"containers": [
  {
    "class_name": "Sandbox",
    "image": "./Dockerfile",
    "instance_type": "standard-1",
    "max_instances": 10
  }
]
```

### Key Concepts

- **`max_instances`**: Maximum number of container instances that can run simultaneously
- Each Durable Object stub (`getSandbox(env.Sandbox, 'moltbot', options)`) maps to one container
- With `keepAlive: true` (default when `SANDBOX_SLEEP_AFTER=never`), containers persist across requests

### Image Rollout Behavior

When you deploy a new image:
- **New containers** use the new image
- **Existing containers** with `keepAlive: true` continue running the old image until they're restarted
- Use `POST /debug/restart-gateway` to force a container to restart with the new image

### Sleep Configuration

The `SANDBOX_SLEEP_AFTER` env var controls container lifecycle:
- `never` (default): Container stays alive indefinitely. Best for low-latency but costs more
- Duration string (e.g., `10m`, `1h`): Container sleeps after inactivity period. Reduces cost but adds cold start latency

## Persistence & R2 Storage

### What's Persisted

| Path | R2 Key Prefix | Contents |
|------|---------------|----------|
| `/root/.openclaw/` | `openclaw/` | Config (`openclaw.json`), conversation history |
| `/root/clawd/` | `workspace/` | Workspace files, agent memory |
| `/root/clawd/skills/` | `skills/` | Custom skills |

### What's Excluded

- `node_modules/`, `.git/` — not synced
- `*.lock`, `*.log`, `*.tmp` — excluded from upload

### Rclone Configuration

Rclone is configured automatically when `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `CF_ACCOUNT_ID` are all set:

```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = <R2_ACCESS_KEY_ID>
secret_access_key = <R2_SECRET_ACCESS_KEY>
endpoint = https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com
```

### Sync Behavior

- **Restore on boot**: Full copy from R2 to local filesystem
- **Background sync**: Every 30 seconds, changed files are uploaded to R2
- Change detection uses `find -newer` against a marker file
- Sync runs with `--transfers=16 --fast-list` for performance

## Debug Endpoints Reference

All debug routes require `DEBUG_ROUTES=true` and Cloudflare Access authentication.

| Endpoint | Method | Description | Example |
|----------|--------|-------------|---------|
| `/debug/version` | GET | OpenClaw and Node.js versions | `curl /debug/version` |
| `/debug/processes` | GET | List all container processes. Add `?logs=true` for stdout/stderr | `curl /debug/processes?logs=true` |
| `/debug/restart-gateway` | POST | Kill gateway process (next request starts fresh) | `curl -X POST /debug/restart-gateway` |
| `/debug/gateway-api` | GET | Probe gateway HTTP API. Use `?path=/route` | `curl /debug/gateway-api?path=/` |
| `/debug/cli` | GET | Run CLI commands in container. Use `?cmd=<command>` | `curl /debug/cli?cmd=openclaw%20--version` |
| `/debug/logs` | GET | Gateway process logs. Use `?id=<pid>` for specific process | `curl /debug/logs` |
| `/debug/ws-test` | GET | Interactive WebSocket debug page (HTML) | Open in browser |
| `/debug/env` | GET | Sanitized env var presence check (boolean flags, no values) | `curl /debug/env` |
| `/debug/container-config` | GET | Read `openclaw.json` from inside the container | `curl /debug/container-config` |

### Enabling Debug Routes

Set as a plain var or secret:
```bash
npx wrangler secret put DEBUG_ROUTES
# Enter: true
```

## Troubleshooting Guide

### Loading screen stuck / Container not booting

**Symptoms**: Browser shows loading spinner indefinitely.

**Diagnosis**:
1. Check `wrangler containers list` — is the container platform healthy?
2. Check `max_instances` — may be exceeded
3. Check Docker is running locally (for `wrangler dev`)

**Fix**:
- If `max_instances` exceeded, bump it in `wrangler.jsonc`
- For local dev, ensure Docker Desktop is running
- Check `wrangler tail` for error logs

### "Pairing required" error

**Symptoms**: WebSocket or UI shows "pairing required" message.

**Diagnosis**: The gateway is not receiving the auth token.

**Fix**:
1. Verify `MOLTBOT_GATEWAY_TOKEN` is set: `npx wrangler secret list`
2. Check `/debug/env` — `has_gateway_token` should be `true`
3. Check `/debug/container-config` — verify `gateway.auth.token` is populated
4. If config looks wrong, restart: `POST /debug/restart-gateway`

### "Max instances exceeded"

**Symptoms**: 503 errors, container fails to start.

**Fix**: Increase `max_instances` in `wrangler.jsonc` and redeploy:
```jsonc
"containers": [{
  "max_instances": 15  // was 10
}]
```

### Gateway crash on startup

**Symptoms**: `/debug/logs` shows OpenClaw config validation errors.

**Diagnosis**: Usually a bad key in `openclaw.json` from config patching.

**Fix**:
1. Check `/debug/logs` for the specific validation error
2. Review `start-openclaw.sh` config patching section for the offending key
3. After fixing, deploy and restart: `POST /debug/restart-gateway`

### Requests timing out (503)

**Symptoms**: Requests return 503 after ~180s.

**Diagnosis**: The container is likely transitioning (starting/stopping) or the gateway process failed to bind to port 18789.

**Fix**:
1. Check `/debug/processes?logs=true` for process state
2. Check `wrangler containers list` for container health
3. If stuck, restart: `POST /debug/restart-gateway`
4. Wait up to 3 minutes for cold start to complete

### Stale gateway process after deploy

**Symptoms**: New env vars or config changes not taking effect.

**Diagnosis**: The existing container is still running the old gateway process with old env vars. `keepAlive: true` preserves containers across deploys.

**Fix**:
```bash
curl -X POST https://oem-agent.adme-dev.workers.dev/debug/restart-gateway
```
The next request will start a fresh gateway with current env vars and the latest image.

### WebSocket connection failing

**Symptoms**: Chat doesn't connect, WebSocket errors in console.

**Diagnosis**:
1. Open `/debug/ws-test` to test WebSocket connectivity interactively
2. Check `/debug/env` for `has_gateway_token`
3. Check `/debug/processes` to confirm gateway is running

**Fix**:
- If gateway isn't running, any HTTP request will trigger a cold start
- If token is missing, set it: `npx wrangler secret put MOLTBOT_GATEWAY_TOKEN`

## Deployment Checklist

### First-Time Setup

1. **Prerequisites**:
   ```bash
   # Ensure Docker is running (for local testing)
   docker info

   # Ensure wrangler is up to date
   npx wrangler --version
   ```

2. **Set required secrets**:
   ```bash
   # Gateway auth (required)
   npx wrangler secret put MOLTBOT_GATEWAY_TOKEN

   # AI provider (at least one required)
   npx wrangler secret put ANTHROPIC_API_KEY

   # Cloudflare Access (required for production)
   npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
   npx wrangler secret put CF_ACCESS_AUD

   # OEM Agent (required)
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```

3. **Verify `max_instances`** in `wrangler.jsonc` is sufficient (default: 10)

4. **Deploy**:
   ```bash
   npx wrangler deploy
   ```

5. **Verify**:
   ```bash
   # Check API status
   curl https://oem-agent.adme-dev.workers.dev/api/status

   # Check container health (requires CF Access + DEBUG_ROUTES=true)
   curl https://oem-agent.adme-dev.workers.dev/debug/version
   ```

6. **If gateway is stuck**, restart it:
   ```bash
   curl -X POST https://oem-agent.adme-dev.workers.dev/debug/restart-gateway
   ```

### Redeployment

1. **Make changes** to code, skills, workspaces, or Dockerfile
2. **Update cache bust** in Dockerfile if only `start-openclaw.sh` changed
3. **Deploy**: `npx wrangler deploy`
4. **Restart gateway** to pick up changes: `POST /debug/restart-gateway`
5. **Verify** via `/api/status` and `/debug/version`

### Adding New Secrets

```bash
# Set the secret
npx wrangler secret put NEW_SECRET_NAME

# Add to buildEnvVars() in src/gateway/env.ts
if (env.NEW_SECRET_NAME) envVars.NEW_SECRET_NAME = env.NEW_SECRET_NAME;

# If used in startup, add handling in start-openclaw.sh
# Deploy and restart gateway
```

## Source File Reference

| File | Purpose |
|------|---------|
| `wrangler.jsonc` | Container config, env vars, cron triggers, DO bindings |
| `Dockerfile` | Container image: Node.js 22, pnpm, OpenClaw, skills, workspaces |
| `start-openclaw.sh` | Container startup: R2 restore → onboard → config patch → gateway start |
| `src/gateway/env.ts` | `buildEnvVars()` — Worker secret → container env var mapping |
| `src/gateway/process.ts` | `ensureMoltbotGateway()` — process lifecycle, port waiting, restart logic |
| `src/index.ts` | Worker entry: proxy, WebSocket interception, token injection, cron handler |
| `src/routes/debug.ts` | Debug endpoints for container inspection |
| `src/config.ts` | Constants: `MOLTBOT_PORT` (18789), `STARTUP_TIMEOUT_MS` (180s) |
