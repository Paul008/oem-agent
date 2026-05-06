/**
 * Backfill `products.model_id` for ford-au by matching product title against
 * the longest vehicle_model.name prefix. Also re-syncs source_url from the
 * linked vehicle_model.
 *
 * Uses longest-prefix matching so e.g.
 *   "Mustang Mach-E GT"         → Mustang Mach-E (not Mustang)
 *   "Ranger Raptor"             → Ranger Raptor (not Ranger)
 *   "Transit Custom PHEV Van"   → Transit Custom PHEV (not Transit Custom)
 *
 * Run:  pnpm tsx scripts/backfill-ford-model-ids.ts [--apply]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/^ford\s+/, '');
}

async function main() {
  const { data: models, error: mErr } = await s
    .from('vehicle_models')
    .select('id, slug, name, source_url, is_active')
    .eq('oem_id', 'ford-au');
  if (mErr) throw mErr;

  // Sort by name length DESC so longest match wins during iteration
  const sorted = (models ?? []).slice().sort((a, b) => b.name.length - a.name.length);

  const { data: products, error: pErr } = await s
    .from('products')
    .select('id, title, model_id, source_url')
    .eq('oem_id', 'ford-au');
  if (pErr) throw pErr;

  const changes: Array<{ id: string; title: string; oldModelId: string | null; newModelId: string | null; newUrl: string | null; match: string }> = [];
  const unmatched: Array<{ title: string }> = [];

  for (const p of products ?? []) {
    const normTitle = normalize(p.title);
    let matched: typeof sorted[number] | undefined;
    for (const vm of sorted) {
      const normName = normalize(vm.name);
      if (normTitle === normName || normTitle.startsWith(normName + ' ')) {
        matched = vm;
        break;
      }
    }
    if (!matched) { unmatched.push({ title: p.title }); continue; }
    const patch: any = {};
    if (p.model_id !== matched.id) patch.model_id = matched.id;
    if (matched.source_url && p.source_url !== matched.source_url) patch.source_url = matched.source_url;
    if (Object.keys(patch).length) {
      changes.push({
        id: p.id,
        title: p.title,
        oldModelId: p.model_id,
        newModelId: patch.model_id ?? p.model_id,
        newUrl: patch.source_url ?? null,
        match: matched.slug + (matched.is_active ? '' : ' (inactive)'),
      });
    }
  }

  console.log(`=== Changes (${changes.length}) ===`);
  console.table(changes.map((c) => ({ title: c.title, match: c.match, urlUpdated: !!c.newUrl })));
  console.log(`\n=== Unmatched (${unmatched.length}) — left as-is ===`);
  console.table(unmatched);

  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply.'); return; }

  for (const c of changes) {
    const patch: any = { model_id: c.newModelId };
    if (c.newUrl) patch.source_url = c.newUrl;
    const { error } = await s.from('products').update(patch).eq('id', c.id);
    if (error) console.error(`  ${c.title}: ${error.message}`);
  }
  console.log(`\nApplied ${changes.length} product updates.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
