/**
 * One-shot repair: rewrite ford-au `source_url` values in `vehicle_models`
 * and `products` to the public showroom URL derived from the canonical
 * path in `scripts/ford-vehiclesmenu.json`.
 *
 * Background: the original populate script stored Ford's internal AEM CMS
 * paths (/content/ecomm-img/au/en_au/home/<cat>/<model>.html) as
 * source_url. A later ad-hoc fix flattened vehicle_models URLs to
 * /showroom/<slug>/ (missing the category), while products kept the raw
 * CMS path. Neither form matches the live public URL, so the page-builder
 * ends up scraping the wrong content.
 *
 * Run:  pnpm tsx scripts/fix-ford-urls.ts [--apply]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const APPLY = process.argv.includes('--apply');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function fordPublicUrl(p: string | undefined | null): string | null {
  if (!p) return null;
  const m = p.match(/^\/content\/ecomm-img\/au\/en_au\/home\/(.+)\.html$/);
  return m ? `https://www.ford.com.au/showroom/${m[1]}/` : null;
}

interface Nameplate { name: string; code: string; path: string }

function loadMenuMap(): Map<string, string> {
  const file = path.resolve(__dirname, 'ford-vehiclesmenu.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{ nameplates?: Nameplate[] }>;
  const map = new Map<string, string>();
  for (const cat of data) {
    for (const np of cat.nameplates ?? []) {
      const url = fordPublicUrl(np.path);
      if (!url) continue;
      const slug = slugify(np.name);
      if (!map.has(slug)) map.set(slug, url);
    }
  }
  return map;
}

async function main() {
  const menu = loadMenuMap();
  console.log(`Loaded ${menu.size} canonical URLs from ford-vehiclesmenu.json\n`);

  // --- vehicle_models ---
  const { data: models, error: mErr } = await s
    .from('vehicle_models')
    .select('id, slug, name, source_url')
    .eq('oem_id', 'ford-au')
    .order('slug');
  if (mErr) throw mErr;

  const modelUpdates: Array<{ id: string; slug: string; from: string; to: string }> = [];
  const modelUnmatched: Array<{ slug: string; name: string; source_url: string }> = [];

  for (const m of models ?? []) {
    const target = menu.get(m.slug);
    if (!target) {
      modelUnmatched.push({ slug: m.slug, name: m.name, source_url: m.source_url ?? '' });
      continue;
    }
    if (m.source_url !== target) {
      modelUpdates.push({ id: m.id, slug: m.slug, from: m.source_url ?? '', to: target });
    }
  }

  console.log('=== vehicle_models ===');
  console.table(modelUpdates.map((u) => ({ slug: u.slug, from: u.from, to: u.to })));
  if (modelUnmatched.length) {
    console.log('\n  Unmatched (no entry in vehiclesmenu.json — left as-is):');
    console.table(modelUnmatched);
  }

  // --- products (keyed by model_id → fixed URL) ---
  const modelIdToUrl = new Map<string, string>();
  for (const m of models ?? []) {
    const target = menu.get(m.slug);
    if (target) modelIdToUrl.set(m.id, target);
  }

  const { data: products, error: pErr } = await s
    .from('products')
    .select('id, title, model_id, source_url')
    .eq('oem_id', 'ford-au');
  if (pErr) throw pErr;

  const productUpdates: Array<{ id: string; title: string; from: string; to: string }> = [];
  const productOrphans: Array<{ title: string; source_url: string }> = [];

  for (const p of products ?? []) {
    if (!p.model_id) { productOrphans.push({ title: p.title, source_url: p.source_url ?? '' }); continue; }
    const target = modelIdToUrl.get(p.model_id);
    if (!target) { productOrphans.push({ title: p.title, source_url: p.source_url ?? '' }); continue; }
    if (p.source_url !== target) {
      productUpdates.push({ id: p.id, title: p.title, from: p.source_url ?? '', to: target });
    }
  }

  console.log(`\n=== products: ${productUpdates.length} to update, ${productOrphans.length} orphans ===`);
  if (productOrphans.length) {
    console.log('  Orphans (no matching vehicle_model — left as-is):');
    console.table(productOrphans.slice(0, 10));
    if (productOrphans.length > 10) console.log(`  ... and ${productOrphans.length - 10} more`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to commit changes.');
    return;
  }

  console.log('\nApplying updates...');
  for (const u of modelUpdates) {
    const { error } = await s.from('vehicle_models').update({ source_url: u.to }).eq('id', u.id);
    if (error) console.error(`  vehicle_models ${u.slug}: ${error.message}`); else console.log(`  vehicle_models ${u.slug} ✓`);
  }
  let pDone = 0;
  for (const u of productUpdates) {
    const { error } = await s.from('products').update({ source_url: u.to }).eq('id', u.id);
    if (error) console.error(`  products ${u.title}: ${error.message}`); else pDone++;
  }
  console.log(`  products: ${pDone}/${productUpdates.length} updated ✓`);
}

main().catch((e) => { console.error(e); process.exit(1); });
