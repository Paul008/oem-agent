/**
 * Populate Ford `products` from vehicle_models.brochure_url PDFs.
 *
 * Pipeline (per active ford-au vehicle_model with a brochure_url):
 *  1. Fetch the PDF (plain fetch — Ford CDN isn't bot-blocked on /content/dam)
 *  2. Extract text via pdf-parse, chunk by page groups
 *  3. Send each chunk to Groq Llama 3.3 70B → variants + rich specs
 *  4. Non-destructive upsert: UPDATE in place by title-match, INSERT new,
 *     soft-discontinue missing. Product IDs stay stable so variant_colors +
 *     variant_pricing FK references survive.
 *  5. Chain `dashboard/scripts/seed-ford-colors.mjs` to attach colors/images
 *     to any newly-titled products (the color seed matches by title via GPAS
 *     reference data at /Users/paulgiurin/Downloads/OEM-variants-main/).
 *
 * Brochures have NO pricing (Ford deliberately omits — "See Build & Price").
 * `price_amount` stays null; UI should surface a "See B&P" CTA.
 *
 * Run:
 *   pnpm tsx scripts/populate-ford-from-brochures.ts --slug=mustang     # dry-run, single
 *   pnpm tsx scripts/populate-ford-from-brochures.ts --slug=mustang --apply
 *   pnpm tsx scripts/populate-ford-from-brochures.ts --apply            # all — one command refreshes trims + specs + colors
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { PDFParse } from 'pdf-parse';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const APPLY = process.argv.includes('--apply');
const SLUG = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG) : undefined;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_URL/KEY'); process.exit(1); }
if (!GROQ_API_KEY) { console.error('Missing GROQ_API_KEY'); process.exit(1); }
const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Variant {
  name: string;
  body_style?: string | null;
  // Engine
  engine?: string | null;
  power?: string | null;          // formatted string e.g. "125kW @ 3,500rpm"
  torque?: string | null;         // formatted string
  power_kw?: number | null;       // numeric kW
  torque_nm?: number | null;      // numeric Nm
  cylinders?: number | null;
  displacement_cc?: number | null;
  fuel_type?: string | null;
  // Transmission
  transmission?: string | null;
  drive?: string | null;
  gears?: number | null;
  // Capacity
  seats?: number | null;
  doors?: number | null;
  fuel_tank_litres?: number | null;
  boot_litres?: number | null;
  // Dimensions
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  wheelbase_mm?: number | null;
  kerb_weight_kg?: number | null;
  // Towing
  braked_kg?: number | null;
  unbraked_kg?: number | null;
  // Performance
  co2_gkm?: number | null;
  fuel_combined_l100km?: number | null;
  // Safety
  airbags?: number | null;
  ancap_stars?: number | null;
  // Wheels
  wheel_size?: string | null;
  wheel_type?: string | null;
  key_features?: string[];
}

interface Extraction {
  variants: Variant[];
  bodyStyles?: string[];
  notes?: string;
}

async function fetchPdfText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`PDF fetch ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const p = new PDFParse({ data: new Uint8Array(buf) });
  const result = await p.getText();
  return result.text || '';
}

/**
 * Split a long PDF text into page-group chunks the LLM can consume intact.
 * Ford brochures use a consistent "-- N of M --" footer pattern between pages.
 * Falls back to a character-boundary split if the marker is missing.
 */
function chunkByPages(text: string, maxCharsPerChunk = 40_000): string[] {
  const pageMarker = /--\s*\d+\s*of\s*\d+\s*--/g;
  const boundaries: number[] = [0];
  let m: RegExpExecArray | null;
  while ((m = pageMarker.exec(text)) !== null) boundaries.push(m.index);
  boundaries.push(text.length);

  const chunks: string[] = [];
  let bufStart = 0;
  for (let i = 1; i < boundaries.length; i++) {
    const candidate = text.slice(bufStart, boundaries[i]);
    if (candidate.length > maxCharsPerChunk && bufStart < boundaries[i - 1]) {
      chunks.push(text.slice(bufStart, boundaries[i - 1]));
      bufStart = boundaries[i - 1];
    }
  }
  if (bufStart < text.length) chunks.push(text.slice(bufStart));

  // No markers found → coarse char-based split
  if (chunks.length === 0 || chunks[0].length === text.length && text.length > maxCharsPerChunk) {
    const coarse: string[] = [];
    for (let i = 0; i < text.length; i += maxCharsPerChunk) coarse.push(text.slice(i, i + maxCharsPerChunk));
    return coarse;
  }
  return chunks;
}

