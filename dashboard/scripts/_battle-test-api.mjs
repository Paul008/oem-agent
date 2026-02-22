#!/usr/bin/env node
/**
 * Battle Test: Worker API endpoints
 * Tests all OEM Agent worker API endpoints for correct HTTP method handling.
 *
 * Usage:
 *   node dashboard/scripts/_battle-test-api.mjs [worker-url]
 *
 * Default worker URL: https://oem-agent.adme-dev.workers.dev
 */

const WORKER_BASE = process.argv[2] || 'https://oem-agent.adme-dev.workers.dev';
const TEST_OEM = 'kia-au';
const TEST_MODEL = 'sportage';

console.log(`\n🔫 Battle Test: Worker API\n`);
console.log(`Worker URL: ${WORKER_BASE}`);
console.log(`Test OEM:   ${TEST_OEM}`);
console.log(`Test Model: ${TEST_MODEL}\n`);

const tests = [
  // GET endpoints (read-only, safe to test)
  { name: 'Health check',       method: 'GET',  path: '/api/v1/oem-agent/health' },
  { name: 'List pages',         method: 'GET',  path: `/api/v1/oem-agent/pages?oemId=${TEST_OEM}` },
  { name: 'Get page by slug',   method: 'GET',  path: `/api/v1/oem-agent/pages/${TEST_OEM}-${TEST_MODEL}` },
  { name: 'Design memory',      method: 'GET',  path: `/api/v1/oem-agent/design-memory/${TEST_OEM}` },
  { name: 'Extraction runs',    method: 'GET',  path: `/api/v1/oem-agent/extraction-runs?oemId=${TEST_OEM}&limit=5` },
  { name: 'List OEMs',          method: 'GET',  path: '/api/v1/oem-agent/oems' },
  { name: 'OEM models',         method: 'GET',  path: `/api/v1/oem-agent/models/${TEST_OEM}` },
  { name: 'OEM products',       method: 'GET',  path: `/api/v1/oem-agent/products/${TEST_OEM}` },
  { name: 'OEM accessories',    method: 'GET',  path: `/api/v1/oem-agent/accessories/${TEST_OEM}` },
  { name: 'OEM colors',         method: 'GET',  path: `/api/v1/oem-agent/colors/${TEST_OEM}` },
  { name: 'OEM pricing',        method: 'GET',  path: `/api/v1/oem-agent/pricing/${TEST_OEM}` },
  { name: 'OEM offers',         method: 'GET',  path: `/api/v1/oem-agent/offers/${TEST_OEM}` },
  { name: 'OEM banners',        method: 'GET',  path: `/api/v1/oem-agent/banners/${TEST_OEM}` },
  { name: 'Source pages',       method: 'GET',  path: `/api/v1/oem-agent/admin/source-pages/${TEST_OEM}` },

  // POST endpoints — probe with OPTIONS first, then HEAD to check method support
  // These are marked as probes only (don't actually execute mutations)
  { name: 'Clone page (OPTIONS)',      method: 'OPTIONS', path: `/api/v1/oem-agent/admin/clone-page/${TEST_OEM}/${TEST_MODEL}` },
  { name: 'Structure page (OPTIONS)',  method: 'OPTIONS', path: `/api/v1/oem-agent/admin/structure-page/${TEST_OEM}/${TEST_MODEL}` },
  { name: 'Generate page (OPTIONS)',   method: 'OPTIONS', path: `/api/v1/oem-agent/admin/generate-page/${TEST_OEM}/${TEST_MODEL}` },
  { name: 'Adaptive pipeline (OPTIONS)', method: 'OPTIONS', path: `/api/v1/oem-agent/admin/adaptive-pipeline/${TEST_OEM}/${TEST_MODEL}` },
  { name: 'Update sections (OPTIONS)', method: 'OPTIONS', path: `/api/v1/oem-agent/admin/update-sections/${TEST_OEM}/${TEST_MODEL}` },
  { name: 'Regenerate section (OPTIONS)', method: 'OPTIONS', path: `/api/v1/oem-agent/admin/regenerate-section/${TEST_OEM}/${TEST_MODEL}` },
  { name: 'Design capture (OPTIONS)',  method: 'OPTIONS', path: `/api/v1/oem-agent/admin/design-capture/${TEST_OEM}` },
  { name: 'Crawl (OPTIONS)',           method: 'OPTIONS', path: `/api/v1/oem-agent/admin/crawl/${TEST_OEM}` },
];

let passed = 0;
let failed = 0;
let warnings = 0;

for (const test of tests) {
  try {
    const url = `${WORKER_BASE}${test.path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      method: test.method,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Origin': 'https://oem-dashboard.pages.dev',
      },
    });
    clearTimeout(timeout);

    const status = res.status;
    let icon, label;

    if (test.method === 'OPTIONS') {
      // OPTIONS should return 204 (CORS preflight) or 200
      if (status === 204 || status === 200) {
        icon = '✅';
        label = 'CORS OK';
        passed++;
      } else if (status === 405) {
        icon = '❌';
        label = '405 METHOD NOT ALLOWED';
        failed++;
      } else {
        icon = '⚠️';
        label = `${status}`;
        warnings++;
      }
      const allow = res.headers.get('access-control-allow-methods') || 'none';
      console.log(`${icon} ${test.name.padEnd(38)} ${String(status).padEnd(4)} ${label} (Allow: ${allow})`);
    } else {
      // GET endpoints
      if (status >= 200 && status < 300) {
        icon = '✅';
        label = 'OK';
        passed++;
      } else if (status === 401 || status === 403) {
        icon = '🔒';
        label = 'AUTH REQUIRED (expected in production)';
        passed++; // Auth rejection is expected
      } else if (status === 404) {
        icon = '⚠️';
        label = 'NOT FOUND';
        warnings++;
      } else if (status === 405) {
        icon = '❌';
        label = '405 METHOD NOT ALLOWED';
        failed++;
      } else {
        icon = '⚠️';
        label = `${status}`;
        warnings++;
      }

      // Try to read a snippet of the response
      let snippet = '';
      try {
        const text = await res.text();
        if (text.length > 0) {
          const parsed = JSON.parse(text);
          if (parsed.error) snippet = ` → ${parsed.error}`;
          else if (Array.isArray(parsed)) snippet = ` → ${parsed.length} items`;
          else if (parsed.count !== undefined) snippet = ` → ${parsed.count} items`;
          else if (parsed.status) snippet = ` → ${parsed.status}`;
        }
      } catch {}

      console.log(`${icon} ${test.method.padEnd(7)} ${test.name.padEnd(30)} ${String(status).padEnd(4)} ${label}${snippet}`);
    }
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'TIMEOUT (15s)' : err.message;
    console.log(`❌ ${test.method.padEnd(7)} ${test.name.padEnd(30)} ERR  ${msg}`);
    failed++;
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

if (failed > 0) {
  console.log(`\n⚠️  Failures detected! Common causes:`);
  console.log(`   1. Worker not deployed with latest code → run: npx wrangler deploy`);
  console.log(`   2. CF Access auth blocking requests → check CF Access policies`);
  console.log(`   3. Route not registered → check src/routes/oem-agent.ts`);
}

console.log();
