# Network Capture Implementation Summary

## Research Completed

I researched NPM packages and techniques for network interception and API capture:

### NPM Packages Found

| Package | Purpose | Response Bodies | Best For |
|---------|---------|-----------------|----------|
| **chrome-har-capturer** | Capture HAR from Chrome | ✅ Yes | Comprehensive capture |
| **puppeteer-har** | Generate HAR with Puppeteer | ❌ No | Basic capture |
| **puppeteer-interceptor** | Request/response interception | ✅ Yes | Specific API targeting |
| **playwright-har** | HAR capture for Playwright | ❌ No | Playwright users |

### Key Research Finding

From StackOverflow and Chrome DevTools Protocol documentation:

> **The Problem**: Response buffers get wiped during navigation, causing `response.buffer()` to return empty.

> **The Solution**: Queue requests and process them sequentially. This prevents parallel requests from wiping each other's buffers.

## Implementation

### New Utility: `src/utils/network-capture.ts`

Created an enhanced network capture utility that implements the research findings:

#### Key Features

1. **Request Queuing System**
   ```typescript
   const requestQueue: Array<() => void> = [];
   let isProcessing = false;
   
   // Queue response processing
   requestQueue.push(async () => {
     // Process response body
   });
   
   // Process sequentially
   if (!isProcessing) processNextRequest();
   ```

2. **Response Body Capture**
   - Uses `Network.getResponseBody` from CDP
   - Handles base64 encoding
   - Respects size limits (min/max)

3. **API Chaining Support**
   ```typescript
   captureWithChaining(browser, initialUrl, {
     tokenExtractor: (result) => ({ token: extractFrom(result) }),
     subsequentUrls: ['https://api.example.com/data?token={{token}}'],
   });
   ```

4. **Ford-Specific Capture**
   ```typescript
   captureFordPricing(browser, 'Ranger', 'Next-Gen_Ranger-test');
   ```

### API Endpoints Updated

#### POST `/api/v1/oem-agent/admin/network-capture`
Enhanced network capture with:
- Response body capture
- Request queuing
- API discovery
- Content analysis

**Request:**
```json
{
  "url": "https://www.ford.com.au/price/Ranger",
  "waitAfterLoad": 5000,
  "urlPatterns": [".*ford\\.com.*", ".*\\.data$"],
  "captureBodies": true
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "duration": 12345,
    "totalRequests": 50,
    "totalResponses": 48,
    "jsonResponses": 12,
    "apiResponses": 8
  },
  "potentialApis": [...],
  "allJsonResponses": [...]
}
```

#### POST `/api/v1/oem-agent/admin/capture-ford-advanced`
Specialized Ford capture with:
- Pricing data detection
- Config data extraction
- Token extraction
- Optional API chaining

## Usage Examples

### Basic Network Capture

```bash
curl -X POST "https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/network-capture" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.ford.com.au/price/Ranger",
    "waitAfterLoad": 5000,
    "captureBodies": true
  }'
```

### Ford Pricing Capture

```bash
curl -X POST "https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/capture-ford-advanced" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleCode": "Next-Gen_Ranger-test",
    "vehicleName": "Ranger",
    "useChaining": true
  }'
```

## Files Created/Modified

| File | Purpose |
|------|---------|
| `src/utils/network-capture.ts` | **NEW** - Enhanced network capture utility |
| `docs/network-capture-research.md` | **NEW** - NPM package research |
| `src/routes/oem-agent.ts` | **MODIFIED** - Updated API endpoints |
| `docs/implementation-summary.md` | **NEW** - This summary |

## Next Steps

### To Test the New Utility

1. **Test basic capture:**
   ```bash
   curl -X POST .../network-capture \
     -d '{"url": "https://www.ford.com.au"}'
   ```

2. **Test Ford pricing capture:**
   ```bash
   curl -X POST .../capture-ford-advanced \
     -d '{"vehicleCode": "Next-Gen_Ranger-test", "vehicleName": "Ranger"}'
   ```

3. **If successful**, we can:
   - Extract pricing data automatically
   - Populate variants dynamically
   - Discover new API endpoints

### If Ford API Still Protected

The utility provides multiple fallback strategies:

1. **HTML Embedded Data**: Extracts `__INITIAL_STATE__` from HTML
2. **JS Bundle Analysis**: Can be extended to download/parse JS chunks
3. **Click Simulation**: Triggers lazy-loaded content
4. **Token Chaining**: Uses tokens from first API for subsequent calls

## Technical Details

### Request Queuing Pattern

The key innovation is preventing parallel requests from wiping response buffers:

```
Request 1 starts → Pause → Capture body → Resume
                          ↓
Request 2 waits ─────────→ Process → Capture body
```

### Token Extraction

Automatically extracts common token patterns:
- `sessionId`, `session_id`, `sessionID`
- `csrfToken`, `csrf_token`
- `authToken`, `auth_token`, `token`
- `apiKey`, `api_key`
- `mboxSession`, `mboxPC` (Adobe Target)

### Content Detection

Automatically categorizes responses:
- **JSON responses**: `application/json`
- **API responses**: URL patterns like `/api/`, `.data$`
- **HTML responses**: `text/html`

## Research References

- [chrome-har-capturer](https://www.npmjs.com/package/chrome-har-capturer) - HAR capture with bodies
- [puppeteer-interceptor](https://www.npmjs.com/package/puppeteer-interceptor) - Request/response modification
- [StackOverflow - Capture response text](https://stackoverflow.com/questions/64790700) - Request queuing solution
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/tot/Network/) - CDP documentation
