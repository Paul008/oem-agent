/**
 * Ford Australia — variant_colors.gallery_urls enrichment from RSC /summary.
 *
 * Narrow purpose: the static seed-ford-colors.mjs pipeline populates all 301
 * Ford variant_colors with hero + swatch + gallery URLs, but a handful of
 * nameplates (notably Ranger Super Duty at 2 images per colour) end up
 * thinner than others (13 images per colour on Ranger / Everest / F-150).
 *
 * Ford's /price/<Name>/summary?_rsc=x RSC payloads include multi-angle GPAS
 * images tagged `imageURL-21` through `imageURL-32` (3D rotator frames for
 * the default configured colour). We can't cleanly tie those to specific
 * colours, but appending them to every variant_color row for the affected
 * nameplate lifts coverage without overwriting the higher-quality
 * colour-specific images already seeded.
 *
 * Safety: only enriches rows where gallery_urls.length < MIN_GALLERY (default
 * 8). Rows that already have rich galleries are left alone. Idempotent —
 * re-running dedupes the URL list by comparing the underlying (non-proxied)
 * URL.
 *
 * Flags: --apply to write (default dry-run), --slug=<x> limit to a nameplate,
 *        --min=<n> override the MIN_GALLERY threshold.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { modelToUrlName, siblingSlugsFor } from './ford-url-map.ts';

const APPLY = process.argv.includes('--apply');
const SLUG_FILTER = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];
const MIN_GALLERY = Number(process.argv.find((a) => a.startsWith('--min='))?.split('=')[1] ?? 8);

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

const PROXY_BASE = 'https://oem-agent.adme-dev.workers.dev/media/ford-au/';

function proxyUrl(url: string): string {
  const b64 = Buffer.from(url).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return PROXY_BASE + b64;
}

/**
 * Decode a proxied URL back to the underlying GPAS URL so we can dedup
 * against freshly extracted URLs without treating different proxy encodings
 * as distinct.
 */
function unproxyUrl(url: string): string {
  if (!url.startsWith(PROXY_BASE)) return url;
  const b64 = url.slice(PROXY_BASE.length).replace(/-/g, '+').replace(/_/g, '/');
  try { return Buffer.from(b64, 'base64').toString('utf8'); }
  catch { return url; }
}

/**
 * Extract the ordered list of gallery image URLs from a /summary RSC payload.
 * We target the `imageURL-N` tagged sequence (the 3D rotator frames) and
 * fall back to any non-chip GPAS URL discovered in the payload. Paint chips
 * (`/colourchip/`) are excluded — those belong in swatch_url.
 */
function extractGalleryUrls(rsc: string): string[] {
  const out = new Set<string>();
  // Tagged rotator frames
  const tagged = [...rsc.matchAll(/"tag":"imageURL-\d+","imgUrl":"([^"]+)"/g)];
  for (const m of tagged) out.add(m[1]);
  // Any remaining non-chip GPAS URLs (covers payloads that don't use the tag format)
  const bare = [...rsc.matchAll(/https?:\/\/www\.gpas-cache\.ford\.com\/guid\/[a-f0-9\-]+\.[a-z0-9]+(?:\?[^"'\s]+)?/g)];
  for (const m of bare) out.add(m[0]);
  return [...out];
}

async function processNameplate(model: { id: string; name: string; slug: string }) {
  const urlName = modelToUrlName(model.slug);
  const url = `https://www.ford.com.au/price/${urlName}/summary?postalCode=3000&usageType=P&_rsc=x`;

  console.log(`\n[${model.name}] GET ${url}`);
  let rsc: string;
  try {
    const res = await fetch(url, { headers: RSC_HEADERS });
    if (!res.ok) { console.log(`  ✗ HTTP ${res.status}, skip`); return { updated: 0 }; }
    rsc = await res.text();
  } catch (e) {
    console.log(`  ✗ fetch error: ${(e as Error).message}`);
    return { updated: 0 };
  }

  const urls = extractGalleryUrls(rsc);
  if (!urls.length) {
    console.log(`  (no gallery URLs in payload — probably template-only)`);
    return { updated: 0 };
  }
  console.log(`  payload=${(rsc.length / 1024).toFixed(0)}k extracted=${urls.length} gallery URLs`);

  // Pool: own products + sibling-nameplate products (same palette).
  const siblings = [model.slug, ...siblingSlugsFor(model.slug)];
  const { data: siblingModels } = await sb.from('vehicle_models')
    .select('id').eq('oem_id', 'ford-au').in('slug', siblings);
  const modelIds = (siblingModels ?? []).map((m) => m.id);
  const { data: prods } = await sb.from('products').select('id,title').eq('oem_id', 'ford-au').in('model_id', modelIds);
  const productIds = (prods ?? []).map((p) => p.id);
  if (!productIds.length) { console.log(`  (no products for this model)`); return { updated: 0 }; }

  const { data: rows } = await sb.from('variant_colors').select('id,color_name,gallery_urls').in('product_id', productIds);
  if (!rows?.length) return { updated: 0 };

  const needy = rows.filter((r) => !Array.isArray(r.gallery_urls) || r.gallery_urls.length < MIN_GALLERY);
  if (!needy.length) {
    console.log(`  all ${rows.length} variant_colors already have ≥${MIN_GALLERY} images — skipping enrichment`);
    return { updated: 0 };
  }

  const newProxiedUrls = urls.map(proxyUrl);
  let updated = 0;
  for (const row of needy) {
    const existing = Array.isArray(row.gallery_urls) ? row.gallery_urls : [];
    // Dedup by underlying GPAS URL, preserving existing order.
    const seen = new Set(existing.map(unproxyUrl));
    const merged = [...existing];
    for (let i = 0; i < newProxiedUrls.length; i++) {
      const underlying = urls[i];
      if (seen.has(underlying)) continue;
      seen.add(underlying);
      merged.push(newProxiedUrls[i]);
    }
    if (merged.length === existing.length) continue;

    if (APPLY) {
      const { error } = await sb.from('variant_colors').update({ gallery_urls: merged }).eq('id', row.id);
      if (error) { console.log(`  ✗ update ${row.color_name}: ${error.message}`); continue; }
    }
    console.log(`  ${APPLY ? '✓' : '+'} "${row.color_name}"  ${existing.length} → ${merged.length} images`);
    updated++;
  }
  return { updated };
}

async function main() {
  const { data: allModels } = await sb.from('vehicle_models')
    .select('id,name,slug').eq('oem_id', 'ford-au').eq('is_active', true);
  const models = SLUG_FILTER ? allModels!.filter((m) => m.slug === SLUG_FILTER) : allModels!;

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${SLUG_FILTER ? ` (slug=${SLUG_FILTER})` : ''}  MIN_GALLERY=${MIN_GALLERY}`);

  const processedUrls = new Set<string>();
  let total = 0;
  for (const m of models) {
    const urlName = modelToUrlName(m.slug);
    if (processedUrls.has(urlName)) {
      console.log(`\n[${m.name}] /${urlName}/summary already fetched via sibling — skipping`);
      continue;
    }
    processedUrls.add(urlName);
    const r = await processNameplate(m);
    total += r.updated;
  }

  console.log(`\n=== Summary ===`);
  console.log(`variant_colors ${APPLY ? 'updated' : 'that would update'}: ${total}`);
  console.log(APPLY ? 'Changes applied.' : 'Dry run — re-run with --apply to write.');
}

main().catch((e) => { console.error(e); process.exit(1); });
