/**
 * Network Interception Browser Utility
 * 
 * A dedicated browser wrapper focused solely on network activity capture.
 * Designed for API discovery and payload extraction.
 * 
 * Features:
 * - Pure network interception without HTML extraction overhead
 * - Response body capture with CORS handling
 * - Request/response correlation
 * - API chaining support (capture tokens from first request for subsequent calls)
 * - HAR-like output format
 */

import puppeteer, { type Browser, type BrowserWorker } from '@cloudflare/puppeteer';

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: number;
}

export interface NetworkResponse {
  id: string;
  requestId: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  contentType: string | null;
  body: string | null;
  bodyLength: number;
  timestamp: number;
  fromCache: boolean;
}

export interface NetworkSession {
  url: string;
  startTime: number;
  endTime: number;
  requests: NetworkRequest[];
  responses: NetworkResponse[];
  // Indexed by URL for quick lookup
  responsesByUrl: Map<string, NetworkResponse[]>;
  // Indexed by content type
  jsonResponses: NetworkResponse[];
  apiResponses: NetworkResponse[];
}

export interface InterceptionOptions {
  // URL patterns to intercept (regex strings)
  urlPatterns?: string[];
  // Content types to capture
  contentTypes?: string[];
  // Maximum body size to capture (bytes)
  maxBodySize?: number;
  // Wait time after page load (ms)
  waitAfterLoad?: number;
  // Enable request interception (for modification)
  interceptRequests?: boolean;
  // Enable response interception
  interceptResponses?: boolean;
  // Capture request body
  captureRequestBody?: boolean;
  // Capture response body
  captureResponseBody?: boolean;
}

const DEFAULT_OPTIONS: InterceptionOptions = {
  urlPatterns: ['.*'],
  contentTypes: ['application/json', 'text/json', 'application/javascript', 'text/javascript'],
  maxBodySize: 10 * 1024 * 1024, // 10MB
  waitAfterLoad: 3000,
  interceptRequests: true,
  interceptResponses: true,
  captureRequestBody: true,
  captureResponseBody: true,
};

export class NetworkInterceptionBrowser {
  private browser: Browser | null = null;
  private options: InterceptionOptions;

