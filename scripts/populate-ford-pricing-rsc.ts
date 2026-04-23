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

type BuildBlock = {
  tuple: string;            // synthesised "<seriesCode>|<powerTrainCode>|<bodyStyleCode>"
  seriesCode: string;       // "ABML1_SE#F7" or "ACMRE_VS-AB"
  seriesShort: string;      // "F7" or "AB"
  seriesName?: string;      // "Sport" / "EcoBoost" / "GT" / "Wildtrak"
  bodyStyleName?: string;   // "Double Cab Pick-up" / "Fastback" / "Convertible" / "SUV"
  bodyStyleCode?: string;
  powerTrainName?: string;  // "2.0L Bi-Turbo Diesel 10AT Part-Time 4x4"
  powerTrainCode?: string;
  driveaway: number;
  rrp: number;
  keyFeatures: { code: string; descKf: string }[];
  tagLine?: string;
  specialInformation?: string;
  // Everything below is flattened from the RSC wrapper's powerTrain.techSpecs
  // and bodyStyle.images — Ford's authoritative figures vs our brochure-LLM
  // approximation. `bodyGalleryUrls` are the 9 angle frames per body style.
  techSpecs?: Record<string, unknown>;
  bodyGalleryUrls?: string[];
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

/**
 * Ford nests techSpecs like:
 *   fuel_and_performance.children.maximum_power.unitTypes.kW.value = "154"
 *   fuel_and_performance.children.maximum_power.unitTypes.kW.unit  = "kW"
 * Walk every leaf `unitTypes.<unit>` and flatten to
 *   { maximum_power: { value: "154", unit: "kW" }, ... }
 * so downstream code doesn't need to know the nested shape.
 */
function flattenTechSpecs(raw: unknown): Record<string, { value: string; unit: string }> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, { value: string; unit: string }> = {};
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.children && typeof n.children === 'object') {
      for (const [specKey, specVal] of Object.entries(n.children as Record<string, unknown>)) {
        const specObj = specVal as Record<string, unknown>;
        const unitTypes = specObj?.unitTypes as Record<string, unknown> | undefined;
        if (unitTypes && typeof unitTypes === 'object') {
          const firstUnit = Object.entries(unitTypes)[0];
          if (firstUnit) {
            const [unitKey, unitVal] = firstUnit;
            const v = (unitVal as any)?.value;
            if (v != null && v !== '-') {
              out[specKey] = { value: String(v), unit: String((unitVal as any)?.unit ?? unitKey) };
            }
          }
        }
        // Nested group (e.g. img_tax has its own children)
        if ((specVal as any)?.children) visit(specVal);
      }
    }
    // Top-level techSpecs groups (img_tax, weights_and_loads, fuel_and_performance…)
    for (const v of Object.values(n)) visit(v);
  };
  visit(raw);
  return Object.keys(out).length ? out : undefined;
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

/**
 * Walk up the brace tree `levels` levels from `idx`, then return the position
 * of the enclosing '{'. Used to find the build wrapper that sits 2 levels
 * above each `basePrice` block.
 */
function findAncestorBrace(str: string, idx: number, levels: number): number {
  let pos = idx;
  for (let lv = 0; lv < levels; lv++) {
    let depth = 0;
    while (pos > 0) {
      pos--;
      if (str[pos] === '}') depth++;
      if (str[pos] === '{') { if (depth === 0) break; depth--; }
    }
    pos--;
  }
  while (pos < str.length && str[pos] !== '{') pos++;
  return pos;
}

/**
 * Extract one BuildBlock per unique (series, powerTrain, bodyStyle) triple.
 *
 * The earlier entity-based extractor only captured builds that Ford decorated
 * with an offer (entity.code/tagLine), which missed Mustang (no entities at
 * all) and the majority of Ranger/Everest builds. Ford's actual build wrapper
 * sits two levels up from every basePrice and always contains a clean
 * `{series, powerTrain, bodyStyle, price, keyFeatures}` shape, whether or not
 * an offer is attached.
 *
 * Offer data (tagLine / specialInformation) is collected separately in a
 * second pass since it's not always inside the build wrapper.
 */
