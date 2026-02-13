/**
 * Enhanced Network Capture Utility
 * 
 * Based on research of chrome-har-capturer and puppeteer-interceptor.
 * Uses CDP (Chrome DevTools Protocol) with request queuing to capture
 * response bodies reliably.
 * 
 * Key improvement: Queues requests to prevent response buffers from being
 * wiped on navigation (as described in StackOverflow solution).
 */

import puppeteer, { type BrowserWorker } from '@cloudflare/puppeteer';

export interface CaptureOptions {
  /** Wait time after page load (ms) */
  waitAfterLoad?: number;
  /** Maximum navigation time (ms) */
  navigationTimeout?: number;
  /** Capture response bodies */
  captureBodies?: boolean;
  /** URL patterns to focus on (regex strings) */
  urlPatterns?: string[];
  /** Minimum response size to capture */
  minResponseSize?: number;
  /** Maximum response size to capture (bytes) */
  maxResponseSize?: number;
  /** Enable request interception (allows modification) */
  interceptRequests?: boolean;
  /** Additional HTTP headers to add */
  extraHeaders?: Record<string, string>;
}

export interface CapturedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: number;
}

export interface CapturedResponse {
  id: string;
  requestId: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  contentType: string | null;
  body: string | null;
  bodyLength: number;
  encodedLength: number;
  timestamp: number;
  fromCache: boolean;
  timing?: any;
}

export interface CaptureResult {
  url: string;
  startTime: number;
  endTime: number;
  duration: number;
  requests: CapturedRequest[];
  responses: CapturedResponse[];
  // Categorized responses
  jsonResponses: CapturedResponse[];
  apiResponses: CapturedResponse[];
  htmlResponses: CapturedResponse[];
  // Indexed lookups
  responsesByUrl: Map<string, CapturedResponse[]>;
  responsesByType: Map<string, CapturedResponse[]>;
  // Errors
  errors: string[];
}

const DEFAULT_OPTIONS: CaptureOptions = {
  waitAfterLoad: 3000,
  navigationTimeout: 60000,
  captureBodies: true,
  minResponseSize: 0,
  maxResponseSize: 10 * 1024 * 1024, // 10MB
  interceptRequests: false,
};

/**
 * Enhanced network capture with request queuing.
 * 
 * The key innovation here is queuing requests to prevent response buffers
 * from being wiped during navigation. This is the solution from the
 * StackOverflow research for reliable response body capture.
 */
