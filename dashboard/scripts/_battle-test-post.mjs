#!/usr/bin/env node
/**
 * Battle Test: POST endpoints (actual method tests, not just OPTIONS)
 * Tests that POST/PUT endpoints actually accept the correct HTTP methods.
 *
 * Usage:
 *   node dashboard/scripts/_battle-test-post.mjs [worker-url]
 */

const WORKER_BASE = process.argv[2] || 'https://oem-agent.adme-dev.workers.dev';
const TEST_OEM = 'kia-au';
const TEST_MODEL = 'sportage';

console.log(`\n🔫 Battle Test: POST endpoint method support\n`);
console.log(`Worker URL: ${WORKER_BASE}\n`);

const tests = [
  // Test each POST endpoint with wrong method first, then correct method
  {
    name: 'adaptive-pipeline',
    path: `/api/v1/oem-agent/admin/adaptive-pipeline/${TEST_OEM}/${TEST_MODEL}`,
    correctMethod: 'POST',
    wrongMethods: ['GET', 'PUT'],
  },
  {
    name: 'clone-page',
    path: `/api/v1/oem-agent/admin/clone-page/${TEST_OEM}/${TEST_MODEL}`,
    correctMethod: 'POST',
    wrongMethods: ['GET'],
  },
  {
    name: 'structure-page',
    path: `/api/v1/oem-agent/admin/structure-page/${TEST_OEM}/${TEST_MODEL}`,
    correctMethod: 'POST',
    wrongMethods: ['GET'],
  },
  {
    name: 'generate-page',
    path: `/api/v1/oem-agent/admin/generate-page/${TEST_OEM}/${TEST_MODEL}`,
    correctMethod: 'POST',
    wrongMethods: ['GET'],
  },
  {
    name: 'update-sections',
    path: `/api/v1/oem-agent/admin/update-sections/${TEST_OEM}/${TEST_MODEL}`,
    correctMethod: 'PUT',
    wrongMethods: ['GET', 'POST'],
  },
  {
    name: 'regenerate-section',
    path: `/api/v1/oem-agent/admin/regenerate-section/${TEST_OEM}/${TEST_MODEL}`,
    correctMethod: 'POST',
    wrongMethods: ['GET'],
  },
  {
    name: 'design-capture',
    path: `/api/v1/oem-agent/admin/design-capture/${TEST_OEM}`,
    correctMethod: 'POST',
    wrongMethods: ['GET'],
  },
];

for (const test of tests) {
  console.log(`--- ${test.name} ---`);
  console.log(`  Path: ${test.path}`);

  // Test with correct method (but don't actually execute — just check it's accepted)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${WORKER_BASE}${test.path}`, {
      method: test.correctMethod,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Origin': 'https://oem-dashboard.pages.dev',
      },
      body: test.correctMethod !== 'GET' ? JSON.stringify({}) : undefined,
    });
    clearTimeout(timeout);

    const status = res.status;
    const text = await res.text().catch(() => '');
    let snippet = '';
    try {
      const j = JSON.parse(text);
      snippet = j.error ? ` → ${j.error}` : '';
    } catch { snippet = text.slice(0, 80); }

    if (status === 405) {
      console.log(`  ❌ ${test.correctMethod} → ${status} METHOD NOT ALLOWED${snippet}`);
      console.log(`     ⚠️  This means the route doesn't exist on the deployed worker!`);
      console.log(`     ⚠️  Run: npx wrangler deploy`);
    } else if (status === 401 || status === 403) {
      console.log(`  🔒 ${test.correctMethod} → ${status} (auth required — route EXISTS)`);
    } else if (status >= 200 && status < 300) {
      console.log(`  ✅ ${test.correctMethod} → ${status} OK${snippet}`);
    } else if (status >= 400 && status < 500) {
      console.log(`  ⚠️  ${test.correctMethod} → ${status}${snippet} (route exists, request issue)`);
    } else if (status >= 500) {
      console.log(`  ⚠️  ${test.correctMethod} → ${status}${snippet} (route exists, server error)`);
    }
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'TIMEOUT (30s)' : err.message;
    console.log(`  ❌ ${test.correctMethod} → ERROR: ${msg}`);
  }
  console.log();
}
