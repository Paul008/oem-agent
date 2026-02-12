/**
 * OEM Agent Container Entry Point
 *
 * This runs inside the Cloudflare Container (Sandbox) and provides:
 * - HTTP server for Worker communication
 * - Health check endpoint
 * - Code execution sandbox environment
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';

const PORT = parseInt(process.env.PORT || '8080', 10);

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
}

interface ExecuteRequest {
  code: string;
  timeout?: number;
}

interface ExecuteResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
}

const startTime = Date.now();

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // CORS headers for Worker communication
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (url.pathname === '/health' || url.pathname === '/') {
    const health: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
    return;
  }

  // Execute code endpoint (sandboxed)
  if (url.pathname === '/execute' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { code, timeout = 30000 } = JSON.parse(body) as ExecuteRequest;
        const startExec = Date.now();

        // Execute code in a sandboxed context
        const result = await executeCode(code, timeout);

        const response: ExecuteResponse = {
          success: true,
          result,
          duration: Date.now() - startExec,
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        const response: ExecuteResponse = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: 0,
        };
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      }
    });
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', path: url.pathname }));
}

/**
 * Execute JavaScript code in a sandboxed context
 */
async function executeCode(code: string, timeout: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Execution timeout after ${timeout}ms`));
    }, timeout);

    try {
      // Create a sandboxed function with limited globals
      const sandboxedFn = new Function(
        'console',
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'Promise',
        'JSON',
        'Math',
        'Date',
        'Array',
        'Object',
        'String',
        'Number',
        'Boolean',
        'Error',
        `return (async () => { ${code} })();`
      );

      const result = sandboxedFn(
        console,
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval,
        Promise,
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Error
      );

      Promise.resolve(result)
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

// Start the server
const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('[Container] Request error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Container] OEM Agent sandbox running on port ${PORT}`);
  console.log(`[Container] Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Container] Received SIGTERM, shutting down...');
  server.close(() => {
    console.log('[Container] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Container] Received SIGINT, shutting down...');
  server.close(() => {
    console.log('[Container] Server closed');
    process.exit(0);
  });
});