function slugifyVariant(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Build the canonical specs_json shape the dashboard (variants.vue) renders.
 * Mirrors `OemAgentOrchestrator.buildSpecsJson()` in src/orchestrator.ts so
 * brochure-populated rows look identical to cron-populated ones.
 */
function buildSpecsJson(v: Variant): Record<string, any> | null {
  const specs: Record<string, any> = {};
  const setIf = (obj: Record<string, any>, key: string, val: any) => {
    if (val !== null && val !== undefined && val !== '') obj[key] = val;
  };

  const engine: Record<string, any> = {};
  setIf(engine, 'type', v.fuel_type ?? v.engine);
  setIf(engine, 'description', v.engine);
  setIf(engine, 'power', v.power);
  setIf(engine, 'torque', v.torque);
  setIf(engine, 'power_kw', v.power_kw);
  setIf(engine, 'torque_nm', v.torque_nm);
  setIf(engine, 'cylinders', v.cylinders);
  setIf(engine, 'displacement_cc', v.displacement_cc);
  if (Object.keys(engine).length) specs.engine = engine;

  const transmission: Record<string, any> = {};
  setIf(transmission, 'type', v.transmission);
  setIf(transmission, 'drive', v.drive);
  setIf(transmission, 'gears', v.gears);
  if (Object.keys(transmission).length) specs.transmission = transmission;

  const capacity: Record<string, any> = {};
  setIf(capacity, 'doors', v.doors);
  setIf(capacity, 'seats', v.seats);
  setIf(capacity, 'boot_litres', v.boot_litres);
  setIf(capacity, 'fuel_tank_litres', v.fuel_tank_litres);
  if (Object.keys(capacity).length) specs.capacity = capacity;

  const dimensions: Record<string, any> = {};
  setIf(dimensions, 'length_mm', v.length_mm);
  setIf(dimensions, 'width_mm', v.width_mm);
  setIf(dimensions, 'height_mm', v.height_mm);
  setIf(dimensions, 'wheelbase_mm', v.wheelbase_mm);
  setIf(dimensions, 'kerb_weight_kg', v.kerb_weight_kg);
  if (Object.keys(dimensions).length) specs.dimensions = dimensions;

  const towing: Record<string, any> = {};
  setIf(towing, 'braked_kg', v.braked_kg);
  setIf(towing, 'unbraked_kg', v.unbraked_kg);
  if (Object.keys(towing).length) specs.towing = towing;

  const performance: Record<string, any> = {};
  setIf(performance, 'co2_gkm', v.co2_gkm);
  setIf(performance, 'fuel_combined_l100km', v.fuel_combined_l100km);
  if (Object.keys(performance).length) specs.performance = performance;

  const safety: Record<string, any> = {};
  setIf(safety, 'airbags', v.airbags);
  setIf(safety, 'ancap_stars', v.ancap_stars);
  if (Object.keys(safety).length) specs.safety = safety;

  const wheels: Record<string, any> = {};
  setIf(wheels, 'size', v.wheel_size);
  setIf(wheels, 'type', v.wheel_type);
  if (Object.keys(wheels).length) specs.wheels = wheels;

  return Object.keys(specs).length ? specs : null;
}

/**
 * Compose product title from model name + variant name, avoiding redundancy
 * when the variant name already includes / equals part of the model name.
 *
 * ("Ranger", "Wildtrak")                       → "Ranger Wildtrak"
 * ("Mustang", "Mustang EcoBoost Fastback Auto") → "Mustang EcoBoost Fastback Auto"
 * ("E-Transit", "420L E-Transit")              → "E-Transit 420L"
 * ("Transit Custom Trail", "Trail")            → "Transit Custom Trail"
 */
function buildTitle(modelName: string, variantName: string): string {
  const m = modelName.trim();
  const v = variantName.trim();
  if (!v) return m;
  // Variant already leads with the model name — use as-is
  if (v.toLowerCase().startsWith(m.toLowerCase() + ' ') || v.toLowerCase() === m.toLowerCase()) return v;
  // Variant IS the trailing word of model name (e.g. "Trail" for "Transit Custom Trail")
  const modelTokens = m.split(/\s+/);
  const modelLast = modelTokens[modelTokens.length - 1].toLowerCase();
  if (modelTokens.length > 1 && modelLast === v.toLowerCase()) return m;
  // Variant STARTS with model's last word (e.g. "Trail AWD" for "Transit Custom Trail")
  // — strip the shared leading word to avoid "Transit Custom Trail Trail AWD"
  const variantTokens = v.split(/\s+/);
  if (modelTokens.length > 1 && variantTokens.length > 1 && variantTokens[0].toLowerCase() === modelLast) {
    return `${m} ${variantTokens.slice(1).join(' ')}`;
  }
  // Strip full model name if it appears anywhere in the variant
  const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = v.replace(new RegExp('\\b' + escaped + '\\b', 'i'), '').replace(/\s+/g, ' ').trim();
  if (stripped && stripped !== v) return `${m} ${stripped}`;
  return `${m} ${v}`;
}

/**
 * Per-model variant filter. Some models share brochures (e.g. Ranger + Ranger
 * Raptor both use the full Ranger range brochure; Transit Van/Bus/Cab Chassis
 * share the combined commercials spec sheet). This routes variants to the
 * correct vehicle_model based on slug.
 */
function variantBelongsToModel(slug: string, v: Variant): boolean {
  const name = (v.name || '').toLowerCase();
  const body = (v.body_style || '').toLowerCase();
  const combined = name + ' ' + body;
  switch (slug) {
    case 'ranger':           return !/\braptor\b/.test(combined);
    case 'ranger-raptor':    return /\braptor\b/.test(combined);
    case 'ranger-super-duty': return /super\s*duty|cab\s*chassis|single\s*cab|super\s*cab|double\s*cab/.test(combined);
    case 'transit-van':      return /\bvan\b/.test(combined) && !/bus|cab[\s-]?chassis|c\/c/.test(combined);
    case 'transit-bus':      return /\bbus\b/.test(combined);
    case 'transit-cab-chassis': return /cab[\s-]?chassis|\bc\/c\b/.test(combined);
    default: return true; // no filter
  }
}

async function extractFromChunk(nameplate: string, chunkText: string, chunkIdx: number, chunkCount: number): Promise<Extraction | null> {
  const prompt = `You are a careful automotive data extractor. Below is raw text extracted from pages of a Ford ${nameplate} spec brochure (PDF). This is chunk ${chunkIdx + 1} of ${chunkCount}. Extract the list of variants visible in THIS chunk and their specs.

Return ONLY a JSON object matching exactly:
{
  "variants": [
    {
      "name": "string (trim name e.g. 'XLT', 'Wildtrak', 'Sport', 'GT Fastback Manual')",
      "body_style": "string or null (e.g. 'Double Cab Pick-up', 'Fastback', null)",
      "engine": "string or null (e.g. '2.0L Bi-Turbo Diesel', '5.0L V8')",
      "power": "string or null (formatted, e.g. '154kW @ 3,750rpm')",
      "torque": "string or null (formatted, e.g. '500Nm @ 1,750-2,000rpm')",
      "power_kw": "number or null (numeric kW only, e.g. 154)",
      "torque_nm": "number or null (numeric Nm only, e.g. 500)",
      "cylinders": "number or null",
      "displacement_cc": "number or null (engine size in cubic centimetres, e.g. 1996)",
      "transmission": "string or null (e.g. '10-Speed Automatic')",
      "drive": "string or null ('RWD', 'FWD', '4WD', 'AWD')",
      "gears": "number or null",
      "fuel_type": "string or null ('Diesel', 'Petrol', 'Hybrid', 'Electric', 'PHEV')",
      "seats": "number or null",
      "doors": "number or null",
      "fuel_tank_litres": "number or null",
      "boot_litres": "number or null (cargo volume)",
      "length_mm": "number or null",
      "width_mm": "number or null",
      "height_mm": "number or null",
      "wheelbase_mm": "number or null",
      "kerb_weight_kg": "number or null",
      "braked_kg": "number or null (braked towing capacity)",
      "unbraked_kg": "number or null",
      "co2_gkm": "number or null",
      "fuel_combined_l100km": "number or null (combined fuel consumption)",
      "airbags": "number or null",
      "ancap_stars": "number or null",
      "wheel_size": "string or null (e.g. '17\\\"')",
      "wheel_type": "string or null (e.g. 'Alloy', 'Steel')",
      "key_features": ["up to 5 most notable standard features"]
    }
  ],
  "bodyStyles": ["list of distinct body styles if the brochure covers multiple"],
  "notes": "any important caveat or null"
}

Rules:
- Extract ONLY what is in the PDF text — do not invent values.
- If a spec is shared across all variants, repeat it in each variant.
- Trim names: use Ford's actual labels (XL, XLT, Sport, Wildtrak, Platinum, Raptor, Trend, Active, Titanium, Ambiente, GT Fastback Manual, etc.).
- If the brochure covers only one variant, return one entry.
- Do NOT include pricing.
- Maximum 20 variants.

PDF TEXT:
${chunkText}`;

  // Retry transient failures (429 rate-limit, 5xx, network errors) with
  // exponential backoff. Previously a single 429 would silently drop a chunk
  // and — if it hit every chunk for a nameplate — cause the whole model to be
  // logged as `skip <slug> (no variants)` at apply time with no diagnostic.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let r: Response;
    try {
      r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You extract structured data from automotive brochures. Return strict JSON only.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (e: any) {
      const final = attempt === MAX_ATTEMPTS;
      console.log(`    groq network err (chunk ${chunkIdx + 1}/${chunkCount}, attempt ${attempt}/${MAX_ATTEMPTS})${final ? ' — giving up' : ''}: ${e.message}`);
      if (final) return null;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** (attempt - 1)));
      continue;
    }

    const retryable = r.status === 429 || r.status >= 500;
    if (!r.ok && retryable && attempt < MAX_ATTEMPTS) {
      const body = (await r.text()).slice(0, 200);
      console.log(`    groq ${r.status} (chunk ${chunkIdx + 1}/${chunkCount}, attempt ${attempt}/${MAX_ATTEMPTS}) retrying: ${body}`);
      await new Promise((res) => setTimeout(res, 1000 * 2 ** (attempt - 1)));
      continue;
    }
    if (!r.ok) { console.log(`    groq ${r.status} (chunk ${chunkIdx + 1}/${chunkCount}) — giving up: ${(await r.text()).slice(0, 200)}`); return null; }

    const j: any = await r.json();
    const content = j.choices?.[0]?.message?.content;
    if (!content) return null;
    try { return JSON.parse(content) as Extraction; }
    catch (e: any) { console.log(`    JSON parse (chunk ${chunkIdx + 1}/${chunkCount}): ${e.message}`); return null; }
  }
  return null;
}

