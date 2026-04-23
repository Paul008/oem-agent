/**
 * Ford Australia — paint colour premium pricing from RSC /summary endpoint
 *
 * Fetches /price/<Name>/summary?_rsc=x per active nameplate, extracts the
 * paint option list (entries with "colourchip" image URLs), and updates the
 * existing variant_colors rows with:
 *   - price_delta (paint upcharge, e.g. $750 for Meteor Grey; 0 for standard)
 *   - is_standard (true when paint price is 0 / $undefined, false when > 0)
 *
 * Hero/gallery/swatch URLs are left alone — those come from the static
 * seed-ford-colors.mjs pipeline and are richer than what the RSC exposes.
 *
 * Flags: --apply to write (default dry-run), --slug=<x> to limit to one nameplate.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { modelToUrlName, siblingSlugsFor } from './ford-url-map.ts';

const APPLY = process.argv.includes('--apply');
const SLUG_FILTER = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}
const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const RSC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120',
  RSC: '1',
  Accept: 'text/x-component,text/plain,*/*',
};

// ---- RSC parsing ----

function parseBalanced(str: string, startIdx: number): string | null {
  let depth = 0, i = startIdx, inStr = false, esc = false;
  for (; i < str.length; i++) {
    const c = str[i];
    if (esc) { esc = false; continue; }
    if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) return str.slice(startIdx, i + 1); }
  }
  return null;
}

function safeJson<T = any>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

type PaintOption = {
  id: string;
  name: string;
  price: number;        // 0 when $undefined (included)
  isStandard: boolean;
  state: string;
  swatchUrl?: string;   // colourchip URL from RSC
};

/**
 * A paint entry in the RSC looks like:
 *   { id: "PMYHR", name: "Meteor Grey", image: "...colourchip/PMYHR.png",
 *     price: 750 | "$undefined", state: "A", ... }
 * We find them by locating the 'colourchip' image path (unique to paint chips).
 */
function extractPaints(rsc: string): PaintOption[] {
  const out: PaintOption[] = [];
  const seen = new Set<string>();
  let scan = 0;
  while (true) {
    const markerIdx = rsc.indexOf('colourchip/', scan);
    if (markerIdx < 0) break;
    // Walk back to the enclosing '{'
    let start = markerIdx;
    while (start > 0 && rsc[start] !== '{') start--;
    if (rsc[start] !== '{') { scan = markerIdx + 10; continue; }
    const blob = parseBalanced(rsc, start);
    scan = markerIdx + 10;
    const obj = safeJson<any>(blob);
    if (!obj || typeof obj.id !== 'string' || typeof obj.name !== 'string') continue;
    if (seen.has(obj.id)) continue;
    seen.add(obj.id);
    const price = typeof obj.price === 'number' ? obj.price : 0;
    out.push({
      id: obj.id,
      name: obj.name,
      price,
      isStandard: price === 0,
      state: obj.state ?? '',
      swatchUrl: typeof obj.image === 'string' ? obj.image : undefined,
    });
  }
  return out;
}

// URL resolution imported from ./ford-url-map.ts (menu-driven).

// ---- Per-model ----