export async function captureNetworkActivity(
  browserWorker: BrowserWorker,
  url: string,
  options: CaptureOptions = {}
): Promise<CaptureResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  console.log(`[NetworkCapture] Starting capture for: ${url}`);
  console.log(`[NetworkCapture] Options:`, {
    waitAfterLoad: opts.waitAfterLoad,
    captureBodies: opts.captureBodies,
    interceptRequests: opts.interceptRequests,
  });

  const browser = await puppeteer.launch(browserWorker);
  
  try {
    const [page] = await browser.pages();
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set extra headers if provided
    if (opts.extraHeaders) {
      await page.setExtraHTTPHeaders(opts.extraHeaders);
    }

    // Create CDP session for low-level network control
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');

    const result: CaptureResult = {
      url,
      startTime,
      endTime: 0,
      duration: 0,
      requests: [],
      responses: [],
      jsonResponses: [],
      apiResponses: [],
      htmlResponses: [],
      responsesByUrl: new Map(),
      responsesByType: new Map(),
      errors: [],
    };

    // Request queuing system to prevent buffer wiping
    const requestQueue: Array<() => void> = [];
    let isProcessing = false;

    const processNextRequest = () => {
      if (requestQueue.length === 0) {
        isProcessing = false;
        return;
      }
      isProcessing = true;
      const next = requestQueue.shift();
      next?.();
    };

    // Track requests
    client.on('Network.requestWillBeSent', (params: any) => {
      const request: CapturedRequest = {
        id: params.requestId,
        url: params.request.url,
        method: params.request.method,
        headers: params.request.headers || {},
        postData: params.request.postData,
        timestamp: params.timestamp,
      };

      // Check URL patterns
      if (opts.urlPatterns && opts.urlPatterns.length > 0) {
        const matches = opts.urlPatterns.some(pattern => {
          try {
            return new RegExp(pattern).test(request.url);
          } catch {
            return false;
          }
        });
        if (!matches) return;
      }

      result.requests.push(request);
      console.log(`[NetworkCapture] Request: ${request.method} ${request.url.substring(0, 80)}`);
    });

    // Track responses
    client.on('Network.responseReceived', async (params: any) => {
      const response = params.response;
      
      // Check if we should capture this response
      const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
      const shouldCapture = shouldCaptureResponse(response, contentType, opts);
      
      if (!shouldCapture) {
        return;
      }

      // Queue the response processing
      requestQueue.push(async () => {
        try {
          let body: string | null = null;
          let bodyLength = 0;

          if (opts.captureBodies) {
            try {
              // Small delay to ensure response is complete
              await new Promise(r => setTimeout(r, 50));
              
              const bodyResult = await client.send('Network.getResponseBody', {
                requestId: params.requestId,
              });

              if (bodyResult.body) {
                body = bodyResult.base64Encoded
                  ? Buffer.from(bodyResult.body, 'base64').toString('utf-8')
                  : bodyResult.body;
                bodyLength = body.length;

                // Check size limits
                if (bodyLength < (opts.minResponseSize || 0)) {
                  body = null;
                  bodyLength = 0;
                } else if (bodyLength > (opts.maxResponseSize || 10 * 1024 * 1024)) {
                  body = body.substring(0, opts.maxResponseSize) + '...[truncated]';
                  bodyLength = opts.maxResponseSize || 10 * 1024 * 1024;
                }
              }
            } catch (e: any) {
              // Body might not be available (CORS, not loaded yet, etc)
              console.log(`[NetworkCapture] Could not get body for ${response.url.substring(0, 60)}: ${e.message}`);
            }
          }

          const capturedResponse: CapturedResponse = {
            id: params.requestId,
            requestId: params.requestId,
            url: response.url,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers || {},
            contentType: contentType.split(';')[0] || null,
            body,
            bodyLength,
            encodedLength: response.encodedDataLength || 0,
            timestamp: params.timestamp,
            fromCache: response.fromDiskCache || response.fromMemoryCache || false,
            timing: response.timing,
          };

          result.responses.push(capturedResponse);
          
          // Index by URL
          const urlResponses = result.responsesByUrl.get(response.url) || [];
          urlResponses.push(capturedResponse);
          result.responsesByUrl.set(response.url, urlResponses);

          // Index by content type
          const typeKey = capturedResponse.contentType || 'unknown';
          const typeResponses = result.responsesByType.get(typeKey) || [];
          typeResponses.push(capturedResponse);
          result.responsesByType.set(typeKey, typeResponses);

          // Categorize
          if (isJsonResponse(capturedResponse)) {
            result.jsonResponses.push(capturedResponse);
          }
          if (isApiResponse(capturedResponse)) {
            result.apiResponses.push(capturedResponse);
          }
          if (isHtmlResponse(capturedResponse)) {
            result.htmlResponses.push(capturedResponse);
          }

          console.log(`[NetworkCapture] Response: ${response.status} ${response.url.substring(0, 80)} (${bodyLength} bytes)`);

        } catch (e: any) {
          result.errors.push(`Error processing response: ${e.message}`);
        } finally {
          processNextRequest();
        }
      });

      if (!isProcessing) {
        processNextRequest();
      }
    });

    // Track loading finished
    client.on('Network.loadingFinished', (params: any) => {
      // Response body should now be available
    });

    // Track loading failed
    client.on('Network.loadingFailed', (params: any) => {
      result.errors.push(`Loading failed for ${params.requestId}: ${params.errorText}`);
    });

    // Navigate to page
    console.log(`[NetworkCapture] Navigating to ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: opts.navigationTimeout,
    });

    // Wait additional time for lazy-loaded content
    if (opts.waitAfterLoad && opts.waitAfterLoad > 0) {
      console.log(`[NetworkCapture] Waiting ${opts.waitAfterLoad}ms for additional content`);
      await new Promise(r => setTimeout(r, opts.waitAfterLoad));
    }

    // Try to trigger more content loading
    await triggerLazyLoading(page);

    // Wait for queue to finish
    console.log(`[NetworkCapture] Waiting for response processing queue`);
    let waitCount = 0;
    while (isProcessing && waitCount < 50) {
      await new Promise(r => setTimeout(r, 100));
      waitCount++;
    }

    // Final stats
    result.endTime = Date.now();
    result.duration = result.endTime - result.startTime;

    console.log(`[NetworkCapture] Capture complete:`);
    console.log(`  - Duration: ${result.duration}ms`);
    console.log(`  - Requests: ${result.requests.length}`);
    console.log(`  - Responses: ${result.responses.length}`);
    console.log(`  - JSON responses: ${result.jsonResponses.length}`);
    console.log(`  - API responses: ${result.apiResponses.length}`);
    console.log(`  - HTML responses: ${result.htmlResponses.length}`);
    console.log(`  - Errors: ${result.errors.length}`);

    return result;

  } finally {
    await browser.close();
  }
}

/**
 * Capture with API chaining support.
 * First captures initial page, extracts tokens, then makes subsequent calls.
 */
export async function captureWithChaining(
  browserWorker: BrowserWorker,
  initialUrl: string,
  chainConfig: {
    tokenExtractor: (result: CaptureResult) => Record<string, string>;
    subsequentUrls: string[];
    delayBetween?: number;
  },
  options: CaptureOptions = {}
): Promise<{ initial: CaptureResult; chained: CaptureResult[] }> {
  
  // Capture initial page
  console.log(`[NetworkCapture] Chain step 1: ${initialUrl}`);
  const initial = await captureNetworkActivity(browserWorker, initialUrl, options);

  // Extract tokens
  const tokens = chainConfig.tokenExtractor(initial);
  console.log(`[NetworkCapture] Extracted tokens:`, Object.keys(tokens));

  // Make subsequent calls with tokens
  const chained: CaptureResult[] = [];
  
  for (let i = 0; i < chainConfig.subsequentUrls.length; i++) {
    const urlTemplate = chainConfig.subsequentUrls[i];
    
    // Replace tokens in URL
    let url = urlTemplate;
    for (const [key, value] of Object.entries(tokens)) {
      url = url.replace(`{{${key}}}`, encodeURIComponent(value));
    }

    console.log(`[NetworkCapture] Chain step ${i + 2}: ${url}`);
    
    const result = await captureNetworkActivity(browserWorker, url, {
      ...options,
      waitAfterLoad: 2000, // Shorter wait for API calls
    });
    
    chained.push(result);

    // Delay between requests
    if (chainConfig.delayBetween && i < chainConfig.subsequentUrls.length - 1) {
      await new Promise(r => setTimeout(r, chainConfig.delayBetween));
    }
  }

  return { initial, chained };
}

/**
 * Specialized capture for Ford pricing data.
 */
export async function captureFordPricing(
  browserWorker: BrowserWorker,
  vehicleName: string,
  vehicleCode: string
): Promise<{
  result: CaptureResult;
  pricingData: any[];
  configData: any[];
  tokens: Record<string, string>;
}> {
  const url = `https://www.ford.com.au/price/${vehicleName.replace(/\s+/g, '')}`;
  
  console.log(`[NetworkCapture] Ford pricing capture for ${vehicleName}`);

  const result = await captureNetworkActivity(browserWorker, url, {
    waitAfterLoad: 8000, // Longer wait for React hydration
    captureBodies: true,
    urlPatterns: [
      '.*ford\.com.*',
      '.*\.data$',
      '.*api.*',
    ],
  });

  const pricingData: any[] = [];
  const configData: any[] = [];
  const tokens: Record<string, string> = {};

  // Analyze JSON responses
  for (const response of result.jsonResponses) {
    if (!response.body) continue;

    try {
      const data = JSON.parse(response.body);

      // Look for pricing data
      if (isFordPricingData(data)) {
        pricingData.push({
          url: response.url,
          data,
          timestamp: response.timestamp,
        });
      }

      // Look for config data
      if (isFordConfigData(data)) {
        configData.push({
          url: response.url,
          data,
          timestamp: response.timestamp,
        });
      }

      // Extract tokens
      extractTokens(data, response.headers, tokens);

    } catch (e) {
      // Not valid JSON
    }
  }

  // Check HTML for embedded data
  for (const response of result.htmlResponses) {
    if (response.body) {
      const htmlData = extractFordDataFromHtml(response.body);
      if (htmlData) {
        configData.push({
          url: `${response.url}#html-embedded`,
          data: htmlData,
          timestamp: response.timestamp,
        });
        
        // Also check for tokens in embedded data
        extractTokens(htmlData, response.headers, tokens);
      }
    }
  }

  console.log(`[NetworkCapture] Ford capture results:`);
  console.log(`  - Pricing data sources: ${pricingData.length}`);
  console.log(`  - Config data sources: ${configData.length}`);
  console.log(`  - Tokens extracted: ${Object.keys(tokens).length}`);

  return { result, pricingData, configData, tokens };
}

// Helper functions

function shouldCaptureResponse(
  response: any,
  contentType: string,
  opts: CaptureOptions
): boolean {
  // Skip data URIs and blob URLs
  if (response.url.startsWith('data:') || response.url.startsWith('blob:')) {
    return false;
  }

  // Check URL patterns
  if (opts.urlPatterns && opts.urlPatterns.length > 0) {
    const matches = opts.urlPatterns.some(pattern => {
      try {
        return new RegExp(pattern).test(response.url);
      } catch {
        return false;
      }
    });
    if (!matches) return false;
  }

  return true;
}

function isJsonResponse(response: CapturedResponse): boolean {
  return response.contentType?.includes('application/json') ||
         response.contentType?.includes('text/json') ||
         false;
}

function isApiResponse(response: CapturedResponse): boolean {
  const apiPatterns = [
    /\/api\//i,
    /\/graphql/i,
    /\/rest\//i,
    /\.data$/i,
    /\.json$/i,
    /\/v\d+\//i,
  ];
  return apiPatterns.some(p => p.test(response.url));
}

function isHtmlResponse(response: CapturedResponse): boolean {
  return response.contentType?.includes('text/html') || false;
}

async function triggerLazyLoading(page: any): Promise<void> {
  try {
    // Scroll to trigger lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(r => setTimeout(r, 1000));

    // Click common selectors that might load data
    const selectors = [
      'button[data-testid*="variant"]',
      'button[data-testid*="model"]',
      '[class*="VariantSelector"]',
      '[class*="ModelSelector"]',
      'button:has-text("View")',
      'button:has-text("Select")',
    ];

    for (const selector of selectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          console.log(`[NetworkCapture] Clicking ${selector}`);
          await elements[0].click();
          await new Promise(r => setTimeout(r, 1500));
        }
      } catch (e) {
        // Ignore click errors
      }
    }
  } catch (e) {
    console.log(`[NetworkCapture] Lazy loading trigger error:`, e);
  }
}

