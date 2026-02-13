#!/usr/bin/env node
/**
 * Cloudflare Browser Rendering - CDP Client Library
 *
 * Reusable CDP WebSocket client for Cloudflare Browser Rendering.
 * Import and use in custom scripts.
 *
 * Usage:
 *   const { createClient } = require('./cdp-client');
 *   const client = await createClient();
 *
 *   // Enable network interception for API discovery
 *   await client.enableNetwork();
 *
 *   await client.navigate('https://example.com');
 *   const screenshot = await client.screenshot();
 *
 *   // Get captured network requests
 *   const networkLog = client.getNetworkLog();
 *   console.log(`Captured ${networkLog.length} requests`);
 *
 *   client.close();
 */

const WebSocket = require('ws');

function createClient(options = {}) {
  const CDP_SECRET = options.secret || process.env.CDP_SECRET;
  if (!CDP_SECRET) {
    throw new Error('CDP_SECRET environment variable not set');
  }

  const workerUrl = (options.workerUrl || process.env.WORKER_URL).replace(/^https?:\/\//, '');
  const wsUrl = `wss://${workerUrl}/cdp?secret=${encodeURIComponent(CDP_SECRET)}`;
  const timeout = options.timeout || 60000;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let messageId = 1;
    const pending = new Map();
    let targetId = null;
    let targetResolve;
    const targetReady = new Promise(r => { targetResolve = r; });

    // Network interception state
    let networkEnabled = false;
    const networkRequests = new Map();  // requestId -> request data
    const networkLog = [];              // Completed request/response pairs

    function send(method, params = {}) {
      return new Promise((res, rej) => {
        const id = messageId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          rej(new Error(`Timeout: ${method}`));
        }, timeout);
        pending.set(id, { resolve: res, reject: rej, timeout: timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());

      // Handle target creation
      if (msg.method === 'Target.targetCreated' && msg.params?.targetInfo?.type === 'page') {
        targetId = msg.params.targetInfo.targetId;
        targetResolve(targetId);
      }

      // Handle Network events for API discovery
      if (networkEnabled && msg.method) {
        handleNetworkEvent(msg.method, msg.params);
      }

      // Handle command responses
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject, timeout: timer } = pending.get(msg.id);
        clearTimeout(timer);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });

    // Network event handlers
    function handleNetworkEvent(method, params) {
      switch (method) {
        case 'Network.requestWillBeSent': {
          const { requestId, request, type, timestamp } = params;
          networkRequests.set(requestId, {
            requestId,
            url: request.url,
            method: request.method,
            headers: request.headers,
            postData: request.postData,
            resourceType: type,
            timestamp,
            status: null,
            responseHeaders: null,
            contentType: null,
            responseSize: 0,
            responseBody: null
          });
          break;
        }

        case 'Network.responseReceived': {
          const { requestId, response } = params;
          const req = networkRequests.get(requestId);
          if (req) {
            req.status = response.status;
            req.responseHeaders = response.headers;
            req.contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
            req.mimeType = response.mimeType;
          }
          break;
        }

        case 'Network.loadingFinished': {
          const { requestId, encodedDataLength } = params;
          const req = networkRequests.get(requestId);
          if (req) {
            req.responseSize = encodedDataLength;
            // Move to completed log
            networkLog.push({ ...req });
            networkRequests.delete(requestId);
          }
          break;
        }

        case 'Network.loadingFailed': {
          const { requestId, errorText } = params;
          const req = networkRequests.get(requestId);
          if (req) {
            req.error = errorText;
            req.status = 0;
            networkLog.push({ ...req });
            networkRequests.delete(requestId);
          }
          break;
        }
      }
    }

    ws.on('error', reject);

    ws.on('open', async () => {
      try {
        // Wait for target
        await Promise.race([
          targetReady,
          new Promise((_, rej) => setTimeout(() => rej(new Error('No target created')), 10000))
        ]);

        // Client API
        const client = {
          ws,
          targetId,
          send,

          // ─────────────────────────────────────────────────────────────
          // Network Interception (for API discovery)
          // ─────────────────────────────────────────────────────────────

          /**
           * Enable network request interception.
           * Call this BEFORE navigating to capture all requests.
           */
          async enableNetwork() {
            await send('Network.enable');
            networkEnabled = true;
          },

          /**
           * Disable network interception.
           */
          async disableNetwork() {
            await send('Network.disable');
            networkEnabled = false;
          },

          /**
           * Get the captured network log.
           * Returns array of completed request/response entries.
           */
          getNetworkLog() {
            return [...networkLog];
          },

          /**
           * Clear the network log.
           */
          clearNetworkLog() {
            networkLog.length = 0;
            networkRequests.clear();
          },

          /**
           * Get response body for a specific request.
           * Must be called before the request data is evicted.
           * @param {string} requestId - The requestId from network log
           */
          async getResponseBody(requestId) {
            try {
              const { body, base64Encoded } = await send('Network.getResponseBody', { requestId });
              return base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
            } catch (err) {
              // Response body may not be available (e.g., cached, streamed, etc.)
              return null;
            }
          },

          /**
           * Get filtered network log for API discovery.
           * Filters to JSON responses that might contain product/offer data.
           */
          getApiCandidates() {
            return networkLog.filter(entry => {
              // Must be successful
              if (entry.status < 200 || entry.status >= 300) return false;

              // Must be JSON
              const ct = (entry.contentType || '').toLowerCase();
              if (!ct.includes('json')) return false;

              // Skip tracking/analytics
              const url = entry.url.toLowerCase();
              if (url.includes('analytics') || url.includes('tracking')) return false;
              if (url.includes('consent') || url.includes('cookie')) return false;
              if (url.includes('recaptcha') || url.includes('captcha')) return false;
              if (url.includes('google-analytics') || url.includes('gtag')) return false;
              if (url.includes('facebook.com') || url.includes('doubleclick')) return false;

              // Skip tiny responses (likely config/status endpoints)
              if (entry.responseSize < 500) return false;

              return true;
            }).map(entry => ({
              url: entry.url,
              method: entry.method,
              status: entry.status,
              content_type: entry.contentType,
              response_size: entry.responseSize,
              request_headers: entry.headers || {},
              resource_type: entry.resourceType
            }));
          },

          // ─────────────────────────────────────────────────────────────
          // Page Navigation & Interaction
          // ─────────────────────────────────────────────────────────────

          async navigate(url, waitMs = 3000) {
            await send('Page.navigate', { url });
            await new Promise(r => setTimeout(r, waitMs));
          },
          
          async screenshot(format = 'png') {
            const { data } = await send('Page.captureScreenshot', { format });
            return Buffer.from(data, 'base64');
          },
          
          async setViewport(width = 1280, height = 800, scale = 1, mobile = false) {
            await send('Emulation.setDeviceMetricsOverride', {
              width, height, deviceScaleFactor: scale, mobile
            });
          },
          
          async evaluate(expression) {
            return send('Runtime.evaluate', { expression });
          },
          
          async scroll(y = 300) {
            await send('Runtime.evaluate', { expression: `window.scrollBy(0, ${y})` });
            await new Promise(r => setTimeout(r, 300));
          },
          
          async click(selector) {
            await send('Runtime.evaluate', { 
              expression: `document.querySelector('${selector}')?.click()` 
            });
          },
          
          async type(selector, text) {
            await send('Runtime.evaluate', {
              expression: `(() => {
                const el = document.querySelector('${selector}');
                if (el) { el.value = '${text}'; el.dispatchEvent(new Event('input')); }
              })()`
            });
          },
          
          async getHTML() {
            const result = await send('Runtime.evaluate', {
              expression: 'document.documentElement.outerHTML'
            });
            return result.result?.value;
          },
          
          async getText() {
            const result = await send('Runtime.evaluate', {
              expression: 'document.body.innerText'
            });
            return result.result?.value;
          },
          
          close() {
            ws.close();
          }
        };
        
        resolve(client);
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = { createClient };

// CLI mode
if (require.main === module) {
  console.log('CDP Client Library - import with: const { createClient } = require("./cdp-client")');
}