/**
 * Extract variants across the full PDF by chunking into page-group chunks,
 * running the LLM per chunk, and merging the results by variant name.
 * Later chunks fill in specs/features that earlier chunks had as null.
 */
async function extractVariants(nameplate: string, text: string): Promise<Extraction | null> {
  const chunks = chunkByPages(text, 40_000);
  console.log(`  chunks: ${chunks.length} (${chunks.map((c) => c.length).join(', ')} chars each)`);
  const byName = new Map<string, Variant>();
  const bodyStyles = new Set<string>();
  let notesParts: string[] = [];
  let chunksFailed = 0;
  for (let i = 0; i < chunks.length; i++) {
    const ext = await extractFromChunk(nameplate, chunks[i], i, chunks.length);
    if (!ext || !Array.isArray(ext.variants)) { chunksFailed++; continue; }
    for (const v of ext.variants) {
      const key = (v.name || '').trim().toLowerCase();
      if (!key) continue;
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, v);
      } else {
        // Merge: fill any nulls from the new chunk across ALL Variant fields.
        const merged: Variant = { name: existing.name };
        const keys = new Set<keyof Variant>([...Object.keys(existing) as (keyof Variant)[], ...Object.keys(v) as (keyof Variant)[]]);
        for (const k of keys) {
          if (k === 'name') continue;
          const a = (existing as any)[k];
          const b = (v as any)[k];
          if (k === 'key_features') {
            (merged as any)[k] = (Array.isArray(a) && a.length) ? a : (Array.isArray(b) ? b : []);
          } else {
            (merged as any)[k] = (a !== undefined && a !== null) ? a : (b ?? null);
          }
        }
        byName.set(key, merged);
      }
    }
    for (const b of ext.bodyStyles ?? []) if (b) bodyStyles.add(b);
    if (ext.notes) notesParts.push(ext.notes);
  }
  if (chunksFailed === chunks.length) {
    console.log(`  ✗ all ${chunks.length} chunks failed — ${nameplate} extraction empty (transient Groq error — re-run this model to recover)`);
  } else if (chunksFailed > 0) {
    console.log(`  ⚠ ${chunksFailed}/${chunks.length} chunks failed — partial extraction (specs may have gaps)`);
  }
  if (!byName.size) return null;
  return { variants: [...byName.values()], bodyStyles: [...bodyStyles], notes: notesParts.join(' | ') || undefined };
}

