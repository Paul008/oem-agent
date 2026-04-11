import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { findExistingMoltbotProcess } from '../gateway';
import { createSupabaseClient } from '../utils/supabase';

/**
 * Debug routes for inspecting container state
 * Note: These routes should be protected by Cloudflare Access middleware
 * when mounted in the main app
 */
const debug = new Hono<AppEnv>();

// GET /debug/version - Returns version info from inside the container
debug.get('/version', async (c) => {
  const sandbox = c.get('sandbox');
  try {
    // Get OpenClaw version
    const versionProcess = await sandbox.startProcess('openclaw --version');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const versionLogs = await versionProcess.getLogs();
    const moltbotVersion = (versionLogs.stdout || versionLogs.stderr || '').trim();

    // Get node version
    const nodeProcess = await sandbox.startProcess('node --version');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const nodeLogs = await nodeProcess.getLogs();
    const nodeVersion = (nodeLogs.stdout || '').trim();

    return c.json({
      moltbot_version: moltbotVersion,
      node_version: nodeVersion,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ status: 'error', message: `Failed to get version info: ${errorMessage}` }, 500);
  }
});

// GET /debug/processes - List all processes with optional logs
debug.get('/processes', async (c) => {
  const sandbox = c.get('sandbox');
  try {
    const processes = await sandbox.listProcesses();
    const includeLogs = c.req.query('logs') === 'true';

    const processData = await Promise.all(
      processes.map(async (p) => {
        const data: Record<string, unknown> = {
          id: p.id,
          command: p.command,
          status: p.status,
          startTime: p.startTime?.toISOString(),
          endTime: p.endTime?.toISOString(),
          exitCode: p.exitCode,
        };

        if (includeLogs) {
          try {
            const logs = await p.getLogs();
            data.stdout = logs.stdout || '';
            data.stderr = logs.stderr || '';
          } catch {
            data.logs_error = 'Failed to retrieve logs';
          }
        }

        return data;
      }),
    );

    // Sort by status (running first, then starting, completed, failed)
    // Within each status, sort by startTime descending (newest first)
    const statusOrder: Record<string, number> = {
      running: 0,
      starting: 1,
      completed: 2,
      failed: 3,
    };

    processData.sort((a, b) => {
      const statusA = statusOrder[a.status as string] ?? 99;
      const statusB = statusOrder[b.status as string] ?? 99;
      if (statusA !== statusB) {
        return statusA - statusB;
      }
      // Within same status, sort by startTime descending
      const timeA = (a.startTime as string) || '';
      const timeB = (b.startTime as string) || '';
      return timeB.localeCompare(timeA);
    });

    return c.json({ count: processes.length, processes: processData });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /debug/restart-gateway - Kill existing gateway process to trigger a fresh start
debug.post('/restart-gateway', async (c) => {
  const sandbox = c.get('sandbox');
  try {
    const existing = await findExistingMoltbotProcess(sandbox);
    if (!existing) {
      return c.json({ status: 'no_process', message: 'No gateway process found' });
    }

    const processId = existing.id;
    console.log('[DEBUG] Killing gateway process:', processId);
    await existing.kill();

    return c.json({
      status: 'killed',
      process_id: processId,
      message: 'Gateway process killed. Next request will start a fresh one with current env vars.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /debug/destroy-container - Destroy sandbox container to force new image on next request
debug.post('/destroy-container', async (c) => {
  const sandbox = c.get('sandbox');
  try {
    console.log('[DEBUG] Destroying sandbox container...');
    await sandbox.destroy();
    return c.json({ status: 'destroyed', message: 'Container destroyed. Next request will pull new image.' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// GET /debug/gateway-api - Probe the moltbot gateway HTTP API
debug.get('/gateway-api', async (c) => {
  const sandbox = c.get('sandbox');
  const path = c.req.query('path') || '/';
  const MOLTBOT_PORT = 18789;

  try {
    const url = `http://localhost:${MOLTBOT_PORT}${path}`;
    const response = await sandbox.containerFetch(new Request(url), MOLTBOT_PORT);
    const contentType = response.headers.get('content-type') || '';

    let body: string | object;
    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    return c.json({
      path,
      status: response.status,
      contentType,
      body,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage, path }, 500);
  }
});

// GET /debug/cli - Test OpenClaw CLI commands
debug.get('/cli', async (c) => {
  const sandbox = c.get('sandbox');
  const cmd = c.req.query('cmd') || 'openclaw --help';

  try {
    const proc = await sandbox.startProcess(cmd);

    // Wait longer for command to complete
    let attempts = 0;
    while (attempts < 30) {
      // eslint-disable-next-line no-await-in-loop -- intentional sequential polling
      await new Promise((r) => setTimeout(r, 500));
      if (proc.status !== 'running') break;
      attempts++;
    }

    const logs = await proc.getLogs();
    return c.json({
      command: cmd,
      status: proc.status,
      exitCode: proc.exitCode,
      attempts,
      stdout: logs.stdout || '',
      stderr: logs.stderr || '',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage, command: cmd }, 500);
  }
});

// GET /debug/logs - Returns container logs for debugging
debug.get('/logs', async (c) => {
  const sandbox = c.get('sandbox');
  try {
    const processId = c.req.query('id');
    let process = null;

    if (processId) {
      const processes = await sandbox.listProcesses();
      process = processes.find((p) => p.id === processId);
      if (!process) {
        return c.json(
          {
            status: 'not_found',
            message: `Process ${processId} not found`,
            stdout: '',
            stderr: '',
          },
          404,
        );
      }
    } else {
      process = await findExistingMoltbotProcess(sandbox);
      if (!process) {
        return c.json({
          status: 'no_process',
          message: 'No Moltbot process is currently running',
          stdout: '',
          stderr: '',
        });
      }
    }

    const logs = await process.getLogs();
    return c.json({
      status: 'ok',
      process_id: process.id,
      process_status: process.status,
      stdout: logs.stdout || '',
      stderr: logs.stderr || '',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        status: 'error',
        message: `Failed to get logs: ${errorMessage}`,
        stdout: '',
        stderr: '',
      },
      500,
    );
  }
});

// GET /debug/ws-test - Interactive WebSocket debug page
debug.get('/ws-test', async (c) => {
  const host = c.req.header('host') || 'localhost';
  const protocol = c.req.header('x-forwarded-proto') || 'https';
  const wsProtocol = protocol === 'https' ? 'wss' : 'ws';

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>WebSocket Debug</title>
  <style>
    body { font-family: monospace; padding: 20px; background: #1a1a1a; color: #0f0; }
    #log { white-space: pre-wrap; background: #000; padding: 10px; height: 400px; overflow-y: auto; border: 1px solid #333; }
    button { margin: 5px; padding: 10px; }
    input { padding: 10px; width: 300px; }
    .error { color: #f00; }
    .sent { color: #0ff; }
    .received { color: #0f0; }
    .info { color: #ff0; }
  </style>
</head>
<body>
  <h1>WebSocket Debug Tool</h1>
  <div>
    <button id="connect">Connect</button>
    <button id="disconnect" disabled>Disconnect</button>
    <button id="clear">Clear Log</button>
  </div>
  <div style="margin: 10px 0;">
    <input id="message" placeholder="JSON message to send..." />
    <button id="send" disabled>Send</button>
  </div>
  <div style="margin: 10px 0;">
    <button id="sendConnect" disabled>Send Connect Frame</button>
  </div>
  <div id="log"></div>
  
  <script>
    const wsUrl = '${wsProtocol}://${host}/';
    let ws = null;
    
    const log = (msg, className = '') => {
      const logEl = document.getElementById('log');
      const time = new Date().toISOString().substr(11, 12);
      logEl.innerHTML += '<span class="' + className + '">[' + time + '] ' + msg + '</span>\\n';
      logEl.scrollTop = logEl.scrollHeight;
    };
    
    document.getElementById('connect').onclick = () => {
      log('Connecting to ' + wsUrl + '...', 'info');
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        log('Connected!', 'info');
        document.getElementById('connect').disabled = true;
        document.getElementById('disconnect').disabled = false;
        document.getElementById('send').disabled = false;
        document.getElementById('sendConnect').disabled = false;
      };
      
      ws.onmessage = (e) => {
        log('RECV: ' + e.data, 'received');
        try {
          const parsed = JSON.parse(e.data);
          log('  Parsed: ' + JSON.stringify(parsed, null, 2), 'received');
        } catch {}
      };
      
      ws.onerror = (e) => {
        log('ERROR: ' + JSON.stringify(e), 'error');
      };
      
      ws.onclose = (e) => {
        log('Closed: code=' + e.code + ' reason=' + e.reason, 'info');
        document.getElementById('connect').disabled = false;
        document.getElementById('disconnect').disabled = true;
        document.getElementById('send').disabled = true;
        document.getElementById('sendConnect').disabled = true;
        ws = null;
      };
    };
    
    document.getElementById('disconnect').onclick = () => {
      if (ws) ws.close();
    };
    
    document.getElementById('clear').onclick = () => {
      document.getElementById('log').innerHTML = '';
    };
    
    document.getElementById('send').onclick = () => {
      const msg = document.getElementById('message').value;
      if (ws && msg) {
        log('SEND: ' + msg, 'sent');
        ws.send(msg);
      }
    };
    
    document.getElementById('sendConnect').onclick = () => {
      if (!ws) return;
      const connectFrame = {
        type: 'req',
        id: 'debug-' + Date.now(),
        method: 'connect',
        params: {
          minProtocol: 1,
          maxProtocol: 1,
          client: {
            id: 'debug-tool',
            displayName: 'Debug Tool',
            version: '1.0.0',
            mode: 'webchat',
            platform: 'web'
          },
          role: 'operator',
          scopes: []
        }
      };
      const msg = JSON.stringify(connectFrame);
      log('SEND Connect Frame: ' + msg, 'sent');
      ws.send(msg);
    };
    
    document.getElementById('message').onkeypress = (e) => {
      if (e.key === 'Enter') document.getElementById('send').click();
    };
  </script>
</body>
</html>`;

  return c.html(html);
});

// GET /debug/env - Show environment configuration (sanitized)
debug.get('/env', async (c) => {
  return c.json({
    has_anthropic_key: !!c.env.ANTHROPIC_API_KEY,
    has_openai_key: !!c.env.OPENAI_API_KEY,
    has_gateway_token: !!c.env.MOLTBOT_GATEWAY_TOKEN,
    has_r2_access_key: !!c.env.R2_ACCESS_KEY_ID,
    has_r2_secret_key: !!c.env.R2_SECRET_ACCESS_KEY,
    has_cf_account_id: !!c.env.CF_ACCOUNT_ID,
    dev_mode: c.env.DEV_MODE,
    debug_routes: c.env.DEBUG_ROUTES,
    bind_mode: 'lan',
    cf_access_team_domain: c.env.CF_ACCESS_TEAM_DOMAIN,
    has_cf_access_aud: !!c.env.CF_ACCESS_AUD,
  });
});

// GET /debug/container-config - Read the moltbot config from inside the container
debug.get('/container-config', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    const proc = await sandbox.startProcess('cat /root/.openclaw/openclaw.json');

    let attempts = 0;
    while (attempts < 10) {
      // eslint-disable-next-line no-await-in-loop -- intentional sequential polling
      await new Promise((r) => setTimeout(r, 200));
      if (proc.status !== 'running') break;
      attempts++;
    }

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const stderr = logs.stderr || '';

    let config = null;
    try {
      config = JSON.parse(stdout);
    } catch {
      // Not valid JSON
    }

    return c.json({
      status: proc.status,
      exitCode: proc.exitCode,
      config,
      raw: config ? undefined : stdout,
      stderr,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// GET /debug/data-gaps?oem=<id> — surface sync data gaps that break the dealer API.
// Flags: models with no products, models with products but no variant_colors,
// and OEM image hosts missing from the media proxy allowlist.
debug.get('/data-gaps', async (c) => {
  const oemParam = c.req.query('oem');
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  try {
    let oemIds: string[];
    if (oemParam) {
      oemIds = [oemParam.includes('-') ? oemParam : `${oemParam}-au`];
    } else {
      const { data: oems } = await supabase.from('oems').select('id').eq('is_active', true);
      oemIds = (oems || []).map((o: any) => o.id);
    }

    const results: Record<string, any> = {};

    for (const oemId of oemIds) {
      const [modelsRes, productsRes] = await Promise.all([
        supabase.from('vehicle_models')
          .select('id, name, slug, model_year')
          .eq('oem_id', oemId)
          .eq('is_active', true),
        supabase.from('products')
          .select('id, title, model_id')
          .eq('oem_id', oemId),
      ]);

      const models = (modelsRes.data || []) as any[];
      const products = (productsRes.data || []) as any[];

      const modelById = new Map(models.map((m) => [m.id, m]));
      const modelsByNameLen = [...models]
        .filter((m) => (m.name?.length || 0) >= 3)
        .sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0));

      // Match products to models using the same algorithm as /catalog
      const productsByModelId: Record<string, any[]> = {};
      const unmatched: any[] = [];
      for (const p of products) {
        const title = (p.title || '').toLowerCase();
        let modelId: string | null = null;
        for (const m of modelsByNameLen) {
          if (title.startsWith((m.name || '').toLowerCase())) { modelId = m.id; break; }
        }
        if (!modelId && p.model_id && modelById.has(p.model_id)) modelId = p.model_id;
        if (modelId) (productsByModelId[modelId] ||= []).push(p);
        else unmatched.push({ id: p.id, title: p.title, model_id: p.model_id });
      }

      const orphanModels = models
        .filter((m) => !productsByModelId[m.id] || productsByModelId[m.id].length === 0)
        .map((m) => ({ name: m.name, slug: m.slug, model_year: m.model_year }));

      // Models whose products exist but have zero variant_colors
      const productIdsWithModels = Object.values(productsByModelId).flat().map((p) => p.id);
      let modelsMissingColors: any[] = [];
      if (productIdsWithModels.length > 0) {
        const { data: colorRows } = await supabase
          .from('variant_colors')
          .select('product_id')
          .in('product_id', productIdsWithModels);
        const productIdsWithColors = new Set((colorRows || []).map((c: any) => c.product_id));
        modelsMissingColors = models
          .filter((m) => {
            const ps = productsByModelId[m.id];
            if (!ps || ps.length === 0) return false; // already in orphanModels
            return ps.every((p) => !productIdsWithColors.has(p.id));
          })
          .map((m) => ({ name: m.name, slug: m.slug, product_count: productsByModelId[m.id].length }));
      }

      // OEM hosts that appear in variant_colors.hero_image_url
      const { data: sampleColors } = await supabase
        .from('variant_colors')
        .select('hero_image_url')
        .in('product_id', products.map((p) => p.id).slice(0, 500))
        .not('hero_image_url', 'is', null);

      const hosts = new Set<string>();
      for (const row of (sampleColors || []) as any[]) {
        if (!row.hero_image_url || !row.hero_image_url.startsWith('http')) continue;
        try { hosts.add(new URL(row.hero_image_url).host); } catch { /* skip */ }
      }

      results[oemId] = {
        totals: {
          models: models.length,
          products: products.length,
          models_with_products: Object.keys(productsByModelId).length,
          unmatched_products: unmatched.length,
        },
        orphan_models: orphanModels,
        models_missing_variant_colors: modelsMissingColors,
        unmatched_products: unmatched.slice(0, 10),
        image_hosts_seen: [...hosts].sort(),
      };
    }

    return c.json({ ok: true, results });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DEBUG] data-gaps failed:', errorMessage);
    return c.json({ error: errorMessage }, 500);
  }
});

export { debug };
