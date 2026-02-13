---
name: oem-api-discover
description: CDP network interception for API discovery. Analyses network requests during browser rendering to discover OEM APIs that can be called directly, bypassing expensive browser renders. Learns optimal methods per OEM over time.
---

# OEM API Discovery

Intercepts network traffic during browser rendering to discover callable APIs.

## Discovery Targets

- Next.js data routes: `/_next/data/{buildId}/...`
- React/Vue API calls: `/api/*`, `/graphql`
- AEM Content Services: `/content/dam/*`, `/api/assets/*`
- Sitecore Layout Service: `/sitecore/api/layout/*`
- WordPress REST API: `/wp-json/wp/v2/*`
- Generic JSON endpoints with product/offer data

## Prerequisites

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for storing discovered APIs
- `GROQ_API_KEY` for API classification

## How It Works

1. During full render (via oem-crawl), enable CDP Network domain using `cloudflare-browser` skill
2. Call `client.getApiCandidates()` to get filtered JSON endpoints
3. Classify API pattern using Groq Llama
4. Store discovered API in R2 agent memory + Supabase
5. On future crawls, try direct API call before falling back to browser render

## Integration with cloudflare-browser

```javascript
const { createClient } = require('../cloudflare-browser/scripts/cdp-client');

// Enable network interception
const client = await createClient();
await client.enableNetwork();

// Navigate and wait for render
await client.navigate('https://ford.com/suvs/explorer', 5000);

// Get API candidates for classification
const apis = client.getApiCandidates();
// Pass to oem-api-discover handler for Groq classification
```

## Input

```json
{
  "oem_id": "ford",
  "page_url": "https://ford.com/suvs/explorer",
  "network_log": [
    {
      "url": "https://ford.com/api/vehicles/explorer",
      "method": "GET",
      "status": 200,
      "content_type": "application/json",
      "response_size": 15000
    }
  ]
}
```

## Output

```json
{
  "apis_discovered": 2,
  "apis_updated": 1
}
```
