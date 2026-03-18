# Browser Rendering Setup

**Status: ✅ PRODUCTION READY** (Lightpanda primary + Cloudflare Browser fallback)

This document covers the setup and usage of browser rendering for web scraping, screenshot capture, and API discovery.

## Rendering Priority

The orchestrator uses a tiered approach:

1. **Lightpanda** (primary) — Zig-based headless browser with V8 JS, 11x faster, 9x less memory than Chrome. Connected via raw CDP WebSocket. 15s timeout before fallback.
2. **Cloudflare Browser Rendering** (fallback) — Full Chrome via `@cloudflare/puppeteer`. Smart Mode with network interception for API discovery.
3. **Basic fetch** — Plain HTTP fetch for server-rendered pages (e.g. Foton AU).

## Quick Status Check

```bash
# Test Lightpanda (local dev)
curl -s http://127.0.0.1:9222/json/version
# Expected: {"webSocketDebuggerUrl": "ws://0.0.0.0:9222/"}

# Test CDP endpoint (Cloudflare)
curl -s "https://oem-agent.adme-dev.workers.dev/cdp"
# Expected: {"error":"WebSocket upgrade required",...}
```

## Lightpanda Setup

```bash
# Docker (recommended for local dev)
docker run -d --name lightpanda -p 9222:9222 lightpanda/browser:nightly

# Set env var (wrangler.jsonc or .dev.vars)
LIGHTPANDA_URL=ws://127.0.0.1:9222
```

When `LIGHTPANDA_URL` is not set, the orchestrator skips Lightpanda and uses Cloudflare Browser directly.

**Known limitations** (beta):
- Complex sites with heavy third-party JS (Optimizely, Adobe DTM) may timeout
- Single page per CDP connection (orchestrator handles this via raw WebSocket)
- No visual rendering (screenshots require Cloudflare Browser)

## Overview

The OEM Agent uses browser rendering to:
- Render BYO (Build Your Own) vehicle configuration pages
- Extract colour options and pricing data
- Discover hidden APIs through network interception
- Capture screenshots for visual regression testing

## Architecture

```
                    ┌──────────────────────┐
                    │   Orchestrator       │
                    │  renderPageLightpanda│
                    └────────┬─────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                              ▼ (fallback)
┌─────────────────────┐      ┌─────────────────────────┐     ┌─────────────────────┐
│  Lightpanda         │      │  Cloudflare Worker      │────▶│  Browser Rendering  │
│  (Raw CDP WebSocket)│      │  (Puppeteer Smart Mode) │     │  (Headless Chrome)  │
└─────────────────────┘      └─────────────────────────┘     └─────────────────────┘
                                    │
                                    ▼
                             ┌──────────────┐
                             │  BROWSER     │
                             │  Binding     │
                             └──────────────┘
```

## Configuration

### What's Already Configured

The Browser Rendering binding is already set up in `wrangler.jsonc`:

```json
"browser": {
  "binding": "BROWSER"
}
```

The CDP route is mounted at `/cdp` in the Worker.

### Production Checklist

| Item | Status | Notes |
|------|--------|-------|
| Browser binding in `wrangler.jsonc` | ✅ | Already configured |
| CDP route mounted | ✅ | `/cdp` endpoint active |
| `CDP_SECRET` secret | ✅ | Set via wrangler |
| `WORKER_URL` secret | ✅ | Set via wrangler |
| Container env passthrough | ✅ | `env.ts` passes vars to container |
| Startup script browser config | ✅ | `start-openclaw.sh` patches openclaw.json |
| **Rebuild & Deploy** | ⬜ | **Need to deploy to pick up changes** |

### Deploy Changes

After the recent fixes to `start-openclaw.sh`, you need to redeploy:

```bash
# Deploy worker + container with new browser config
npm run deploy
```

This will:
1. Build the container with the updated `start-openclaw.sh`
2. Deploy the Worker with the `WORKER_URL` and `CDP_SECRET` secrets
3. The container will now auto-configure the browser profile in `openclaw.json`

### Required Secrets

Set these via `wrangler secret put`:

| Secret | Purpose | Example |
|--------|---------|---------|
| `CDP_SECRET` | Authentication for CDP endpoint | `your-secure-random-secret` |
| `WORKER_URL` | Public URL of the worker | `https://oem-agent.adme-dev.workers.dev` |

### Setting Secrets

```bash
# Set the CDP secret
wrangler secret put CDP_SECRET
# Enter your secret when prompted

# Set the worker URL
wrangler secret put WORKER_URL
# Enter: https://oem-agent.adme-dev.workers.dev
```

### Verify Configuration

```bash
# List all secrets
npx wrangler secret list

# Should show:
# - CDP_SECRET
# - WORKER_URL
```

## Usage

### 1. CDP Client Scripts

Located in `skills/cloudflare-browser/scripts/`:

#### Screenshot