function extractBuilds(rsc: string): BuildBlock[] {
  const builds: BuildBlock[] = [];
  const seen = new Set<string>();

  let scan = 0;
  while (true) {
    const pIdx = rsc.indexOf('"basePrice":{', scan);
    if (pIdx < 0) break;
    scan = pIdx + 12;

    const gpStart = findAncestorBrace(rsc, pIdx, 2);
    const gpBlob = parseBalanced(rsc, gpStart);
    const wrapper = safeJson<any>(gpBlob);
    if (!wrapper || !wrapper.price || !wrapper.series) continue;

    const seriesCode: string = wrapper.series.code ?? '';
    const seriesName: string | undefined = wrapper.series.name;
    const bodyStyleCode: string | undefined = wrapper.bodyStyle?.code;
    const bodyStyleName: string | undefined = wrapper.bodyStyle?.name;
    const powerTrainCode: string | undefined = wrapper.powerTrain?.code;
    const powerTrainName: string | undefined = wrapper.powerTrain?.name;

    const dedupeKey = `${seriesCode}|${powerTrainCode ?? ''}|${bodyStyleCode ?? ''}`;
    if (!seriesCode || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const bp = wrapper.price.basePrice ?? {};
    const drive = typeof bp.polkVehicleDriveAwayPrice === 'number' ? bp.polkVehicleDriveAwayPrice : 0;
    const rrp = typeof bp.grossRetail === 'number' ? bp.grossRetail : 0;
    if (!drive || !rrp) continue;

    const seriesShort = seriesCode.includes('_SE#') ? seriesCode.split('_SE#').pop() ?? ''
      : seriesCode.includes('_VS-') ? seriesCode.split('_VS-').pop() ?? ''
      : seriesCode;

    // Flatten powerTrain.techSpecs — Ford nests every spec under
    //   <group>.children.<spec>.unitTypes.<unit>.value
    // Collapse to a flat { spec_name: { value, unit } } dictionary.
    const techSpecs = flattenTechSpecs(wrapper.powerTrain?.techSpecs);

    // Per-body-style gallery: 9 angle frames. These are shared by every build
    // with the same bodyStyle, but they're more authoritative than the
    // static seed's angle set and are refreshed every run.
    const bodyImages: unknown = wrapper.bodyStyle?.images?.exterior;
    const bodyGalleryUrls: string[] = Array.isArray(bodyImages)
      ? bodyImages.flatMap((entry: any) =>
          Array.isArray(entry?.urls)
            ? entry.urls.map((u: string) => u.startsWith('//') ? `https:${u}` : u)
            : [])
      : [];

    builds.push({
      tuple: dedupeKey,
      seriesCode,
      seriesShort,
      seriesName,
      bodyStyleCode,
      bodyStyleName,
      powerTrainCode,
      powerTrainName,
      driveaway: drive,
      rrp,
      keyFeatures: Array.isArray(wrapper.keyFeatures?.features) ? wrapper.keyFeatures.features : [],
      techSpecs,
      bodyGalleryUrls,
    });
  }

  // Second pass: pair each build with the nearest `entity` offer (if any).
  const entities = extractEntityOffers(rsc);
  for (const b of builds) {
    const match = entities.find((e) => e.seriesCode === b.seriesCode);
    if (match) {
      b.tagLine = match.tagLine;
      b.specialInformation = match.specialInformation;
    }
  }
  return builds;
}

function extractEntityOffers(rsc: string): { seriesCode: string; tagLine?: string; specialInformation?: string }[] {
  const out: { seriesCode: string; tagLine?: string; specialInformation?: string }[] = [];
  let scan = 0;
  while (true) {
    const idx = rsc.indexOf('"entity":{', scan);
    if (idx < 0) break;
    scan = idx + 10;
    const blob = parseBalanced(rsc, idx + '"entity":'.length);
    const ent = safeJson<any>(blob);
    if (!ent?.code) continue;
    const parts = String(ent.code).split('_');
    const platform = parts[0] ?? '';
    const segment = parts.find((p: string) => p.startsWith('SE#') || p.startsWith('VS-')) ?? '';
    const seriesCode = platform && segment ? `${platform}_${segment}` : '';
    if (!seriesCode) continue;
    out.push({
      seriesCode,
      tagLine: cleanDollarEscape(ent.tagLine),
      specialInformation: cleanDollarEscape(ent.specialInformation),
    });
  }
  return out;
}

// Retained so existing callers compile; extractBuilds now fills seriesName
// directly from wrapper.series.name so this is a no-op when the map is absent.
function annotateSeriesNames(builds: BuildBlock[], map: Map<string, string>): void {
  for (const b of builds) {
    if (!b.seriesName && b.seriesCode && map.has(b.seriesCode)) b.seriesName = map.get(b.seriesCode);
  }
}

// ---- Product ↔ series matching ----

/**
 * Pick the build that best represents a product. Matching uses the full
 * {series, body, powerTrain} shape now available in every BuildBlock.
 *
 * 1. Filter to builds whose series name appears in the product title (case-
 *    insensitive). Prefer the longest match so "Wildtrak" beats "XL".
 * 2. If multiple candidates remain, score each against title tokens that
 *    appear in bodyStyleName, powerTrainName, or keyFeatures descKf. That
 *    handles the Mustang case cleanly: "Mustang GT Fastback Manual" scores
 *    high against the build with bodyStyleName="Fastback" and
 *    powerTrainName="5.0L V8  6-Speed Manual RWD Petrol".
 * 3. Final tie-break: cheapest driveaway ("from $X" semantics for products
 *    like "Ranger XL" which cover multiple configurations).
 */
function pickBuildForProduct(product: { title: string }, builds: BuildBlock[]): BuildBlock | null {
  const title = product.title.toLowerCase();

  const candidates = builds.filter((b) => {
    const name = b.seriesName?.toLowerCase();
    if (!name) return false;
    // Word-boundary match so "Ranger XLS" doesn't false-match series "XL".
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(title);
  });
  if (!candidates.length) return null;

  const maxLen = Math.max(...candidates.map((b) => b.seriesName!.length));
  const top = candidates.filter((b) => b.seriesName!.length === maxLen);
  if (top.length === 1) return top[0];

  const seriesWords = new Set(top[0].seriesName!.toLowerCase().split(/\s+/));
  const titleTokens = title
    .split(/[\s-]+/)
    .filter((t) => t.length > 2 && !seriesWords.has(t));

  // Only score against body + powerTrain. Features like "Android Auto" in
  // keyFeatures descKf would cause false positives on the word "auto" in
  // product titles like "Mustang GT Fastback Auto" vs "… Manual".
  const scored = top
    .map((b) => {
      const hay = `${b.bodyStyleName ?? ''} ${b.powerTrainName ?? ''}`.toLowerCase();
      const hits = titleTokens.filter((t) => hay.includes(t)).length;
      return { b, hits };
    })
    .sort((a, z) => z.hits - a.hits || a.b.driveaway - z.b.driveaway);

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

// URL resolution (modelToUrlName, siblingSlugsFor) is imported from
// ./ford-url-map.ts at the top of the file. That module loads Ford's own
// nameplate menu JSON so the mapping updates whenever
// `scripts/fetch-ford-json.ts` is re-run.

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

      // Read current products row so we can merge RSC data into existing
      // brochure-derived fields (specs_json, meta_json) rather than clobber them.
      const { data: current } = await sb.from('products')
        .select('specs_json,meta_json')
        .eq('id', p.id).single();
      const mergedSpecs = { ...(current?.specs_json ?? {}), ...(build.techSpecs ?? {}) };
      const mergedMeta = {
        ...(current?.meta_json ?? {}),
        rsc_source: 'price_endpoint',
        rsc_series_code: build.seriesCode,
        rsc_power_train_code: build.powerTrainCode,
        rsc_body_style_code: build.bodyStyleCode,
        rsc_body_gallery_urls: build.bodyGalleryUrls ?? [],
        rsc_fetched_at: new Date().toISOString(),
      };

      // Denormalise onto products so the dashboard variants page (which reads
      // products.price_amount, not variant_pricing) can render Ford pricing.
      // Also stamp the richer RSC tech specs and per-body gallery URLs.
      const { error: upErr } = await sb.from('products').update({
        variant_code: build.seriesCode,
        variant_name: build.seriesName,
        price_amount: build.driveaway,
        price_currency: 'AUD',
        price_type: 'driveaway',
        price_raw_string: `$${Math.round(build.driveaway).toLocaleString('en-AU')} driveaway`,
        specs_json: mergedSpecs,
        meta_json: mergedMeta,
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
  // Fetch all Ford active models once (regardless of SLUG_FILTER) so that
  // cross-model matching can resolve slugs in EXTRA_MODELS.
  const { data: allModels, error: mErr } = await sb.from('vehicle_models')
    .select('id,name,slug').eq('oem_id', 'ford-au').eq('is_active', true);
  if (mErr || !allModels?.length) {
    console.error('No models found:', mErr?.message ?? '(empty)');
    process.exit(1);
  }
  const models = SLUG_FILTER ? allModels.filter((m) => m.slug === SLUG_FILTER) : allModels;
  const slugToId = new Map(allModels.map((m) => [m.slug, m.id]));

  const { data: allProducts } = await sb.from('products').select('id,title,model_id').eq('oem_id', 'ford-au').in('model_id', allModels.map((m) => m.id));

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${SLUG_FILTER ? ` (slug=${SLUG_FILTER})` : ''}`);
  console.log(`Models: ${models.length}  Products: ${allProducts?.length ?? 0}`);

  // Multiple nameplates share a single Build & Price endpoint
  // (Ranger/Ranger-Raptor both hit /Ranger; all Transit-Custom variants hit
  // /TransitCustom). Dedupe fetches so we only hit each unique URL once —
  // match pool expansion via EXTRA_MODELS already pulls in sibling products.
  const processedUrls = new Set<string>();

  let totalP = 0, totalO = 0;
  for (const m of models) {
    const urlName = modelToUrlName(m.slug);
    if (processedUrls.has(urlName)) {
      console.log(`\n[${m.name}] /${urlName} already fetched via sibling iteration — skipping`);
      continue;
    }
    processedUrls.add(urlName);
    const slugs = [m.slug, ...siblingSlugsFor(m.slug)];
    const poolModelIds = slugs.map((s) => slugToId.get(s)).filter(Boolean) as string[];
    const prods = (allProducts ?? []).filter((p) => poolModelIds.includes(p.model_id));
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
