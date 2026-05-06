/**
 * Sync ford-au `vehicle_models` against scripts/ford-vehiclesmenu.json.
 *
 * - INSERTs new nameplates that exist in the menu but not in the DB.
 * - Sets is_active=false on DB rows that are no longer in the menu.
 * - Updates source_url on existing rows if the menu URL differs.
 *
 * Run:  pnpm tsx scripts/sync-ford-models.ts [--apply]
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

// Map Ford's category label to the body_type shape used elsewhere in the DB.
function bodyTypeFor(menuCategory: string, name: string): string {
  const c = menuCategory.toLowerCase();
  if (c.includes('van')) return 'Van';
  if (c.includes('truck') || c.includes('ute')) return 'Truck';
  if (c.includes('suv')) return 'SUV';
  if (c.includes('electr')) return name.toLowerCase().includes('transit') ? 'Van' : 'SUV';
  return 'Car';
}

interface Nameplate { name: string; code?: string; path?: string }

async function main() {
  const file = path.resolve(__dirname, 'ford-vehiclesmenu.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{ category: string; nameplates?: Nameplate[] }>;

  const menu = new Map<string, { slug: string; name: string; category: string; url: string; oem_model_code: string | null }>();
  for (const cat of data) {
    for (const np of cat.nameplates ?? []) {
      const slug = slugify(np.name);
      const url = fordPublicUrl(np.path);
      if (!url) continue;
      if (!menu.has(slug)) {
        menu.set(slug, { slug, name: np.name, category: cat.category, url, oem_model_code: np.code ?? null });
      }
    }
  }

  const { data: db, error } = await s
    .from('vehicle_models')
    .select('id, slug, name, source_url, is_active, oem_model_code, meta_json')
    .eq('oem_id', 'ford-au');
  if (error) throw error;

  const dbBySlug = new Map((db ?? []).map((r) => [r.slug, r]));

  const toInsert: any[] = [];
  const toUpdate: Array<{ id: string; slug: string; patch: any }> = [];
  const toDeactivate: Array<{ id: string; slug: string }> = [];

  for (const [slug, m] of menu) {
    const existing = dbBySlug.get(slug);
    if (!existing) {
      toInsert.push({
        oem_id: 'ford-au',
        slug: m.slug,
        name: m.name,
        body_type: bodyTypeFor(m.category, m.name),
        category: m.category.toLowerCase(),
        is_active: true,
        source_url: m.url,
        oem_model_code: m.oem_model_code,
        meta_json: { synced_from: 'vehiclesmenu.json', synced_at: new Date().toISOString() },
      });
    } else {
      const patch: any = {};
      if (existing.source_url !== m.url) patch.source_url = m.url;
      // Respect manual deactivation: if meta_json.deactivated_reason is set,
      // don't flip is_active back to true just because the menu JSON still
      // lists this nameplate. Ford's menu JSON lags their lineup changes
      // (e.g. Transit Custom PHEV removed from site but still in menu feed).
      const manuallyDeactivated = Boolean((existing as any).meta_json?.deactivated_reason);
      if (!existing.is_active && !manuallyDeactivated) patch.is_active = true;
      if (!existing.oem_model_code && m.oem_model_code) patch.oem_model_code = m.oem_model_code;
      if (Object.keys(patch).length) toUpdate.push({ id: existing.id, slug: existing.slug, patch });
    }
  }

  for (const row of db ?? []) {
    if (!menu.has(row.slug) && row.is_active !== false) {
      toDeactivate.push({ id: row.id, slug: row.slug });
    }
  }

  console.log('=== INSERT (new nameplates) ===');
  console.table(toInsert.map((r) => ({ slug: r.slug, name: r.name, body_type: r.body_type, url: r.source_url })));
  console.log('\n=== UPDATE (existing rows) ===');
  console.table(toUpdate.map((u) => ({ slug: u.slug, patch: JSON.stringify(u.patch) })));
  console.log('\n=== DEACTIVATE (not in menu) ===');
  console.table(toDeactivate);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to commit.');
    return;
  }

  console.log('\nApplying...');
  if (toInsert.length) {
    const { error } = await s.from('vehicle_models').insert(toInsert);
    if (error) console.error('  insert error:', error.message);
    else console.log(`  inserted ${toInsert.length} ✓`);
  }
  for (const u of toUpdate) {
    const { error } = await s.from('vehicle_models').update(u.patch).eq('id', u.id);
    if (error) console.error(`  update ${u.slug}: ${error.message}`);
    else console.log(`  updated ${u.slug} ✓`);
  }
  for (const d of toDeactivate) {
    const { error } = await s.from('vehicle_models').update({ is_active: false }).eq('id', d.id);
    if (error) console.error(`  deactivate ${d.slug}: ${error.message}`);
    else console.log(`  deactivated ${d.slug} ✓`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