```bash
export WORKER_URL=https://oem-agent.adme-dev.workers.dev
export CDP_SECRET=your-secret

node skills/cloudflare-browser/scripts/screenshot.js \
  "https://example.com" \
  output.png
```

#### Multi-page Video

```bash
node skills/cloudflare-browser/scripts/video.js \
  "https://site1.com,https://site2.com" \
  output.mp4
```

#### CDP Client (Programmatic)

```javascript
const { createClient } = require('./skills/cloudflare-browser/scripts/cdp-client');

const client = await createClient();
await client.navigate('https://example.com');
await client.click('#button');
const screenshot = await client.screenshot();
client.close();
```

### 2. Network Interception Browser

For API discovery and data extraction:

```typescript
import { createNetworkBrowser } from './src/utils/network-browser';

// Create browser instance
const browser = createNetworkBrowser(env.BROWSER, {
  waitAfterLoad: 5000,
  contentTypes: ['application/json', 'text/javascript'],
});

// Capture network activity
const session = await browser.capture('https://ford.com.au/price/Explorer');

// Extract data
console.log(`Captured ${session.requests.length} requests`);
console.log(`JSON responses: ${session.jsonResponses.length}`);

// Find specific APIs
const colorApi = session.jsonResponses.find(r => 
  r.url.includes('color') || r.url.includes('colour')
);
```

### 3. Ford-Specific Pricing Capture

```typescript
const browser = createNetworkBrowser(env.BROWSER);
const { session, pricingData, configData, tokens } = 
  await browser.captureFordPricing('Explorer', 'explorer');

// pricingData contains MSRP, drive-away prices
// configData contains variant/trim information
// tokens contains session IDs for API chaining
```

## CDP Endpoint Reference

### WebSocket URL

```
wss://oem-agent.adme-dev.workers.dev/cdp?secret=<CDP_SECRET>
```

### Supported CDP Domains

| Domain | Methods |
|--------|---------|
| Browser | `getVersion`, `close` |
| Target | `createTarget`, `closeTarget`, `getTargets`, `attachToTarget` |
| Page | `navigate`, `reload`, `captureScreenshot`, `getLayoutMetrics`, etc. |
| Runtime | `evaluate`, `callFunctionOn`, `getProperties` |
| DOM | `getDocument`, `querySelector`, `getOuterHTML`, `getAttributes` |
| Input | `dispatchMouseEvent`, `dispatchKeyEvent`, `insertText` |
| Network | `enable`, `disable`, `setCacheDisabled` |
| Emulation | `setDeviceMetricsOverride`, `setUserAgentOverride` |

### Discovery Endpoints

```bash
# Get browser version and WebSocket URL
GET https://oem-agent.adme-dev.workers.dev/json/version?secret=<CDP_SECRET>

# List available targets
GET https://oem-agent.adme-dev.workers.dev/json/list?secret=<CDP_SECRET>
```

## Local Development

1. Copy the example dev vars:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Edit `.dev.vars` with your values:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   DEV_MODE=true
   DEBUG_ROUTES=true
   CDP_SECRET=dev-secret
   WORKER_URL=https://oem-agent.adme-dev.workers.dev
   ```

3. Run locally:
   ```bash
   npm run dev
   ```

**Note:** WebSocket proxying through the sandbox doesn't work in local dev. Use the deployed worker for full browser automation.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "CDP endpoint not configured" | Set `CDP_SECRET` via `wrangler secret put` |
| "Browser Rendering not configured" | Check `wrangler.jsonc` has `browser.binding` |
| "Unauthorized" | Verify `CDP_SECRET` matches between client and server |
| WebSocket hangs | Check `WORKER_URL` is set correctly |
| Commands timeout | Increase timeout to 30-60s (cold start delay) |
| **"No browser profile configured"** | **Redeploy with `npm run deploy`** - the container needs the updated `start-openclaw.sh` |
| **"No WORKER_URL available" in container** | **Redeploy** - `WORKER_URL` needs to be passed to container env |

### Checking Browser Profile in Container

After deploying, verify the browser profile is configured:

```bash
# Check if the OpenClaw config has the browser profile
cat ~/.openclaw/openclaw.json | jq '.browser'

# Expected output:
# {
#   "profiles": {
#     "cloudflare": {
#       "cdpUrl": "https://oem-agent.adme-dev.workers.dev/cdp?secret=..."
#     }
#   }
# }
```

If the browser profile is missing, the container hasn't picked up the new `start-openclaw.sh`. **Redeploy with `npm run deploy`**.

## Files Reference

| File | Purpose |
|------|---------|
| `src/routes/cdp.ts` | CDP WebSocket shim implementation |
| `src/utils/network-browser.ts` | Network interception utility |
| `skills/cloudflare-browser/scripts/screenshot.js` | Screenshot CLI tool |
| `skills/cloudflare-browser/scripts/video.js` | Video capture CLI tool |
| `skills/cloudflare-browser/scripts/cdp-client.js` | Programmatic CDP client |
| `skills/cloudflare-browser/SKILL.md` | Detailed CDP usage guide |
