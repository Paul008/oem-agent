/**
 * Ford Australia — accessories (factory-fit options) from RSC /summary endpoint
 *
 * Fetches https://www.ford.com.au/price/<Name>/summary?_rsc=x for each active
 * Ford nameplate, parses priced option/accessory blocks (state=A, price>0,
 * non-config category), and upserts into the accessories table keyed by
 * (oem_id, external_key).
 *
 * Flags: --apply to write (default dry-run), --slug=<x> to limit to one nameplate.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

const PROXY_BASE = 'https://oem-agent.adme-dev.workers.dev/media/ford-au/';

// categoryName values that describe vehicle-config dimensions rather than
// purchasable accessories — exclude these even though they have price/id fields.
const CONFIG_CATEGORIES = new Set([
  'Series', 'Bodystyle', 'Powertrain', 'Paint', 'Trims', 'Drive',
  'E Com Fuel', 'Engine', 'Transmission', 'Factory Fitted Options',
]);

// ---- Parsing ----

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

type Accessory = {
  id: string;
  name: string;
  state: string;
  price: number;
  categoryCode?: string;
  categoryName?: string;
  featureCode?: string;
  featureName?: string;
  desc?: string;
  descKf?: string;
  image?: string;
  disclaimer?: unknown;
  priceDisclaimer?: unknown;
};

function extractAccessories(rsc: string): Accessory[] {
  const out: Accessory[] = [];
  const seen = new Set<string>();

  // Walk each "id":"CODE" match and try to parse the enclosing object.
  const idRx = /"id":"([A-Z0-9]{4,8})"/g;
  let m: RegExpExecArray | null;
  while ((m = idRx.exec(rsc))) {
    // Walk back to the nearest '{'.
    let start = m.index;
    while (start > 0 && rsc[start] !== '{') start--;
    if (rsc[start] !== '{') continue;

    const blob = parseBalanced(rsc, start);
    const obj = safeJson<Accessory>(blob);
    if (!obj || typeof obj.id !== 'string') continue;
    if (seen.has(obj.id)) continue;

    // Filter: must be active, priced, non-config, with a plausible name.
    if (obj.state !== 'A') continue;
    if (typeof obj.price !== 'number' || obj.price <= 0) continue;
    if (!obj.categoryName || CONFIG_CATEGORIES.has(obj.categoryName)) continue;
    if (typeof obj.name !== 'string' || obj.name === '$undefined') continue;

    seen.add(obj.id);
    out.push(obj);
  }
  return out;
}

// ---- DB shape ----

function proxyUrl(url: string | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  // Strip the leading `//` or `https:` normalization, then base64url-encode.
  const normalized = url.startsWith('//') ? `https:${url}` : url;
  const b64 = Buffer.from(normalized).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return PROXY_BASE + b64;
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function cleanUndefined<T>(v: T): T | null {
  if (v === '$undefined' || v === null || v === undefined) return null;
  return v;
}

function buildRow(acc: Accessory, modelSlug: string) {
  return {
    oem_id: 'ford-au',
    external_key: `ford-au_${acc.id}`,
    name: acc.name.trim(),
    slug: slugify(acc.name),
    part_number: acc.id,
    category: acc.categoryName ?? null,
    price: acc.price,
    description_html: cleanUndefined(acc.desc),
    image_url: proxyUrl(acc.image),
    inc_fitting: 'includes',
    meta_json: {
      source: 'rsc_summary',
      model_slug: modelSlug,
      categoryCode: acc.categoryCode ?? null,
      featureCode: acc.featureCode ?? null,
      featureName: cleanUndefined(acc.featureName),
      descKf: cleanUndefined(acc.descKf),
      disclaimer: acc.disclaimer && acc.disclaimer !== '$undefined' ? acc.disclaimer : null,
      priceDisclaimer: acc.priceDisclaimer && acc.priceDisclaimer !== '$undefined' ? acc.priceDisclaimer : null,
      source_image_url: acc.image ?? null,
      fetched_at: new Date().toISOString(),
    },
  };
}

// ---- URL ----

function modelToUrlName(slug: string): string {
  return slug.split('-').map((s) => s ? s[0].toUpperCase() + s.slice(1) : s).join('-');
}

// ---- Per-model ----

async function processModel(model: { id: string; name: string; slug: string }): Promise<number> {
  const urlName = modelToUrlName(model.slug);
  const url = `https://www.ford.com.au/price/${urlName}/summary?postalCode=3000&usageType=P&_rsc=x`;

  console.log(`\n[${model.name}] GET ${url}`);
  let rsc: string;
  try {
    const res = await fetch(url, { headers: RSC_HEADERS });
    if (!res.ok) { console.log(`  ✗ HTTP ${res.status}, skip`); return 0; }
    rsc = await res.text();
  } catch (e) {
    console.log(`  ✗ fetch error: ${(e as Error).message}`);
    return 0;
  }

  const accs = extractAccessories(rsc);
  console.log(`  payload=${(rsc.length / 1024).toFixed(0)}k accessories=${accs.length}`);
  if (!accs.length) return 0;

  let written = 0;
  for (const acc of accs) {
    const row = buildRow(acc, model.slug);
    if (APPLY) {
      const { error } = await sb.from('accessories').upsert(row, { onConflict: 'oem_id,external_key' });
      if (error) { console.log(`  ✗ upsert ${acc.id}: ${error.message}`); continue; }
    }
    console.log(`  ${APPLY ? '✓' : '+'} ${acc.id.padEnd(6)} $${acc.price.toLocaleString().padStart(8)}  [${acc.categoryName}]  ${acc.name}`);
    written++;
  }
  return written;
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

  let total = 0;
  for (const m of models) total += await processModel(m);

  console.log(`\n=== Summary ===`);
  console.log(`Accessories written: ${total}`);
  console.log(APPLY ? 'Changes applied.' : 'Dry run — re-run with --apply to write.');
}

main().catch((e) => { console.error(e); process.exit(1); });
