#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const targets = JSON.parse(readFileSync(new URL('./mitsubishi-clone-targets.json', import.meta.url), 'utf8'));
const args = new Set(process.argv.slice(2));
const baseUrlArg = process.argv.find(arg => arg.startsWith('--base-url='));
const authTokenArg = process.argv.find(arg => arg.startsWith('--auth-token='));
const slugArg = process.argv.find(arg => arg.startsWith('--slug='));
const baseUrl = (baseUrlArg?.split('=').slice(1).join('=') || process.env.OEM_AGENT_BASE_URL || '').replace(/\/$/, '');
const authToken = authTokenArg?.split('=').slice(1).join('=') || process.env.OEM_AGENT_AUTH_TOKEN || '';
const selectedSlug = slugArg?.split('=').slice(1).join('=');

if (!baseUrl) {
  console.error('Usage: node scripts/clone-mitsubishi-pages.mjs --base-url=https://<worker-api-origin> [--auth-token=token] [--slug=asx] [--continue-on-error]');
  process.exit(1);
}

const selectedTargets = selectedSlug
  ? targets.filter(target => target.modelSlug === selectedSlug)
  : targets;

if (!selectedTargets.length) {
  console.error(`No Mitsubishi clone target found for slug: ${selectedSlug}`);
  process.exit(1);
}

const results = [];
for (const target of selectedTargets) {
  const endpoint = `${baseUrl}/api/v1/oem-agent/admin/clone-page/${target.oemId}/${target.modelSlug}`;
  const headers = { 'Content-Type': 'application/json' };
  if (authToken)
    headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ source_url: target.sourceUrl }),
  });
  const body = await response.json().catch(() => ({}));
  const result = {
    modelSlug: target.modelSlug,
    sourceUrl: target.sourceUrl,
    status: response.status,
    success: response.ok && body.success !== false,
    error: body.error || body.message || null,
  };
  results.push(result);
  console.log(JSON.stringify(result));
  if (!result.success && !args.has('--continue-on-error'))
    process.exit(1);
}

const failed = results.filter(result => !result.success);
if (failed.length) {
  console.error(`${failed.length}/${results.length} Mitsubishi clone requests failed`);
  process.exit(1);
}
