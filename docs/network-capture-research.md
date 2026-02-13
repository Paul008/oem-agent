# Network Capture NPM Packages Research

## Summary of Findings

I researched several NPM packages that can help capture network activity and API responses. Here are the best options:

## 1. **puppeteer-har** ⭐ Recommended
- **Purpose**: Capture HAR (HTTP Archive) files from Puppeteer
- **Features**: 
  - Records all network requests/responses
  - Can save to file or return as object
  - Lightweight (1 dependency)
  - Well-established (13 dependents)
- **Limitation**: Does NOT capture response bodies by default
- **Install**: `npm install puppeteer-har`
- **NPM**: https://www.npmjs.com/package/puppeteer-har

## 2. **chrome-har-capturer** ⭐⭐ Best for Response Bodies
- **Purpose**: Capture HAR files WITH response bodies from Chrome
- **Features**:
  - **Captures response bodies** (`--content` flag)
  - Uses Chrome DevTools Protocol directly
  - Command-line utility + library API
  - Supports pre/post hooks for custom logic
- **Install**: `npm install chrome-har-capturer`
- **NPM**: https://www.npmjs.com/package/chrome-har-capturer
- **Usage**:
  ```bash
  # CLI with response bodies
  chrome-har-capturer -p 9222 -c https://example.com
  ```
  ```javascript
  // Library
  const { run } = require('chrome-har-capturer');
  const har = await run(['https://example.com'], { 
    content: true,  // Capture response bodies!
    port: 9222 
  });
  ```

## 3. **puppeteer-interceptor**
- **Purpose**: Simplify request/response interception
- **Features**:
  - Pattern matching for URLs
  - Modify responses inline
  - Good for specific API interception
- **Limitation**: Text-based only, not for large binary files
- **Install**: `npm install puppeteer-interceptor`
- **NPM**: https://www.npmjs.com/package/puppeteer-interceptor

## 4. **playwright-har**
- **Purpose**: Port of puppeteer-har for Playwright
- **Features**: Same as puppeteer-har but for Playwright
- **Install**: `npm install playwright-har`
- **NPM**: https://www.npmjs.com/package/playwright-har

## 5. **Manual CDP Approach** (What we currently use)
- Uses `target.createCDPSession()` to access Chrome DevTools Protocol
- `Network.getResponseBody` to fetch response bodies
- Full control but more code to maintain

---

## Recommendation for Ford API Capture

### Primary: **chrome-har-capturer**
- Specifically designed for capturing response bodies
- Uses CDP directly (same as our current approach but more robust)
- Has `--content` flag to capture response bodies
- Supports pre/post hooks for complex scenarios

### Secondary: **puppeteer-interceptor**
- Good for intercepting specific API patterns
- Can modify requests/responses on the fly
- Useful if we need to add headers or tokens

### Implementation Strategy

```javascript
// Option 1: Use chrome-har-capturer
const { run } = require('chrome-har-capturer');

const har = await run(['https://www.ford.com.au/price/Ranger'], {
  content: true,        // Capture response bodies
  port: 9222,           // Chrome debugging port
  grace: 5000,          // Wait 5s after load
  preHook: async (url, client) => {
    // Inject scripts, set cookies, etc.
  },
  postHook: async (url, client) => {
    // Extract data from page
  }
});

// HAR contains all requests with response bodies!
```

---

## Installation Commands

```bash
# Option 1: HAR capture with response bodies
npm install chrome-har-capturer

# Option 2: Simple HAR capture (no bodies)
npm install puppeteer-har

# Option 3: Request/response interception
npm install puppeteer-interceptor

# Option 4: All of the above
npm install chrome-har-capturer puppeteer-har puppeteer-interceptor
```

---

## Key Insight from Research

The **Ford pricing API** likely uses one of these protection mechanisms:

1. **Server-Side Rendering (SSR)**: Data embedded in HTML `<script>` tags
2. **JavaScript Bundle Embedding**: Data compiled into JS chunks
3. **WebSocket Communication**: Real-time data (not HTTP)
4. **User Interaction Required**: Data loads after clicks

### Solution: Multi-Layer Capture

```
Layer 1: HAR Capture (chrome-har-capturer)
         ↓
Layer 2: HTML Parsing (__INITIAL_STATE__ extraction)
         ↓
Layer 3: JS Bundle Analysis (download & parse main chunks)
         ↓
Layer 4: Browser Automation (simulate clicks)
```

---

## Next Steps

1. **Install chrome-har-capturer** for comprehensive network capture
2. **Test with Ford pricing page** to see if response bodies are captured
3. **If not successful**, try extracting from HTML `__INITIAL_STATE__`
4. **If still not successful**, try downloading JS bundles and parsing
5. **Last resort**: Browser automation with click simulation

---

## References

- [chrome-har-capturer GitHub](https://github.com/cyrus-and/chrome-har-capturer)
- [puppeteer-har NPM](https://www.npmjs.com/package/puppeteer-har)
- [puppeteer-interceptor NPM](https://www.npmjs.com/package/puppeteer-interceptor)
- [Chrome DevTools Protocol - Network Domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
