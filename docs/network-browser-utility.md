# Network Interception Browser Utility

## Overview

A dedicated browser utility focused solely on network activity capture for API discovery and payload extraction.

## Features

- **Pure Network Interception**: Captures all network requests/responses without HTML extraction overhead
- **Response Body Capture**: Handles CORS restrictions and captures response payloads
- **Request/Response Correlation**: Tracks which request corresponds to which response
- **API Chaining Support**: Captures tokens from first request for use in subsequent calls
- **HAR-like Output**: Standard format for network analysis

## Usage

### Basic Network Capture

```typescript
import { createNetworkBrowser } from './utils/network-browser';

const browser = createNetworkBrowser(env.BROWSER!, {
  waitAfterLoad: 5000,
  contentTypes: ['application/json', 'text/json'],
});

const session = await browser.capture('https://example.com/api');

console.log(`Captured ${session.responses.length} responses`);
console.log(`JSON responses: ${session.jsonResponses.length}`);
console.log(`API responses: ${session.apiResponses.length}`);
```

### Sequential Capture with Token Extraction

```typescript
const browser = createNetworkBrowser(env.BROWSER!);

const sessions = await browser.captureSequence([
  'https://api.example.com/auth',     // Get token
  'https://api.example.com/data',     // Use token
], {
  delayBetween: 1000,
  extractTokens: (session) => {
    const authResponse = session.jsonResponses.find(r => r.url.includes('/auth'));
    if (authResponse?.body) {
      const data = JSON.parse(authResponse.body);
      return { token: data.token };
    }
    return {};
  },
});
```

### Ford-Specific Pricing Capture

```typescript
const browser = createNetworkBrowser(env.BROWSER!);

const result = await browser.captureFordPricing('Ranger', 'Next-Gen_Ranger-test');

console.log(`Pricing data sources: ${result.pricingData.length}`);
console.log(`Config data sources: ${result.configData.length}`);
console.log(`Tokens extracted:`, Object.keys(result.tokens));
```

## API Reference

### `NetworkInterceptionBrowser`

#### Constructor
```typescript
new NetworkInterceptionBrowser(browserWorker: BrowserWorker, options?: InterceptionOptions)
```

#### Methods

##### `capture(url: string, options?: InterceptionOptions): Promise<NetworkSession>`
Captures network activity for a single URL.

##### `captureSequence(urls: string[], options?: CaptureSequenceOptions): Promise<NetworkSession[]>`
Captures network activity for multiple URLs sequentially.

##### `captureFordPricing(vehicleName: string, vehicleCode: string): Promise<FordPricingResult>`
Specialized capture for Ford pricing data.

### Interfaces

#### `NetworkSession`
```typescript
interface NetworkSession {
  url: string;
  startTime: number;
  endTime: number;
  requests: NetworkRequest[];
  responses: NetworkResponse[];
  responsesByUrl: Map<string, NetworkResponse[]>;
  jsonResponses: NetworkResponse[];
  apiResponses: NetworkResponse[];
}
```

#### `InterceptionOptions`
```typescript
interface InterceptionOptions {
  urlPatterns?: string[];           // Regex patterns for URL filtering
  contentTypes?: string[];          // Content types to capture
  maxBodySize?: number;             // Max body size in bytes
  waitAfterLoad?: number;           // Wait time after page load (ms)
  interceptRequests?: boolean;      // Enable request interception
  interceptResponses?: boolean;     // Enable response interception
  captureRequestBody?: boolean;     // Capture request body
  captureResponseBody?: boolean;    // Capture response body
}
```

## API Endpoints

### POST /api/v1/oem-agent/admin/network-capture

Capture network activity for any URL.

**Request:**
```json
{
  "url": "https://www.ford.com.au/price/Ranger",
  "waitAfterLoad": 5000,
  "urlPatterns": [".*ford\.com.*", ".*\.data$"]
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://www.ford.com.au/price/Ranger",
  "duration": 12345,
  "analysis": {
    "totalRequests": 50,
    "totalResponses": 48,
    "jsonResponses": 12,
    "apiResponses": 8,
    "statusCodes": { "200": 45, "404": 3 },
    "contentTypes": { "application/json": 12, "text/html": 5 },
    "domains": { "www.ford.com.au": 30, "api.ford.com": 10 }
  },
  "potentialApis": [...],
  "jsonResponses": [...]
}
```

### POST /api/v1/oem-agent/admin/capture-ford-advanced

Advanced Ford pricing capture with network interception and optional API chaining.

**Request:**
```json
{
  "vehicleCode": "Next-Gen_Ranger-test",
  "vehicleName": "Ranger",
  "useApiChain": true
}
```

**Response:**
```json
{
  "success": true,
  "vehicleCode": "Next-Gen_Ranger-test",
  "vehicleName": "Ranger",
  "methods": {
    "networkInterception": {
      "success": true,
      "pricingDataCount": 2,
      "configDataCount": 1,
      "tokensExtracted": ["sessionId", "mboxSession"],
      "totalResponses": 45
    },
    "apiChaining": {
      "success": true,
      "executedSteps": ["init", "adobe-target", "pricing"],
      "failedSteps": [],
      "finalTokens": ["fordSessionId", "adobeSessionId", "mboxPC"]
    }
  },
  "pricingData": [...],
  "configData": [...],
  "tokens": { "sessionId": "...", "mboxSession": "..." }
}
```

## Current Limitations

### Ford Pricing API

The Ford pricing API appears to use one of these mechanisms:

1. **Server-Side Rendering (SSR)**: Data embedded in initial HTML, not loaded via XHR
2. **JavaScript Bundle Embedding**: Data compiled into JS bundles at build time
3. **WebSocket Communication**: Real-time data via WebSocket (not HTTP requests)
4. **User Interaction Required**: Data loaded only after specific user actions

### Potential Solutions

1. **HTML Parsing**: Extract data from `__INITIAL_STATE__` or similar script tags
2. **JS Bundle Analysis**: Download and parse main JS bundles for embedded data
3. **WebSocket Interception**: Extend utility to capture WebSocket messages
4. **Browser Automation**: Simulate user interactions (clicks) to trigger data loads

## Testing

```bash
# Test network capture
curl -X POST "https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/network-capture" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.ford.com.au", "waitAfterLoad": 3000}'

# Test Ford advanced capture
curl -X POST "https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/capture-ford-advanced" \
  -H "Content-Type: application/json" \
  -d '{"vehicleCode": "Next-Gen_Ranger-test", "vehicleName": "Ranger", "useApiChain": true}'
```

## Files

- `src/utils/network-browser.ts` - Main utility class
- `src/utils/api-chainer.ts` - API chaining logic
- `src/routes/oem-agent.ts` - API endpoints