  constructor(
    private browserWorker: BrowserWorker,
    options: Partial<InterceptionOptions> = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Capture network activity for a single URL.
   * Returns a session with all requests and responses.
   */
  async capture(url: string, options?: Partial<InterceptionOptions>): Promise<NetworkSession> {
    const opts = { ...this.options, ...options };
    
    console.log(`[NetworkBrowser] Starting capture for: ${url}`);
    
    this.browser = await puppeteer.launch(this.browserWorker);
    if (!this.browser) {
      throw new Error('Failed to launch browser');
    }
    const page = await this.browser.newPage();
    
    const session: NetworkSession = {
      url,
      startTime: Date.now(),
      endTime: 0,
      requests: [],
      responses: [],
      responsesByUrl: new Map(),
      jsonResponses: [],
      apiResponses: [],
    };

    // Enable request/response interception
    const client = await page.target().createCDPSession();
    
    await client.send('Network.enable');
    
    if (opts.interceptRequests) {
      await client.send('Network.setRequestInterception', {
        patterns: [{ urlPattern: '*' }],
      });
    }

    // Track requests
    client.on('Network.requestWillBeSent', (params: any) => {
      const request: NetworkRequest = {
        id: params.requestId,
        url: params.request.url,
        method: params.request.method,
        headers: params.request.headers || {},
        postData: params.request.postData,
        timestamp: params.timestamp,
      };
      
      session.requests.push(request);
      
      console.log(`[NetworkBrowser] Request: ${request.method} ${request.url.substring(0, 100)}`);
    });

    // Track responses
    client.on('Network.responseReceived', async (params: any) => {
      const response = params.response;
      
      // Check if we should capture this response
      const shouldCapture = this.shouldCaptureResponse(response, opts);
      
      if (!shouldCapture) {
        return;
      }

      let body: string | null = null;
      let bodyLength = 0;

      // Try to get response body
      if (opts.captureResponseBody) {
        try {
          const bodyResult = await client.send('Network.getResponseBody', {
            requestId: params.requestId,
          });
          
          if (bodyResult.body) {
            body = bodyResult.base64Encoded 
              ? Buffer.from(bodyResult.body, 'base64').toString('utf-8')
              : bodyResult.body;
            bodyLength = body.length;
            
            // Limit body size
            if (bodyLength > (opts.maxBodySize || 10 * 1024 * 1024)) {
              body = body.substring(0, opts.maxBodySize) + '...[truncated]';
              bodyLength = opts.maxBodySize || 10 * 1024 * 1024;
            }
          }
        } catch (e) {
          // Body might not be available (CORS, etc)
          console.log(`[NetworkBrowser] Could not get body for ${response.url.substring(0, 80)}: ${e}`);
        }
      }

      const responseData: NetworkResponse = {
        id: params.requestId,
        requestId: params.requestId,
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers || {},
        contentType: this.getContentType(response.headers),
        body,
        bodyLength,
        timestamp: params.timestamp,
        fromCache: params.response.fromDiskCache || params.response.fromMemoryCache || false,
      };

      session.responses.push(responseData);
      
      // Index by URL
      const existing = session.responsesByUrl.get(response.url) || [];
      existing.push(responseData);
      session.responsesByUrl.set(response.url, existing);

      // Categorize
      if (this.isJsonResponse(responseData)) {
        session.jsonResponses.push(responseData);
      }
      if (this.isApiResponse(responseData)) {
        session.apiResponses.push(responseData);
      }

      console.log(`[NetworkBrowser] Response: ${response.status} ${response.url.substring(0, 100)} (${bodyLength} bytes)`);
    });

    try {
      // Navigate to URL
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Additional wait for any delayed API calls
      if (opts.waitAfterLoad && opts.waitAfterLoad > 0) {
        await new Promise(resolve => setTimeout(resolve, opts.waitAfterLoad));
      }

      // Try to trigger lazy-loaded content
      await this.triggerLazyLoading(page);

    } catch (error) {
      console.error(`[NetworkBrowser] Navigation error:`, error);
    } finally {
      session.endTime = Date.now();
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }

    console.log(`[NetworkBrowser] Capture complete: ${session.requests.length} requests, ${session.responses.length} responses`);
    console.log(`[NetworkBrowser] JSON responses: ${session.jsonResponses.length}, API responses: ${session.apiResponses.length}`);

    return session;
  }

  /**
   * Capture network activity with multiple sequential page navigations.
   * Useful for API chaining scenarios (e.g., capture token from page 1, use on page 2).
   */
  async captureSequence(
    urls: string[],
    options?: Partial<InterceptionOptions> & { 
      delayBetween?: number;
      extractTokens?: (session: NetworkSession) => Record<string, string>;
    }
  ): Promise<NetworkSession[]> {
    const sessions: NetworkSession[] = [];
    let tokens: Record<string, string> = {};

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      // Replace token placeholders in URL
      const resolvedUrl = this.resolveTokens(url, tokens);
      
      console.log(`[NetworkBrowser] Sequence step ${i + 1}/${urls.length}: ${resolvedUrl}`);
      
      const session = await this.capture(resolvedUrl, options);
      sessions.push(session);
      
      // Extract tokens for next request
      if (options?.extractTokens) {
        tokens = { ...tokens, ...options.extractTokens(session) };
        console.log(`[NetworkBrowser] Extracted tokens:`, Object.keys(tokens));
      }
      
      // Delay between requests
      if (options?.delayBetween && i < urls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, options.delayBetween));
      }
    }

    return sessions;
  }

  /**
   * Capture API specifically for Ford pricing data.
   * Handles the Ford-specific flow of navigating to Build & Price page
   * and extracting variant/configuration APIs.
   */
  async captureFordPricing(vehicleName: string, vehicleCode: string): Promise<{
    session: NetworkSession;
    pricingData: any[];
    configData: any[];
    tokens: Record<string, string>;
  }> {
    const url = `https://www.ford.com.au/price/${vehicleName.replace(/\s+/g, '')}`;
    
    console.log(`[NetworkBrowser] Capturing Ford pricing for ${vehicleName} at ${url}`);
    
    const session = await this.capture(url, {
      waitAfterLoad: 5000, // Wait for React hydration
      contentTypes: [
        'application/json',
        'text/json',
        'application/javascript',
        'text/javascript',
        'application/x-javascript',
      ],
    });

    // Extract pricing-related data
    const pricingData: any[] = [];
    const configData: any[] = [];
    const tokens: Record<string, string> = {};

    for (const response of session.jsonResponses) {
      if (!response.body) continue;

      try {
        const data = JSON.parse(response.body);
        
        // Check for pricing data structure
        if (this.isFordPricingData(data)) {
          pricingData.push({
            url: response.url,
            data,
            timestamp: response.timestamp,
          });
        }
        
        // Check for config/variant data
        if (this.isFordConfigData(data)) {
          configData.push({
            url: response.url,
            data,
            timestamp: response.timestamp,
          });
        }

        // Extract tokens (session IDs, CSRF tokens, etc)
        const extractedTokens = this.extractFordTokens(data, response.headers);
        Object.assign(tokens, extractedTokens);
        
      } catch (e) {
        // Not valid JSON
      }
    }

    // Also check HTML for embedded data
    const htmlResponse = session.responses.find(r => 
      r.url === url && r.contentType?.includes('text/html')
    );
    
    if (htmlResponse?.body) {
      const htmlData = this.extractFordDataFromHtml(htmlResponse.body);
      if (htmlData) {
        configData.push({
          url: `${url}#html-embedded`,
          data: htmlData,
          timestamp: 0,
        });
      }
    }

    console.log(`[NetworkBrowser] Ford capture results:`);
    console.log(`  - Pricing data: ${pricingData.length} sources`);
    console.log(`  - Config data: ${configData.length} sources`);
    console.log(`  - Tokens: ${Object.keys(tokens).length} extracted`);

    return { session, pricingData, configData, tokens };
  }

  /**
   * Close the browser.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // Private helper methods

  private shouldCaptureResponse(response: any, opts: InterceptionOptions): boolean {
    const contentType = this.getContentType(response.headers);
    
    // Check content type filter
    if (opts.contentTypes && contentType) {
      const matches = opts.contentTypes.some(ct => 
        contentType.toLowerCase().includes(ct.toLowerCase())
      );
      if (!matches) return false;
    }

    // Check URL pattern filter
    if (opts.urlPatterns) {
      const matches = opts.urlPatterns.some(pattern => {
        try {
          const regex = new RegExp(pattern);
          return regex.test(response.url);
        } catch {
          return false;
        }
      });
      if (!matches) return false;
    }

    return true;
  }

  private getContentType(headers: Record<string, string>): string | null {
    const ct = headers['content-type'] || headers['Content-Type'];
    return ct || null;
  }

  private isJsonResponse(response: NetworkResponse): boolean {
    return response.contentType?.includes('application/json') || 
           response.contentType?.includes('text/json') ||
           false;
  }

  private isApiResponse(response: NetworkResponse): boolean {
    // Check for API-like URL patterns
    const apiPatterns = [
      /\/api\//i,
      /\/graphql/i,
      /\/rest\//i,
      /\.data$/i,
      /\.json$/i,
      /\/v\d+\//i,
    ];
    
    return apiPatterns.some(pattern => pattern.test(response.url));
  }

  private async triggerLazyLoading(page: any): Promise<void> {
    try {
      // Scroll to bottom to trigger lazy loading
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // Wait a bit for any lazy-loaded content
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Click on common elements that might load data
      const clickableSelectors = [
        '[data-testid*="variant"]',
        '[data-testid*="model"]',
        '[data-testid*="trim"]',
        '.variant-selector',
        '.model-selector',
        '[class*="Variant"]',
        '[class*="Model"]',
      ];
      
      for (const selector of clickableSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            console.log(`[NetworkBrowser] Clicking ${selector} to trigger data load`);
            await elements[0].click();
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (e) {
          // Ignore click errors
        }
      }
    } catch (e) {
      console.log(`[NetworkBrowser] Lazy loading trigger error:`, e);
    }
  }

  private resolveTokens(url: string, tokens: Record<string, string>): string {
    let resolved = url;
    for (const [key, value] of Object.entries(tokens)) {
      resolved = resolved.replace(`{{${key}}}`, encodeURIComponent(value));
    }
    return resolved;
  }

  private isFordPricingData(data: any): boolean {
    // Check for Ford-specific pricing data structure
    const hasPricing = data.price || data.pricing || data.msrp || data.driveAwayPrice;
    const hasSeries = data.series || data.grades || data.trims || data.variants;
    const hasColors = data.colors || data.colours || data.paintOptions;
    
    return !!(hasPricing || hasSeries || hasColors);
  }

  private isFordConfigData(data: any): boolean {
    // Check for Ford-specific configuration data
    const hasConfig = data.config || data.configuration || data.options || data.features;
    const hasModels = data.models || data.vehicles || data.nameplates;
    const hasSpecs = data.specifications || data.specs || data.technical;
    
    return !!(hasConfig || hasModels || hasSpecs);
  }

  private extractFordTokens(data: any, headers: Record<string, string>): Record<string, string> {
    const tokens: Record<string, string> = {};
    
    // Common token fields
    const tokenFields = [
      'sessionId', 'session_id', 'sessionID',
      'csrfToken', 'csrf_token', 'CSRFToken',
      'authToken', 'auth_token', 'token',
      'apiKey', 'api_key', 'api-key',
      'clientId', 'client_id',
      'mboxSession', 'mboxPC',
    ];
    
    for (const field of tokenFields) {
      if (data[field]) {
        tokens[field] = String(data[field]);
      }
    }
    
    // Check for tokens in nested data structures
    if (data.data && typeof data.data === 'object') {
      for (const field of tokenFields) {
        if (data.data[field]) {
          tokens[field] = String(data.data[field]);
        }
      }
    }
    
    return tokens;
  }

  private extractFordDataFromHtml(html: string): any | null {
    // Look for JSON data embedded in HTML
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
          // Try with unescaping
          try {
            const unescaped = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
            return JSON.parse(unescaped);
          } catch (e2) {
            // Continue to next pattern
          }
        }
      }
    }
    
    return null;
  }
}

/**
 * Factory function to create a NetworkInterceptionBrowser.
 */
export function createNetworkBrowser(
  browserWorker: BrowserWorker,
  options?: Partial<InterceptionOptions>
): NetworkInterceptionBrowser {
  return new NetworkInterceptionBrowser(browserWorker, options);
}

export default NetworkInterceptionBrowser;