function isFordPricingData(data: any): boolean {
  return !!(data.price || data.pricing || data.msrp || data.driveAwayPrice ||
            data.series || data.grades || data.trims || data.variants ||
            data.colors || data.colours || data.paintOptions);
}

function isFordConfigData(data: any): boolean {
  return !!(data.config || data.configuration || data.options || data.features ||
            data.models || data.vehicles || data.nameplates ||
            data.specifications || data.specs || data.technical);
}

function extractTokens(
  data: any,
  headers: Record<string, string>,
  tokens: Record<string, string>
): void {
  const tokenFields = [
    'sessionId', 'session_id', 'sessionID',
    'csrfToken', 'csrf_token', 'CSRFToken',
    'authToken', 'auth_token', 'token',
    'apiKey', 'api_key', 'api-key',
    'clientId', 'client_id',
    'mboxSession', 'mboxPC', 'mbox',
  ];

  // From data
  for (const field of tokenFields) {
    if (data[field] && !tokens[field]) {
      tokens[field] = String(data[field]);
    }
  }

  // From nested data
  if (data.data && typeof data.data === 'object') {
    for (const field of tokenFields) {
      if (data.data[field] && !tokens[field]) {
        tokens[field] = String(data.data[field]);
      }
    }
  }

  // From headers
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if ((lowerKey.includes('token') || lowerKey.includes('session')) && value) {
      tokens[key] = value;
    }
  }
}

function extractFordDataFromHtml(html: string): any | null {
  const patterns = [
    /window\.__INITIAL_STATE__\s*=\s*({.+?});/s,
    /window\.__DATA__\s*=\s*({.+?});/s,
    /<script[^>]*type="application\/json"[^>]*>({.+?})<\/script>/s,
    /"filterData":\s*({.+?\})/s,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch (e) {
        try {
          const unescaped = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
          return JSON.parse(unescaped);
        } catch (e2) {
          // Continue
        }
      }
    }
  }

  return null;
}

export default {
  captureNetworkActivity,
  captureWithChaining,
  captureFordPricing,
};
