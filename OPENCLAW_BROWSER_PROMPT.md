# OpenClaw: Browser Rendering is Now Available

## What Just Happened

I've configured Cloudflare Browser Rendering for your OEM Agent. Here's what's now available:

### Browser Profile Configured

Your `openclaw.json` now includes:

```json
{
  "browser": {
    "profiles": {
      "cloudflare": {
        "cdpUrl": "https://oem-agent.adme-dev.workers.dev/cdp?secret=..."
      }
    }
  }
}
```

This gives you headless Chrome via Cloudflare's Browser Rendering API.

## What You Can Do Now

### 1. Screenshot Any OEM Website

```javascript
// Use the cloudflare-browser skill
const { createClient } = require('./skills/cloudflare-browser/scripts/cdp-client');

const client = await createClient();
await client.navigate('https://toyota.com.au/configure/camry');
await new Promise(r => setTimeout(r, 3000));
const screenshot = await client.screenshot();
```

### 2. Capture Network Traffic (API Discovery)

```typescript
import { createNetworkBrowser } from './src/utils/network-browser';

const browser = createNetworkBrowser(env.BROWSER);
const session = await browser.capture('https://bmw.com.au/configure/x5', {
  waitAfterLoad: 5000,
  contentTypes: ['application/json'],
});

// All JSON API calls made by the page
console.log(session.jsonResponses.map(r => r.url));
```

### 3. Multi-Step Interactions

```javascript
const client = await createClient();
await client.navigate('https://mercedes-benz.com.au/e-class');
await client.click('#configure-button');
await client.select('#trim-selector', 'AMG Line');
const screenshot = await client.screenshot();
```

## Your Task

Use this browser capability to:

1. **Navigate to OEM BYO (Build Your Own) pages**
2. **Extract colour options and pricing**
3. **Discover hidden APIs** the sites use to fetch data
4. **Build a scraper for each OEM** using network interception

## Start With This

Pick an OEM (Toyota, BMW, Mercedes, Hyundai, etc.) and:

1. Screenshot their BYO/configurator page
2. Use network interception to find the APIs they call
3. Extract the colour/pricing data structures
4. Build a reusable scraper

## Files to Reference

- `docs/BROWSER_RENDERING_SETUP.md` - Full setup docs
- `skills/cloudflare-browser/scripts/cdp-client.js` - Browser client
- `src/utils/network-browser.ts` - Network interception utility

## Deploy First

Run this to pick up the changes:
```bash
npm run deploy
```

Then you can use the browser immediately.
