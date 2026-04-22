/**
 * Ford Australia — pricing + offers from RSC endpoint
 *
 * Session 2 of the Ford pipeline (see docs/HANDOFF-ford-pipeline.md).
 *
 * Fetches https://www.ford.com.au/price/<Name>?_rsc=x for each active Ford
 * nameplate, parses the Next.js streaming payload, and upserts:
 *   - variant_pricing (one driveaway row per matched product)
 *   - offers (dedup per tagLine+specialInformation, linked by model_id)
 *   - products.variant_code / variant_name (stamped for future matching)
 *
 * Flags: --apply to write (default is dry-run), --slug=<x> to limit to one nameplate.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

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

type BuildBlock = {
  tuple: string;
  seriesCode: string;       // "ABML1_SE#F7" or "ACMRE_VS-AB"
  seriesShort: string;      // "F7" or "AB"
  seriesName?: string;      // "Sport" / "EcoBoost" — filled from descriptor map
  driveaway: number;
  rrp: number;
  keyFeatures: { code: string; descKf: string }[];
  tagLine?: string;
  specialInformation?: string;
};

/** Pull out a balanced JSON substring starting at a `{` or `[`. */
function parseBalanced(str: string, startIdx: number): string | null {
  let depth = 0, i = startIdx, inStr = false, esc = false;
  for (; i < str.length; i++) {
    const c = str[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
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

/** In RSC streaming, `$$` is the escape for a literal `$`. */
function cleanDollarEscape(s: string | undefined): string | undefined {
  return s?.replace(/\$\$/g, '$');
}

function extractSeriesMap(rsc: string): Map<string, string> {
  const map = new Map<string, string>();
  // Covers both "ABML1_SE#F7" and "ACMRE_VS-AB" patterns used across Ford nameplates.
  const rx = /"code":"([A-Z0-9]+_(?:SE#|VS-)[A-Z0-9]+)","name":"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(rsc))) map.set(m[1], m[2]);
  return map;
}

function extractBuilds(rsc: string): BuildBlock[] {
  // Ranger-style payloads put all builds inside the single big line prefixed `5:`.
  // Fall back to the whole payload otherwise (some nameplates use a different layout).
  const lines = rsc.split('\n');
  const big = lines.find((l) => /^5:/.test(l));
  const text = big ? big.slice(2) : rsc;

  const builds: BuildBlock[] = [];
  const seen = new Set<string>();
  let scan = 0;
  while (true) {
    const pIdx = text.indexOf('"basePrice":{', scan);
    if (pIdx < 0) break;

    const bpRaw = parseBalanced(text, pIdx + '"basePrice":'.length);
    const bp = safeJson<any>(bpRaw);

    // Find the "entity":{ between this basePrice and the next one.
    const nextBP = text.indexOf('"basePrice":{', pIdx + 12);
    const entIdx = text.indexOf('"entity":{', pIdx);
    const hasEntity = entIdx > pIdx && (nextBP < 0 || entIdx < nextBP);
    const entity = hasEntity ? safeJson<any>(parseBalanced(text, entIdx + '"entity":'.length)) : null;

    // keyFeatures usually sits between basePrice and entity.
    const kfIdx = text.indexOf('"keyFeatures":{', pIdx);
    const kf = kfIdx > pIdx && (!hasEntity || kfIdx < entIdx)
      ? safeJson<any>(parseBalanced(text, kfIdx + '"keyFeatures":'.length))
      : null;

    scan = (hasEntity ? entIdx : pIdx) + 12;

    if (!bp || !entity?.code) continue;
    const tuple: string = entity.code;
    if (seen.has(tuple)) continue;
    seen.add(tuple);

    // Tuples come in two shapes:
    //   Ranger/Everest: "ABML1_CA#BC_DGACX_DR--G_EN-YN_SE#F7_TR-EU" (platform + segments)
    //   Mustang:        "ACMRE_VS-AB"                               (platform + series)
    // The series descriptor map is keyed by `<platform>_<SE#|VS-><code>`, so we
    // must rebuild the key by combining the first segment (platform) with the
    // series segment — not just grab the nearest `[A-Z0-9]+_SE#XX` match.
    const parts = tuple.split('_');
    const platform = parts[0] ?? '';
    const seriesSegment = parts.find((p) => p.startsWith('SE#') || p.startsWith('VS-')) ?? '';
    const seriesCode = platform && seriesSegment ? `${platform}_${seriesSegment}` : '';
    const seriesShort = seriesSegment.replace(/^(SE#|VS-)/, '');
    builds.push({
      tuple,
      seriesCode,
      seriesShort,
      driveaway: typeof bp.polkVehicleDriveAwayPrice === 'number' ? bp.polkVehicleDriveAwayPrice : 0,
      rrp: typeof bp.grossRetail === 'number' ? bp.grossRetail : 0,
      keyFeatures: Array.isArray(kf?.features) ? kf.features : [],
      tagLine: cleanDollarEscape(entity.tagLine),
      specialInformation: cleanDollarEscape(entity.specialInformation),
    });
  }
  return builds;
}

function annotateSeriesNames(builds: BuildBlock[], map: Map<string, string>): void {
  for (const b of builds) if (b.seriesCode && map.has(b.seriesCode)) b.seriesName = map.get(b.seriesCode);
}

// ---- Product ↔ series matching ----

/**
 * Pick the single build that best represents a product.
 * Longest matching series name (e.g. "Platinum" beats "XL"), then tie-break by
 * tokens in the title hitting keyFeatures descKf (e.g. "Manual"/"Auto"/"V8").
 */
function pickBuildForProduct(product: { title: string }, builds: BuildBlock[]): BuildBlock | null {
  const title = product.title.toLowerCase();

  const candidates = builds.filter((b) => {
    const name = b.seriesName?.toLowerCase();
    return name && title.includes(name);
  });
  if (!candidates.length) return null;

  // Prefer the candidate whose series name is the longest match.
  const maxLen = Math.max(...candidates.map((b) => b.seriesName!.length));
  const top = candidates.filter((b) => b.seriesName!.length === maxLen);
  if (top.length === 1) return top[0];

  // Tie-break: score by how many non-series title tokens appear in tuple + features.
  const seriesWords = new Set(top[0].seriesName!.toLowerCase().split(/\s+/));
  const titleTokens = title.split(/[\s-]+/).filter((t) => t.length > 2 && !seriesWords.has(t));

  const scored = top.map((b) => {
    const hay = (b.tuple + ' ' + b.keyFeatures.map((f) => f.descKf).join(' ')).toLowerCase();
    const hits = titleTokens.filter((t) => hay.includes(t)).length;
    return { b, hits };
  }).sort((a, z) => z.hits - a.hits || a.b.driveaway - z.b.driveaway);

  return scored[0]?.b ?? null;
}

// ---- Offer extraction helpers ----

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function parseDateLoose(day: string, month: string, year: string): string | null {
  const m = MONTHS[month.toLowerCase()];
  if (m === undefined) return null;
  const d = new Date(Date.UTC(Number(year), m, Number(day)));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseValidity(text: string | undefined): { start: string | null; end: string | null; raw: string } {
  if (!text) return { start: null, end: null, raw: '' };
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  let start: string | null = null;
  let end: string | null = null;

  const fromRx = /from\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i;
  const fromM = plain.match(fromRx);
  if (fromM) start = parseDateLoose(fromM[1], fromM[2], fromM[3]);

  const toRx = /(?:until|to|by|ending|ends)\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i;
  const toM = plain.match(toRx);
  if (toM) end = parseDateLoose(toM[1], toM[2], toM[3]);

  const rawM = plain.match(/Offer (?:is\s+)?(?:available|valid)[^.]{0,300}\./i);
  return { start, end, raw: rawM?.[0] ?? plain.slice(0, 300) };
}

function classifyOffer(tagLine: string | undefined): string {
  if (!tagLine) return 'generic';
  const t = tagLine.toLowerCase();
  if (t.includes('fuel card')) return 'fuel_card';
  if (t.includes('finance')) return 'finance';
  if (t.includes('cashback') || t.includes('cash back')) return 'cashback';
  if (t.includes('bonus')) return 'bonus';
  if (t.includes('driveaway') || t.includes('drive away')) return 'driveaway';
  return 'generic';
}

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

// ---- URL builder ----

function modelToUrlName(slug: string): string {
  return slug.split('-').map((s) => s ? s[0].toUpperCase() + s.slice(1) : s).join('-');
}

// ---- Per-model processing ----

async function processModel(
  model: { id: string; name: string; slug: string },
  products: { id: string; title: string }[]
): Promise<{ priceRows: number; offerRows: number }> {
  const urlName = modelToUrlName(model.slug);
  const pageUrl = `https://www.ford.com.au/price/${urlName}`;
  const rscUrl = `${pageUrl}?postalCode=3000&usageType=P&_rsc=x`;

  console.log(`\n[${model.name}] GET ${rscUrl}`);
  let rsc: string;
  try {
    const res = await fetch(rscUrl, { headers: RSC_HEADERS });
    if (!res.ok) { console.log(`  ✗ HTTP ${res.status}, skip`); return { priceRows: 0, offerRows: 0 }; }
    rsc = await res.text();
  } catch (e) {
    console.log(`  ✗ fetch error: ${(e as Error).message}`);
    return { priceRows: 0, offerRows: 0 };
  }

  const seriesMap = extractSeriesMap(rsc);
  const builds = extractBuilds(rsc);
  annotateSeriesNames(builds, seriesMap);
  console.log(`  payload=${(rsc.length / 1024).toFixed(0)}k builds=${builds.length} series=${seriesMap.size}`);

  if (!builds.length) {
    console.log(`  (no build blocks — nameplate may not expose pricing on this endpoint)`);
    return { priceRows: 0, offerRows: 0 };
  }

  // Pricing
  let priceRows = 0;
  for (const p of products) {
    const build = pickBuildForProduct(p, builds);
    if (!build) { console.log(`  ? no series match for "${p.title}"`); continue; }
    if (!build.driveaway || !build.rrp) { console.log(`  ? incomplete price for "${p.title}" (drive=${build.driveaway}, rrp=${build.rrp})`); continue; }

    const fetched = new Date().toISOString();
    const priceRow = {
      product_id: p.id,
      price_type: 'driveaway',
      rrp: build.rrp,
      driveaway_nsw: build.driveaway,
      driveaway_vic: build.driveaway,
      driveaway_qld: build.driveaway,
      driveaway_wa: build.driveaway,
      driveaway_sa: build.driveaway,
      driveaway_tas: build.driveaway,
      driveaway_act: build.driveaway,
      driveaway_nt: build.driveaway,
      fetched_at: fetched,
      effective_date: fetched.slice(0, 10),
    };

    if (APPLY) {
      const { error: delErr } = await sb.from('variant_pricing').delete().eq('product_id', p.id).eq('price_type', 'driveaway');
      if (delErr) { console.log(`  ✗ delete old driveaway for "${p.title}": ${delErr.message}`); continue; }
      const { error: insErr } = await sb.from('variant_pricing').insert(priceRow);
      if (insErr) { console.log(`  ✗ insert pricing for "${p.title}": ${insErr.message}`); continue; }
      // Denormalise onto products so the dashboard variants page (which reads
      // products.price_amount, not variant_pricing) can render Ford pricing.
      const { error: upErr } = await sb.from('products').update({
        variant_code: build.seriesCode,
        variant_name: build.seriesName,
        price_amount: build.driveaway,
        price_currency: 'AUD',
        price_type: 'driveaway',
        price_raw_string: `$${Math.round(build.driveaway).toLocaleString('en-AU')} driveaway`,
      }).eq('id', p.id);
      if (upErr) console.log(`  ! products.variant_code/price stamp failed for "${p.title}": ${upErr.message}`);
    }

    console.log(`  ✓ "${p.title}" → ${build.seriesName} [${build.seriesCode}]  drive=$${build.driveaway.toLocaleString()}  rrp=$${build.rrp.toLocaleString()}`);
    priceRows++;
  }

  // Offers — dedup by (tagLine, specialInformation) per model
  const offerMap = new Map<string, BuildBlock>();
  for (const b of builds) {
    if (!b.tagLine || !b.specialInformation) continue;
    const key = hash(`${b.tagLine}|${b.specialInformation}`);
    if (!offerMap.has(key)) offerMap.set(key, b);
  }

  let offerRows = 0;
  for (const [h, b] of offerMap) {
    const validity = parseValidity(b.specialInformation);
    const externalKey = `ford-au_${model.slug}_${h.slice(0, 16)}`;
    const row = {
      oem_id: 'ford-au',
      external_key: externalKey,
      model_id: model.id,
      title: b.tagLine!,
      description: b.specialInformation!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000),
      disclaimer_html: b.specialInformation!,
      offer_type: classifyOffer(b.tagLine),
      source_url: pageUrl,
      validity_start: validity.start,
      validity_end: validity.end,
      validity_raw: validity.raw,
      content_hash: h,
      last_seen_at: new Date().toISOString(),
    };

    // offers has no unique constraint on external_key, so do a manual upsert:
    // look for an existing row, UPDATE it if found, otherwise INSERT.
    let writeErr: string | null = null;
    if (APPLY) {
      const { data: existing, error: selErr } = await sb
        .from('offers').select('id').eq('external_key', externalKey).limit(1);
      if (selErr) writeErr = `select: ${selErr.message}`;
      else if (existing?.length) {
        const { error } = await sb.from('offers').update(row).eq('id', existing[0].id);
        if (error) writeErr = `update: ${error.message}`;
      } else {
        const { error } = await sb.from('offers').insert(row);
        if (error) writeErr = `insert: ${error.message}`;
      }
    }
    if (writeErr) { console.log(`  ✗ offer write: ${writeErr}`); continue; }

    const window = validity.start || validity.end
      ? `${validity.start?.slice(0, 10) ?? '—'} → ${validity.end?.slice(0, 10) ?? 'ongoing'}`
      : '(validity not parsed)';
    console.log(`  + offer: "${b.tagLine}"  ${window}`);
    offerRows++;
  }

  return { priceRows, offerRows };
}

// ---- Main ----

async function main() {
  const modelQ = sb.from('vehicle_models').select('id,name,slug').eq('oem_id', 'ford-au').eq('is_active', true);
  if (SLUG_FILTER) modelQ.eq('slug', SLUG_FILTER);
  const { data: models, error: mErr } = await modelQ;
  if (mErr || !models?.length) {
    console.error('No models found:', mErr?.message ?? '(empty)');
    process.exit(1);
  }

  const modelIds = models.map((m) => m.id);
  const { data: allProducts } = await sb.from('products').select('id,title,model_id').eq('oem_id', 'ford-au').in('model_id', modelIds);

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${SLUG_FILTER ? ` (slug=${SLUG_FILTER})` : ''}`);
  console.log(`Models: ${models.length}  Products: ${allProducts?.length ?? 0}`);

  let totalP = 0, totalO = 0;
  for (const m of models) {
    const prods = (allProducts ?? []).filter((p) => p.model_id === m.id);
    const r = await processModel(m, prods);
    totalP += r.priceRows;
    totalO += r.offerRows;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Pricing rows: ${totalP}`);
  console.log(`Offer rows:   ${totalO}`);
  console.log(APPLY ? 'Changes applied.' : 'Dry run — re-run with --apply to write.');
}

main().catch((e) => { console.error(e); process.exit(1); });