async function processModel(model: { id: string; name: string; slug: string }) {
  const urlName = modelToUrlName(model.slug);
  const url = `https://www.ford.com.au/price/${urlName}/summary?postalCode=3000&usageType=P&_rsc=x`;

  console.log(`\n[${model.name}] GET ${url}`);
  let rsc: string;
  try {
    const res = await fetch(url, { headers: RSC_HEADERS });
    if (!res.ok) { console.log(`  ✗ HTTP ${res.status}, skip`); return { matched: 0, updated: 0, unmatched: 0 }; }
    rsc = await res.text();
  } catch (e) {
    console.log(`  ✗ fetch error: ${(e as Error).message}`);
    return { matched: 0, updated: 0, unmatched: 0 };
  }

  const paints = extractPaints(rsc);
  const active = paints.filter((p) => p.state === 'A');
  console.log(`  payload=${(rsc.length / 1024).toFixed(0)}k paints=${paints.length} (active=${active.length})`);
  if (!active.length) return { matched: 0, updated: 0, unmatched: 0 };

  // Products of this model + any siblings that share the same /summary
  // endpoint (e.g. Transit-Custom's paints apply equally to Transit-Custom-PHEV
  // and Transit-Custom-Trail since all three render the same colour palette).
  const siblings = siblingSlugsFor(model.slug);
  const candidateSlugs = [model.slug, ...siblings];
  const { data: siblingModels } = await sb.from('vehicle_models')
    .select('id').eq('oem_id', 'ford-au').in('slug', candidateSlugs);
  const modelIds = (siblingModels ?? []).map((m) => m.id);
  const { data: prods } = await sb.from('products').select('id,title').eq('oem_id', 'ford-au').in('model_id', modelIds);
  const productIds = (prods ?? []).map((p) => p.id);
  if (!productIds.length) { console.log(`  (no products for this model)`); return { matched: 0, updated: 0, unmatched: 0 }; }

  // Fetch existing variant_colors for these products
  const { data: colorRows } = await sb.from('variant_colors')
    .select('id,product_id,color_name,color_code,price_delta,is_standard')
    .in('product_id', productIds);

  if (!colorRows?.length) { console.log(`  (no variant_colors for this model)`); return { matched: 0, updated: 0, unmatched: 0 }; }

  // Index existing rows by normalised color_name
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const byName = new Map<string, typeof colorRows>();
  for (const row of colorRows) {
    const k = norm(row.color_name ?? '');
    if (!byName.has(k)) byName.set(k, [] as any);
    byName.get(k)!.push(row);
  }

  let matched = 0, updated = 0, unmatched = 0;
  for (const paint of active) {
    const key = norm(paint.name);
    const rows = byName.get(key);
    if (!rows || !rows.length) {
      console.log(`  ? "${paint.name}" ($${paint.price}) — no variant_colors row for any product in this model`);
      unmatched++;
      continue;
    }
    matched++;

    // Only update rows whose current price_delta or is_standard differ from the RSC truth.
    const stale = rows.filter((r) =>
      (r.price_delta ?? 0) !== paint.price || r.is_standard !== paint.isStandard
    );
    if (!stale.length) {
      console.log(`  = "${paint.name}" $${paint.price} (${paint.isStandard ? 'standard' : 'premium'}) — ${rows.length} rows already current`);
      continue;
    }

    const ids = stale.map((r) => r.id);
    if (APPLY) {
      const { error } = await sb.from('variant_colors')
        .update({ price_delta: paint.price, is_standard: paint.isStandard })
        .in('id', ids);
      if (error) { console.log(`  ✗ update "${paint.name}": ${error.message}`); continue; }
    }
    console.log(`  ${APPLY ? '✓' : '+'} "${paint.name}" $${paint.price} (${paint.isStandard ? 'standard' : 'premium'}) — ${stale.length}/${rows.length} rows ${APPLY ? 'updated' : 'would update'}`);
    updated += stale.length;
  }

  return { matched, updated, unmatched };
}

// ---- Main ----

async function main() {
  const q = sb.from('vehicle_models').select('id,name,slug').eq('oem_id', 'ford-au').eq('is_active', true);
  if (SLUG_FILTER) q.eq('slug', SLUG_FILTER);
  const { data: models, error: mErr } = await q;
  if (mErr || !models?.length) {
    console.error('No models found:', mErr?.message ?? '(empty)');
    process.exit(1);
  }

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${SLUG_FILTER ? ` (slug=${SLUG_FILTER})` : ''}`);
  console.log(`Models: ${models.length}`);

  // Dedupe URL fetches — sibling slugs share the same /summary endpoint and
  // the colour palette is resolved at the URL level (processModel already
  // pulls sibling products into the match pool). Without this we'd fetch the
  // same 222k payload two or three times for Transit Custom family.
  const processedUrls = new Set<string>();
  let totalMatched = 0, totalUpdated = 0, totalUnmatched = 0;
  for (const m of models) {
    const urlName = modelToUrlName(m.slug);
    if (processedUrls.has(urlName)) {
      console.log(`\n[${m.name}] /${urlName}/summary already fetched via sibling — skipping`);
      continue;
    }
    processedUrls.add(urlName);
    const r = await processModel(m);
    totalMatched += r.matched;
    totalUpdated += r.updated;
    totalUnmatched += r.unmatched;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Matched paints:   ${totalMatched}`);
  console.log(`Unmatched paints: ${totalUnmatched}`);
  console.log(`Rows ${APPLY ? 'updated' : 'that would update'}:       ${totalUpdated}`);
  console.log(APPLY ? 'Changes applied.' : 'Dry run — re-run with --apply to write.');
}

main().catch((e) => { console.error(e); process.exit(1); });
