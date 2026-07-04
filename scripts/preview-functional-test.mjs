#!/usr/bin/env node
/**
 * qa:functional — drives the deployed preview and exercises every interaction
 * the recognition layer stamped (manifest `interactions`). The stamped
 * attributes ARE the test plan: tabs must switch, accordions toggle,
 * carousels advance, galleries swap.
 *
 * Usage:
 *   node scripts/preview-functional-test.mjs --slug volkswagen-au-amarok \
 *     [--base https://oem-dashboard.pages.dev/preview] \
 *     [--manifest-url https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/{slug}/production-manifest] \
 *     [--bearer <token>] [--interactions-json '[{"id":"cr-1","type":"tabs"}]']
 */
import puppeteer from 'puppeteer';

import { launchQaBrowser, pickRenderedFrame, readNext, settlePage } from './lib/qa-browser.mjs';

const argv = process.argv.slice(2);
let slug = '';
let base = 'https://oem-dashboard.pages.dev/preview';
let manifestUrl = '';
let bearer = '';
let interactionsJson = '';
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--slug') slug = readNext(argv, ++i, arg);
  else if (arg === '--base') base = readNext(argv, ++i, arg);
  else if (arg === '--manifest-url') manifestUrl = readNext(argv, ++i, arg);
  else if (arg === '--bearer') bearer = readNext(argv, ++i, arg);
  else if (arg === '--interactions-json') interactionsJson = readNext(argv, ++i, arg);
}
if (!slug) {
  console.error('required: --slug <oem-slug>');
  process.exit(1);
}

async function loadInteractions() {
  if (interactionsJson) return JSON.parse(interactionsJson);
  const url = manifestUrl || `https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/${slug}/production-manifest`;
  const res = await fetch(url, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
  if (!res.ok) {
    console.error(`manifest fetch failed (${res.status}) — pass --interactions-json or --bearer`);
    process.exit(1);
  }
  const manifest = await res.json();
  return manifest.interactions ?? [];
}

const CHECKS = {
  'tabs': async (frame, id) => {
    return frame.evaluate((regionId) => {
      const root = document.querySelector(`[data-clone-region-id="${regionId}"]`);
      if (!root) return { ok: false, detail: 'region not found' };
      const trigger = root.querySelector('[data-clone-tab="1"]');
      const panel0 = root.querySelector('[data-clone-panel="0"]');
      const panel1 = root.querySelector('[data-clone-panel="1"]');
      if (!trigger || !panel0 || !panel1) return { ok: false, detail: 'triggers/panels missing' };
      trigger.click();
      const p0Hidden = getComputedStyle(panel0).display === 'none';
      const p1Visible = getComputedStyle(panel1).display !== 'none';
      return { ok: p0Hidden && p1Visible, detail: `panel0 hidden=${p0Hidden} panel1 visible=${p1Visible}` };
    }, id);
  },
  'accordion': async (frame, id) => {
    return frame.evaluate((regionId) => {
      const root = document.querySelector(`[data-clone-region-id="${regionId}"]`);
      if (!root) return { ok: false, detail: 'region not found' };
      const trigger = root.querySelector('[data-clone-acc-trigger]');
      if (!trigger) return { ok: false, detail: 'trigger missing' };
      const index = trigger.getAttribute('data-clone-acc-trigger');
      const panel = root.querySelector(`[data-clone-acc-panel="${index}"]`);
      if (!panel) return { ok: false, detail: 'panel missing' };
      const before = getComputedStyle(panel).display;
      trigger.click();
      const after = getComputedStyle(panel).display;
      return { ok: before !== after, detail: `display ${before} -> ${after}` };
    }, id);
  },
  'carousel': async (frame, id) => {
    return frame.evaluate((regionId) => {
      const root = document.querySelector(`[data-clone-region-id="${regionId}"]`);
      if (!root) return { ok: false, detail: 'region not found' };
      const track = root.querySelector('[data-clone-track]');
      const next = root.querySelector('[data-clone-next]');
      if (!track) return { ok: false, detail: 'track missing' };
      const before = getComputedStyle(track).transform;
      if (next) next.click();
      else return { ok: root.getAttribute('data-clone-carousel-index') === '0', detail: 'no next control; index attr present' };
      const after = getComputedStyle(track).transform;
      const indexAdvanced = root.getAttribute('data-clone-carousel-index') === '1';
      return { ok: before !== after || indexAdvanced, detail: `transform changed=${before !== after} index=${root.getAttribute('data-clone-carousel-index')}` };
    }, id);
  },
  'gallery-lightbox': async (frame, id) => {
    return frame.evaluate((regionId) => {
      const root = document.querySelector(`[data-clone-region-id="${regionId}"]`);
      if (!root) return { ok: false, detail: 'region not found' };
      const main = root.querySelector('[data-clone-gallery-main]');
      const thumb = root.querySelector('[data-clone-gallery-thumb="1"]') || root.querySelector('[data-clone-gallery-thumb]');
      if (!main || !thumb) return { ok: false, detail: 'main/thumb missing' };
      const before = main.getAttribute('src');
      thumb.click();
      const after = main.getAttribute('src');
      return { ok: before !== after, detail: `src changed=${before !== after}` };
    }, id);
  },
};

const interactions = await loadInteractions();
if (interactions.length === 0) {
  console.error('no interactions in manifest — nothing to test (is the page recompiled with the clone runtime?)');
  process.exit(1);
}

const browser = await launchQaBrowser(puppeteer);
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  const url = `${base}/${slug}?view=production`;
  console.log(`URL: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90_000 });
  await settlePage(page, 7000);
  const frame = await pickRenderedFrame(page);
  if (!frame) {
    console.error('✗ no rendered preview frame found');
    process.exit(1);
  }

  let failures = 0;
  for (const entry of interactions) {
    const check = CHECKS[entry.type];
    if (!check) {
      console.log(`- ${entry.id} (${entry.type}): no functional check defined, skipped`);
      continue;
    }
    const result = await check(frame, entry.id);
    console.log(`${result.ok ? '✓' : '✗'} ${entry.id} (${entry.type}): ${result.detail}`);
    if (!result.ok) failures += 1;
  }
  console.log(failures === 0 ? 'ALL INTERACTIONS PASS' : `${failures} interaction(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  await browser.close();
}
