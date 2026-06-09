#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const targets = JSON.parse(readFileSync(new URL('./mitsubishi-clone-targets.json', import.meta.url), 'utf8'));
const deployArg = process.argv.find(arg => arg.startsWith('--preview-origin='));
const slugArg = process.argv.find(arg => arg.startsWith('--slug='));
const previewOrigin = (deployArg?.split('=').slice(1).join('=') || process.env.OEM_DASHBOARD_PREVIEW_ORIGIN || '').replace(/\/$/, '');
const selectedSlug = slugArg?.split('=').slice(1).join('=');
const selectedTargets = selectedSlug ? targets.filter(target => target.modelSlug === selectedSlug) : targets;

if (!previewOrigin) {
  console.error('Usage: node scripts/run-mitsubishi-fidelity.mjs --preview-origin=https://<pages-deploy-origin> [--slug=asx]');
  process.exit(1);
}

if (!selectedTargets.length) {
  console.error(`No Mitsubishi fidelity target found for slug: ${selectedSlug}`);
  process.exit(1);
}

const outputDir = '/private/tmp/oem-fidelity/mitsubishi';
mkdirSync(outputDir, { recursive: true });

for (const target of selectedTargets) {
  const previewUrl = `${previewOrigin}/preview/${target.oemId}-${target.modelSlug}?view=production`;
  const result = spawnSync(process.execPath, [
    'scripts/oem-fidelity-report.mjs',
    '--source-url',
    target.sourceUrl,
    '--preview-url',
    previewUrl,
    '--output-dir',
    outputDir,
    '--fail-on',
    'critical',
  ], { stdio: 'inherit' });

  if (result.status !== 0)
    process.exit(result.status || 1);
}