interface ModelRow { id: string; slug: string; name: string; source_url: string | null; brochure_url: string | null; body_type: string | null; category: string | null; }

async function main() {
  let q = s.from('vehicle_models').select('id, slug, name, source_url, brochure_url, body_type, category').eq('oem_id', 'ford-au').eq('is_active', true).not('brochure_url', 'is', null);
  if (SLUG) q = q.eq('slug', SLUG);
  if (LIMIT) q = q.limit(LIMIT);
  const { data: models, error } = await q.order('slug');
  if (error) throw error;
  if (!models?.length) { console.log('No active Ford models with brochure_url match.'); return; }
  console.log(`Processing ${models.length} nameplate(s)${APPLY ? ' [APPLY]' : ' [DRY RUN]'}\n`);

  const results: Array<{ model: ModelRow; ext: Extraction | null; err?: string }> = [];
  for (const m of models as ModelRow[]) {
    console.log(`=== ${m.slug} (${m.name}) ===`);
    console.log(`  brochure: ${m.brochure_url!.split('/').slice(-1)[0]}`);
    try {
      const text = await fetchPdfText(m.brochure_url!);
      console.log(`  pdf text: ${text.length} chars`);
      const ext = await extractVariants(m.name, text);
      if (ext && Array.isArray(ext.variants) && ext.variants.length) {
        console.log(`  → ${ext.variants.length} variants: ${ext.variants.map((v) => v.name).join(', ')}`);
        results.push({ model: m, ext });
      } else {
        console.log(`  → extraction failed or empty`);
        results.push({ model: m, ext: null, err: 'extraction_empty' });
      }
    } catch (e: any) {
      console.log(`  err: ${e.message}`);
      results.push({ model: m, ext: null, err: e.message });
    }
  }

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to upsert to products');
    const ok = results.filter((r) => r.ext).length;
    const fail = results.length - ok;
    console.log(`Would process: ${ok} models with variants, ${fail} skipped`);
    return;
  }

  // Non-destructive upsert: UPDATE existing products in-place so product.id
  // stays stable and FK references (variant_colors, variant_pricing, etc.)
  // survive. Only INSERT for truly new titles. Mark missing-from-brochure
  // products as `availability='discontinued'` instead of deleting them.
  console.log('\n=== Applying: non-destructive upsert per model ===');
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalDiscontinued = 0;
  for (const r of results) {
    if (!r.ext || !r.ext.variants.length) { console.log(`  skip ${r.model.slug} (no variants)`); continue; }

    // 1. Filter variants that belong to this specific model (shared brochures).
    const filtered = r.ext.variants.filter((v) => variantBelongsToModel(r.model.slug, v));
    if (!filtered.length) { console.log(`  skip ${r.model.slug} (filter excluded all variants)`); continue; }

    // 2. Dedupe by the computed title.
    const byTitle = new Map<string, Variant>();
    for (const v of filtered) {
      const title = buildTitle(r.model.name, v.name);
      if (!byTitle.has(title)) byTitle.set(title, v);
    }

    // 3. Load existing products — match by normalized title.
    const { data: existing } = await s.from('products').select('id, title, availability').eq('model_id', r.model.id);
    const existingByTitle = new Map<string, { id: string; title: string; availability: string | null }>();
    for (const e of existing ?? []) existingByTitle.set(e.title.toLowerCase().trim(), e);

    const nowIso = new Date().toISOString();
    let inserted = 0, updated = 0, discontinued = 0;

    for (const [title, v] of byTitle) {
      const patch = {
        subtitle: v.body_style ?? null,
        body_type: r.model.body_type ?? null,
        fuel_type: v.fuel_type ?? null,
        availability: 'available',   // revives any previously-discontinued row
        source_url: r.model.source_url,
        engine_desc: v.engine ?? null,
        transmission: v.transmission ?? null,
        drive: v.drive ?? null,
        drivetrain: v.drive ?? null,   // dashboard reads both
        seats: v.seats ?? null,
        variant_name: v.name,
        key_features: v.key_features ?? [],
        specs_json: buildSpecsJson(v),   // populates /dashboard/variants spec panels
        meta_json: {
          source: 'brochure',
          brochure_url: r.model.brochure_url,
          extracted_at: nowIso,
          extraction_model: 'groq/llama-3.3-70b',
          power: v.power ?? null,
          torque: v.torque ?? null,
        },
        last_seen_at: nowIso,
      };
      const match = existingByTitle.get(title.toLowerCase().trim());
      if (match) {
        // UPDATE — preserves product.id so variant_colors/variant_pricing FKs survive
        const { error } = await s.from('products').update(patch).eq('id', match.id);
        if (error) console.log(`    update ${title}: ${error.message}`);
        else updated++;
      } else {
        // INSERT (new variant we haven't seen before)
        const { error } = await s.from('products').insert({
          ...patch,
          oem_id: 'ford-au',
          model_id: r.model.id,
          external_key: `ford-au_${slugifyVariant(title)}`,
          title,
          price_amount: null,
          price_currency: 'AUD',
          price_type: null,
          price_raw_string: null,
          cta_links: [],
          variants: [],
        });
        if (error) console.log(`    insert ${title}: ${error.message}`);
        else inserted++;
      }
    }

    // 4. Soft-discontinue existing rows whose title no longer appears in the brochure.
    const newTitles = new Set([...byTitle.keys()].map((t) => t.toLowerCase().trim()));
    for (const [key, e] of existingByTitle) {
      if (newTitles.has(key)) continue;
      if (e.availability === 'discontinued') continue;
      const { error } = await s.from('products').update({ availability: 'discontinued', last_seen_at: nowIso }).eq('id', e.id);
      if (error) console.log(`    discontinue ${e.title}: ${error.message}`);
      else discontinued++;
    }

    totalInserted += inserted;
    totalUpdated += updated;
    totalDiscontinued += discontinued;
    console.log(`  ${r.model.slug}: +${inserted} new, ~${updated} updated, ⊘${discontinued} discontinued`);
  }
  console.log(`\nSummary: +${totalInserted} inserted, ~${totalUpdated} updated, ⊘${totalDiscontinued} discontinued across ${results.filter((r) => r.ext).length} models`);
  console.log(`  Product IDs preserved — variant_colors and variant_pricing FK references survive.`);

  // 5. Chain the color seed so any renamed/new products get images attached.
  //    Only runs when we actually inserted OR updated products (not on dry-run,
  //    which returns before reaching this block).
  const seedScript = path.resolve(__dirname, '..', 'dashboard', 'scripts', 'seed-ford-colors.mjs');
  if (fs.existsSync(seedScript)) {
    console.log('\n=== Re-seeding Ford colors (dashboard/scripts/seed-ford-colors.mjs) ===');
    try {
      execSync(`node "${seedScript}"`, { stdio: 'inherit' });
    } catch (e: any) {
      console.log(`  color seed failed: ${e.message}`);
      console.log(`  (products updated successfully; re-run the seed manually)`);
    }
  } else {
    console.log(`\n  note: seed-ford-colors.mjs not found at ${seedScript} — skipping color re-seed`);
  }

  // 6. Chain the pricing + offers RSC extract. Runs after colors so variant_code
  //    is stamped on products that were freshly renamed/inserted above.
  const pricingScript = path.resolve(__dirname, 'populate-ford-pricing-rsc.ts');
  if (fs.existsSync(pricingScript)) {
    console.log('\n=== Chaining Ford pricing + offers RSC extract ===');
    try {
      execSync(`npx tsx "${pricingScript}" --apply`, { stdio: 'inherit' });
    } catch (e: any) {
      console.log(`  pricing extract failed: ${e.message}`);
      console.log(`  (products updated successfully; re-run populate-ford-pricing-rsc.ts manually)`);
    }
  } else {
    console.log(`\n  note: populate-ford-pricing-rsc.ts not found — skipping pricing extract`);
  }

  // 7. Chain the accessories extract. Independent of pricing (different endpoint)
  //    but runs afterwards so logs read in the order: trims → colors → pricing → accessories.
  const accessoriesScript = path.resolve(__dirname, 'populate-ford-accessories-rsc.ts');
  if (fs.existsSync(accessoriesScript)) {
    console.log('\n=== Chaining Ford accessories RSC extract ===');
    try {
      execSync(`npx tsx "${accessoriesScript}" --apply`, { stdio: 'inherit' });
    } catch (e: any) {
      console.log(`  accessories extract failed: ${e.message}`);
      console.log(`  (products/pricing updated successfully; re-run populate-ford-accessories-rsc.ts manually)`);
    }
  } else {
    console.log(`\n  note: populate-ford-accessories-rsc.ts not found — skipping accessories extract`);
  }

  // 8. Chain the colour premium pricing update. Hits the same /summary endpoint
  //    as accessories but writes only to variant_colors.price_delta / is_standard.
  const colourPricingScript = path.resolve(__dirname, 'populate-ford-colour-pricing-rsc.ts');
  if (fs.existsSync(colourPricingScript)) {
    console.log('\n=== Chaining Ford colour pricing RSC extract ===');
    try {
      execSync(`npx tsx "${colourPricingScript}" --apply`, { stdio: 'inherit' });
    } catch (e: any) {
      console.log(`  colour pricing extract failed: ${e.message}`);
      console.log(`  (everything else updated successfully; re-run populate-ford-colour-pricing-rsc.ts manually)`);
    }
  } else {
    console.log(`\n  note: populate-ford-colour-pricing-rsc.ts not found — skipping colour pricing extract`);
  }

  // 9. Chain the gallery enrichment. Threshold-guarded — only touches rows
  //    where existing gallery_urls.length < 8 (covers Ranger Super Duty's
  //    sparse seed data; other nameplates already have 9–13 images/colour
  //    from the static seed and are left alone).
  const galleriesScript = path.resolve(__dirname, 'populate-ford-galleries-rsc.ts');
  if (fs.existsSync(galleriesScript)) {
    console.log('\n=== Chaining Ford gallery enrichment RSC extract ===');
    try {
      execSync(`npx tsx "${galleriesScript}" --apply`, { stdio: 'inherit' });
    } catch (e: any) {
      console.log(`  gallery enrichment failed: ${e.message}`);
      console.log(`  (everything else updated successfully; re-run populate-ford-galleries-rsc.ts manually)`);
    }
  } else {
    console.log(`\n  note: populate-ford-galleries-rsc.ts not found — skipping gallery enrichment`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
