/**
 * PDF Spec Extractor
 *
 * Extracts structured vehicle specifications from OEM PDF spec sheets that
 * have already been chunked and stored in `pdf_embeddings`.
 *
 * Pipeline:
 *   1. Query vehicle_models with brochure_url
 *   2. Fetch pdf_embeddings chunks for each model
 *   3. Concatenate chunks, build LLM prompt
 *   4. Call AI router (spec_extraction task → Gemini Flash)
 *   5. Parse + validate JSON response
 *   6. Store to vehicle_models.extracted_specs
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export interface SpecEntry {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  raw: string;
}

export interface SpecCategory {
  name: string;
  specs: SpecEntry[];
}

export interface ExtractedSpecs {
  _version: number;
  _source_pdf: string;
  _extracted_at: string;
  _model_year?: string;
  _variant?: string;
  categories: SpecCategory[];
}

export interface SpecExtractionResult {
  models_processed: number;
  models_skipped: number;
  models_failed: number;
  extractions: Array<{
    model_id: string;
    oem_id: string;
    slug: string;
    categories_count: number;
    specs_count: number;
    source_pdf: string;
  }>;
  errors: Array<{ model_id: string; error: string }>;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  specsCount: number;
  categoriesCount: number;
}

// ============================================================================
// Well-Known Spec Keys (~50 snake_case automotive spec keys across 6 domains)
// ============================================================================

export const WELL_KNOWN_KEYS: string[] = [
  // Engine
  'engine_type',
  'power_kw',
  'torque_nm',
  'cylinders',
  'displacement_cc',
  'transmission',
  'transmission_speeds',
  'drive_type',
  'fuel_type',

  // EV / PHEV
  'battery_kwh',
  'range_km',
  'charge_time_ac_hours',
  'charge_time_dc_minutes',
  'motor_power_kw',
  'motor_torque_nm',
  'regen_braking',
  'charge_port_type',
  'onboard_charger_kw',

  // Dimensions
  'length_mm',
  'width_mm',
  'height_mm',
  'wheelbase_mm',
  'ground_clearance_mm',
  'kerb_weight_kg',
  'gross_vehicle_mass_kg',
  'boot_litres',
  'cargo_volume_litres',
  'turning_circle_m',

  // Performance & Capability
  'towing_capacity_kg',
  'towing_capacity_unbraked_kg',
  'payload_kg',
  'fuel_economy_l100km',
  'fuel_tank_l',
  'top_speed_kmh',
  'acceleration_0_100_s',
  'wading_depth_mm',
  'approach_angle_deg',
  'departure_angle_deg',

  // Safety
  'ancap_rating',
  'airbags',
  'abs',
  'esc',
  'aeb',
  'blind_spot_monitor',
  'lane_keep_assist',
  'rear_camera',
  'parking_sensors',
  'adaptive_cruise_control',
  'rear_cross_traffic_alert',

  // Technology
  'screen_size_inch',
  'apple_carplay',
  'android_auto',
  'satellite_navigation',
  'cruise_control',
  'climate_zones',
  'sunroof',
  'heated_seats',
  'wireless_charging',
  'speaker_count',
];

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates the AI response to confirm it matches the ExtractedSpecs shape
 * and contains at least 3 meaningful spec values.
 */
export function validateSpecsJson(data: unknown): ValidationResult {
  const empty: ValidationResult = { valid: false, specsCount: 0, categoriesCount: 0 };

  if (typeof data !== 'object' || data === null) {
    return { ...empty, error: 'Response must be an object' };
  }

  const obj = data as Record<string, unknown>;

  if (!('categories' in obj)) {
    return { ...empty, error: 'Missing required field: categories' };
  }

  if (!Array.isArray(obj.categories)) {
    return { ...empty, error: 'categories must be an array' };
  }

  if (obj.categories.length === 0) {
    return { ...empty, error: 'categories array must not be empty' };
  }

  let totalSpecs = 0;
  let categoriesWithData = 0;

  for (let ci = 0; ci < obj.categories.length; ci++) {
    const cat = obj.categories[ci] as Record<string, unknown>;

    if (!('specs' in cat) || !Array.isArray(cat.specs)) {
      return { ...empty, error: `Category at index ${ci} must have a specs array` };
    }

    for (let si = 0; si < (cat.specs as unknown[]).length; si++) {
      const spec = (cat.specs as unknown[])[si] as Record<string, unknown>;

      if (typeof spec?.key !== 'string') {
        return { ...empty, error: `Spec at category[${ci}].specs[${si}] must have a string key field` };
      }

      // Count only specs with a non-empty value
      if (typeof spec.value === 'string' && spec.value.trim() !== '') {
        totalSpecs++;
      } else if (spec.value !== undefined && spec.value !== null && spec.value !== '') {
        totalSpecs++;
      }
    }

    categoriesWithData++;
  }

  if (totalSpecs < 3) {
    return {
      ...empty,
      categoriesCount: categoriesWithData,
      error: `Extracted fewer than 3 non-empty specs (got ${totalSpecs}). The PDF chunk may not contain tabular spec data.`,
    };
  }

  return {
    valid: true,
    specsCount: totalSpecs,
    categoriesCount: categoriesWithData,
  };
}

// ============================================================================
// Prompt Builder
// ============================================================================

const MAX_CHUNK_LENGTH = 50_000;

/**
 * Builds the vision-based LLM prompt for variant-aware spec extraction.
 * Used with Gemini vision (PDF input) — instructs the model to detect variant
 * matrices (column headers + standard/optional dots) and emit per-variant specs.
 */
export function buildVisionExtractionPrompt(modelName: string, oemName: string): string {
  const wellKnownList = WELL_KNOWN_KEYS.join(', ');

  return `You are an automotive data extraction specialist. Extract all technical specifications from this ${oemName} ${modelName} brochure PDF.

## Critical Instructions
- The PDF may contain a VARIANT MATRIX: a table with multiple variant columns (e.g. "V7-C 4x2", "V7-C 4x4", "V9-L 4x4") and rows with spec values.
- Standard/Optional/Unavailable dots (● ○ —) in cells indicate which variants HAVE that feature.
- A spec value in column 1 with dots in variant columns means: that value applies to all variants where the dot is filled (●).
- Different values across variant columns mean each variant has its own value (extract per-variant).

## Output Structure
Return a single JSON object with TWO sections:

1. **categories** — combined/base spec set (use the most common/base variant). This is the model-level overview.
2. **variants** — array of per-variant spec sets, ONE entry per variant column you detect. If the PDF has only ONE variant (no matrix), omit "variants" or leave it empty.

For each variant, populate match_hints with anything that helps identify which dealer product row it matches:
- Drivetrain: "4x2", "4x4", "AWD", "FWD", "RWD"
- Trim level: "V7-C", "V9-L", "GR Sport", "Cruiser"
- Engine: "2.0L Diesel", "1.8L Hybrid"
- Body: "Dual Cab", "Single Cab", "Wagon"

## Spec Format
For each spec provide:
- key: snake_case identifier (use well-known keys when applicable)
- label: human-readable label from the document
- value: extracted value as a string (use "Standard"/"Optional"/"—" for boolean features)
- unit: unit of measurement (e.g. "kW", "mm", "L") or null
- raw: exact text from source

## Well-Known Keys (use when applicable)
${wellKnownList}

## Required JSON Schema
{
  "_version": 2,
  "_source_pdf": "<filename or section>",
  "_extracted_at": "<ISO timestamp>",
  "_model_year": "<year if found>",
  "_variant": "<base variant name>",
  "categories": [
    {
      "name": "Engine",
      "specs": [
        { "key": "engine_type", "label": "Type", "value": "2.0L 4 Cylinder Diesel", "unit": null, "raw": "2.0L 4 Cylinder Diesel with 48V Assist" }
      ]
    }
  ],
  "variants": [
    {
      "name": "Tunland V7-C 4x2",
      "match_hints": ["v7-c", "4x2", "v7c"],
      "model_year": "2026",
      "categories": [
        { "name": "Engine", "specs": [...] },
        { "name": "Performance", "specs": [...] }
      ]
    }
  ]
}

Return only the JSON object — no markdown, no code fences, no commentary.`;
}

/**
 * Builds the LLM prompt for structured spec extraction.
 */
export function buildExtractionPrompt(
  modelName: string,
  oemName: string,
  chunkText: string,
): string {
  const truncated = chunkText.length > MAX_CHUNK_LENGTH
    ? chunkText.slice(0, MAX_CHUNK_LENGTH)
    : chunkText;

  const wellKnownList = WELL_KNOWN_KEYS.join(', ');

  return `You are an automotive data extraction specialist. Extract all technical specifications from the following PDF text for the ${oemName} ${modelName}.

## Instructions
- Return a valid JSON object matching the schema below — no markdown, no code fences.
- Group specs into logical categories (e.g. Engine, Dimensions, Performance, Safety, Technology).
- For each spec provide:
  - key: snake_case identifier (use well-known keys below when they match)
  - label: human-readable label from the document
  - value: extracted value as a string
  - unit: unit of measurement (e.g. "kW", "mm", "L") or null if not applicable
  - raw: the exact text from the source document
- If a spec is mentioned but has no value, still include it with value: ""
- If the document covers multiple variants/trim levels, extract the base variant; note others in _variant field.

## Well-Known Keys (use these when applicable)
${wellKnownList}

## Required JSON Schema
{
  "_version": 1,
  "_source_pdf": "<inferred filename or section>",
  "_extracted_at": "<ISO timestamp>",
  "_model_year": "<year if found>",
  "_variant": "<variant/trim if applicable>",
  "categories": [
    {
      "name": "<Category Name>",
      "specs": [
        {
          "key": "power_kw",
          "label": "Maximum Power",
          "value": "110",
          "unit": "kW",
          "raw": "110 kW @ 6000 rpm"
        }
      ]
    }
  ]
}

## Source Text
${truncated}`;
}

// ============================================================================
// Main Executor
// ============================================================================

interface AiRouter {
  route: (req: {
    taskType: string;
    prompt: string;
    oemId?: string;
    pdfBase64?: string;
    maxTokens?: number;
  }) => Promise<{ content: string }>;
}

// ============================================================================
// Variant types (per-variant spec extraction)
// ============================================================================

export interface VariantSpecs {
  /** Display name from PDF e.g. "Tunland V7-C 4x4" */
  name: string;
  /** Hints to help match this variant to a product row (variant codes, drivetrains, trim names) */
  match_hints: string[];
  /** Optional model year if PDF segregates by year */
  model_year?: string | null;
  /** Per-variant categories with specs */
  categories: SpecCategory[];
}

export interface ExtractedSpecsWithVariants extends ExtractedSpecs {
  /** Per-variant specs when the PDF contains a variant matrix */
  variants?: VariantSpecs[];
}

interface ExecuteOptions {
  modelIds?: string[];
  maxModels?: number;
  force?: boolean;
}

/**
 * Executes PDF spec extraction for all vehicle models that have a brochure_url.
 *
 * Skips models where extracted_specs_at is within the last 30 days (unless force=true).
 */
export async function executePdfSpecExtraction(
  supabase: SupabaseClient,
  aiRouter: AiRouter,
  options: ExecuteOptions = {},
): Promise<SpecExtractionResult> {
  const { modelIds, maxModels, force = false } = options;

  const result: SpecExtractionResult = {
    models_processed: 0,
    models_skipped: 0,
    models_failed: 0,
    extractions: [],
    errors: [],
  };

  // ── 1. Fetch models with brochure URLs ──────────────────────────────────
  let query = supabase
    .from('vehicle_models')
    .select('id, slug, oem_id, brochure_url, extracted_specs_at')
    .not('brochure_url', 'is', null);

  if (modelIds?.length) {
    query = query.in('id', modelIds);
  }

  if (maxModels) {
    query = query.limit(maxModels);
  }

  const { data: models, error: modelsError } = await query;

  if (modelsError) {
    console.error('[pdf-spec-extractor] Failed to fetch models:', modelsError.message);
    return result;
  }

  if (!models?.length) {
    console.log('[pdf-spec-extractor] No models with brochure_url found.');
    return result;
  }

  console.log(`[pdf-spec-extractor] Found ${models.length} model(s) to process.`);

  // ── 2. Fetch OEM names in one query ────────────────────────────────────
  const oemIds = [...new Set(models.map((m: { oem_id: string }) => m.oem_id))];
  const { data: oems } = await supabase
    .from('oems')
    .select('id, name')
    .in('id', oemIds);

  const oemNameById: Record<string, string> = {};
  for (const oem of oems ?? []) {
    oemNameById[oem.id] = oem.name;
  }

  // ── 3. Process each model ───────────────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  for (const model of models) {
    const modelId: string = model.id;
    const oemId: string = model.oem_id;
    const slug: string = model.slug;
    const brochureUrl: string = model.brochure_url;
    const oemName = oemNameById[oemId] ?? oemId;

    // ── 3a. Staleness check ─────────────────────────────────────────────
    if (!force && model.extracted_specs_at && model.extracted_specs_at > thirtyDaysAgo) {
      console.log(`[pdf-spec-extractor] Skipping ${slug} — extracted ${model.extracted_specs_at}`);
      result.models_skipped++;
      continue;
    }

    try {
      // ── 3b. Fetch PDF embedding chunks ─────────────────────────────────
      const { data: chunks, error: chunksError } = await supabase
        .from('pdf_embeddings')
        .select('chunk_text, chunk_index')
        .eq('source_id', modelId)
        .eq('source_type', 'brochure')
        .order('chunk_index', { ascending: true });

      if (chunksError) {
        throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
      }

      if (!chunks?.length) {
        console.log(`[pdf-spec-extractor] No chunks for ${slug}, skipping.`);
        result.models_skipped++;
        continue;
      }

      // ── 3c. Concatenate chunks ─────────────────────────────────────────
      const chunkText = chunks.map((c: { chunk_text: string }) => c.chunk_text).join('\n\n');

      // ── 3d. Build prompt and call AI ───────────────────────────────────
      const modelName = slug.replace(/-/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase());
      const prompt = buildExtractionPrompt(modelName, oemName, chunkText);

      console.log(`[pdf-spec-extractor] Calling AI for ${oemId}/${slug} (${chunks.length} chunks)...`);

      const response = await aiRouter.route({
        taskType: 'spec_extraction',
        prompt,
        oemId,
      });

      // ── 3e. Parse JSON (strip markdown code blocks) ────────────────────
      let rawContent = response.content.trim();
      rawContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch (parseErr) {
        throw new Error(`Failed to parse AI response as JSON: ${String(parseErr)}`);
      }

      // ── 3f. Validate ───────────────────────────────────────────────────
      const validation = validateSpecsJson(parsed);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.error}`);
      }

      // ── 3g. Enrich with metadata ───────────────────────────────────────
      const specs = parsed as ExtractedSpecs;
      specs._version = 1;
      specs._source_pdf = brochureUrl;
      specs._extracted_at = new Date().toISOString();

      // ── 3h. Store to DB ────────────────────────────────────────────────
      const { error: upsertError } = await supabase
        .from('vehicle_models')
        .update({
          extracted_specs: specs,
          extracted_specs_source: 'pdf',
          extracted_specs_at: specs._extracted_at,
        })
        .eq('id', modelId);

      if (upsertError) {
        throw new Error(`DB update failed: ${upsertError.message}`);
      }

      result.models_processed++;
      result.extractions.push({
        model_id: modelId,
        oem_id: oemId,
        slug,
        categories_count: validation.categoriesCount,
        specs_count: validation.specsCount,
        source_pdf: brochureUrl,
      });

      console.log(
        `[pdf-spec-extractor] ✓ ${oemId}/${slug}: ` +
        `${validation.specsCount} specs in ${validation.categoriesCount} categories`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[pdf-spec-extractor] ✗ ${oemId}/${slug}: ${message}`);
      result.models_failed++;
      result.errors.push({ model_id: modelId, error: message });
    }
  }

  console.log(
    `[pdf-spec-extractor] Done. processed=${result.models_processed} ` +
    `skipped=${result.models_skipped} failed=${result.models_failed}`,
  );

  return result;
}

// ============================================================================
// Vision-Based Extractor (Gemini PDF input + variant matrix support)
// ============================================================================

export interface VisionExtractionResult extends SpecExtractionResult {
  variants_matched: number;
  variants_unmatched: number;
  variants_extracted: number;
}

/**
 * Vision-based PDF spec extraction using Gemini's native PDF input.
 *
 * Unlike the text-chunk extractor, this sends the entire PDF directly to Gemini
 * as inlineData (mime: application/pdf). The model can SEE variant matrices
 * with standard/optional dots and emit per-variant specs.
 *
 * Pipeline:
 *   1. Fetch model + brochure_url
 *   2. Download PDF, base64-encode
 *   3. Call Gemini with vision prompt + PDF
 *   4. Parse combined + variants from response
 *   5. Save combined to vehicle_models.extracted_specs
 *   6. Map variants to products and update each product's specs_json
 */
export async function executePdfSpecExtractionVision(
  supabase: SupabaseClient,
  aiRouter: AiRouter,
  options: ExecuteOptions = {},
): Promise<VisionExtractionResult> {
  const { modelIds, maxModels, force = false } = options;

  const result: VisionExtractionResult = {
    models_processed: 0,
    models_skipped: 0,
    models_failed: 0,
    extractions: [],
    errors: [],
    variants_matched: 0,
    variants_unmatched: 0,
    variants_extracted: 0,
  };

  // ── 1. Fetch models ──
  let query = supabase
    .from('vehicle_models')
    .select('id, slug, name, oem_id, brochure_url, extracted_specs_at')
    .not('brochure_url', 'is', null);

  if (modelIds?.length) query = query.in('id', modelIds);
  if (maxModels) query = query.limit(maxModels);

  const { data: models, error: modelsError } = await query;
  if (modelsError) {
    console.error('[pdf-spec-extractor:vision] Failed to fetch models:', modelsError.message);
    return result;
  }
  if (!models?.length) {
    console.log('[pdf-spec-extractor:vision] No models with brochure_url found.');
    return result;
  }

  console.log(`[pdf-spec-extractor:vision] Found ${models.length} model(s) to process.`);

  // ── 2. OEM names ──
  const oemIds = [...new Set(models.map((m: { oem_id: string }) => m.oem_id))];
  const { data: oems } = await supabase.from('oems').select('id, name').in('id', oemIds);
  const oemNameById: Record<string, string> = {};
  for (const oem of oems ?? []) oemNameById[oem.id] = oem.name;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // ── 3. Process each model ──
  for (const model of models) {
    const modelId: string = model.id;
    const oemId: string = model.oem_id;
    const slug: string = model.slug;
    const modelName: string = model.name ?? slug;
    const brochureUrl: string = model.brochure_url;
    const oemName = oemNameById[oemId] ?? oemId;

    if (!force && model.extracted_specs_at && model.extracted_specs_at > thirtyDaysAgo) {
      console.log(`[pdf-spec-extractor:vision] Skipping ${slug} — extracted ${model.extracted_specs_at}`);
      result.models_skipped++;
      continue;
    }

    try {
      // ── 3a. Download PDF ──
      console.log(`[pdf-spec-extractor:vision] Downloading PDF for ${oemId}/${slug}: ${brochureUrl}`);
      const pdfResponse = await fetch(brochureUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      });
      if (!pdfResponse.ok) {
        throw new Error(`PDF download failed: HTTP ${pdfResponse.status}`);
      }
      const pdfBuffer = await pdfResponse.arrayBuffer();
      const pdfSizeMb = pdfBuffer.byteLength / 1024 / 1024;
      console.log(`[pdf-spec-extractor:vision] Downloaded ${pdfSizeMb.toFixed(2)}MB`);

      // Gemini has a 20MB inline limit; PDFs over that need Files API (skip for now)
      if (pdfSizeMb > 18) {
        throw new Error(`PDF too large for inline upload (${pdfSizeMb.toFixed(2)}MB > 18MB limit)`);
      }

      // ── 3b. Base64 encode ──
      const pdfBase64 = arrayBufferToBase64(pdfBuffer);

      // ── 3c. Build prompt + call Gemini vision ──
      const prompt = buildVisionExtractionPrompt(modelName, oemName);
      console.log(`[pdf-spec-extractor:vision] Calling Gemini for ${oemId}/${slug}...`);

      const response = await aiRouter.route({
        taskType: 'spec_extraction',
        prompt,
        oemId,
        pdfBase64,
        maxTokens: 60000,
      });

      // ── 3d. Parse JSON ──
      let rawContent = response.content.trim();
      rawContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

      let parsed: ExtractedSpecsWithVariants;
      try {
        parsed = JSON.parse(rawContent) as ExtractedSpecsWithVariants;
      } catch (parseErr) {
        throw new Error(`Failed to parse AI response as JSON: ${String(parseErr)}`);
      }

      // ── 3e. Validate combined ──
      const validation = validateSpecsJson(parsed);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.error}`);
      }

      // ── 3f. Enrich + save combined to vehicle_models ──
      parsed._version = 2;
      parsed._source_pdf = brochureUrl;
      parsed._extracted_at = new Date().toISOString();

      const { error: upsertError } = await supabase
        .from('vehicle_models')
        .update({
          extracted_specs: parsed,
          extracted_specs_source: 'pdf-vision',
          extracted_specs_at: parsed._extracted_at,
        })
        .eq('id', modelId);

      if (upsertError) {
        throw new Error(`DB update failed: ${upsertError.message}`);
      }

      // ── 3g. Map variants to products ──
      let matched = 0;
      let unmatched = 0;
      const variants = parsed.variants ?? [];
      if (variants.length > 0) {
        const matchResult = await mapVariantsToProducts(supabase, modelId, variants);
        matched = matchResult.matched;
        unmatched = matchResult.unmatched;
        result.variants_extracted += variants.length;
        result.variants_matched += matched;
        result.variants_unmatched += unmatched;
        console.log(`[pdf-spec-extractor:vision] ${variants.length} variants → ${matched} matched, ${unmatched} unmatched`);
      }

      result.models_processed++;
      result.extractions.push({
        model_id: modelId,
        oem_id: oemId,
        slug,
        categories_count: validation.categoriesCount,
        specs_count: validation.specsCount,
        source_pdf: brochureUrl,
      });

      console.log(
        `[pdf-spec-extractor:vision] ✓ ${oemId}/${slug}: ` +
        `${validation.specsCount} specs, ${variants.length} variants (${matched} matched)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[pdf-spec-extractor:vision] ✗ ${oemId}/${slug}: ${message}`);
      result.models_failed++;
      result.errors.push({ model_id: modelId, error: message });
    }
  }

  console.log(
    `[pdf-spec-extractor:vision] Done. processed=${result.models_processed} ` +
    `skipped=${result.models_skipped} failed=${result.models_failed} ` +
    `variants_matched=${result.variants_matched}/${result.variants_extracted}`,
  );

  return result;
}

// ============================================================================
// Variant → Product Matching
// ============================================================================

interface MatchResult {
  matched: number;
  unmatched: number;
  details: Array<{ variant_name: string; product_id?: string; confidence: number }>;
}

/**
 * Maps extracted variants to existing product rows by fuzzy matching.
 *
 * Strategy:
 *   1. Fetch all products for the given model_id
 *   2. For each variant from the PDF, score each product on token overlap
 *      between variant.name + variant.match_hints and product.title/variant_name/variant_code
 *   3. Pick the highest-scoring product (must exceed 0.4 confidence)
 *   4. Update the product's specs_json with a _pdf_variant_specs key
 */
export async function mapVariantsToProducts(
  supabase: SupabaseClient,
  modelId: string,
  variants: VariantSpecs[],
): Promise<MatchResult> {
  const result: MatchResult = { matched: 0, unmatched: 0, details: [] };

  // Fetch all products for this model
  const { data: products, error } = await supabase
    .from('products')
    .select('id, title, variant_name, variant_code, subtitle, specs_json')
    .eq('model_id', modelId);

  if (error || !products?.length) {
    console.warn(`[mapVariantsToProducts] No products for model ${modelId}: ${error?.message ?? 'empty'}`);
    for (const v of variants) result.details.push({ variant_name: v.name, confidence: 0 });
    result.unmatched = variants.length;
    return result;
  }

  // Track which products have already been matched (one-to-one)
  const usedProductIds = new Set<string>();

  for (const variant of variants) {
    const variantTokens = tokenize([
      variant.name,
      ...(variant.match_hints ?? []),
    ].join(' '));

    let bestScore = 0;
    let bestProductId: string | undefined;
    let bestProduct: typeof products[number] | undefined;

    for (const product of products) {
      if (usedProductIds.has(product.id)) continue;

      const productTokens = tokenize([
        product.title ?? '',
        product.variant_name ?? '',
        product.variant_code ?? '',
        product.subtitle ?? '',
      ].join(' '));

      const score = jaccardSimilarity(variantTokens, productTokens);
      if (score > bestScore) {
        bestScore = score;
        bestProductId = product.id;
        bestProduct = product;
      }
    }

    if (bestProductId && bestProduct && bestScore >= 0.25) {
      usedProductIds.add(bestProductId);
      result.matched++;
      result.details.push({ variant_name: variant.name, product_id: bestProductId, confidence: bestScore });

      // Merge variant specs into product.specs_json under _pdf_variant_specs
      const existingSpecs = (bestProduct.specs_json as Record<string, unknown>) ?? {};
      const updatedSpecs = {
        ...existingSpecs,
        _pdf_variant_specs: {
          variant_name: variant.name,
          model_year: variant.model_year ?? null,
          extracted_at: new Date().toISOString(),
          match_confidence: bestScore,
          categories: variant.categories,
        },
      };

      const { error: updateError } = await supabase
        .from('products')
        .update({ specs_json: updatedSpecs })
        .eq('id', bestProductId);

      if (updateError) {
        console.warn(`[mapVariantsToProducts] Failed to update product ${bestProductId}: ${updateError.message}`);
      }
    } else {
      result.unmatched++;
      result.details.push({ variant_name: variant.name, confidence: bestScore });
      console.log(`[mapVariantsToProducts] No match for "${variant.name}" (best score: ${bestScore.toFixed(2)})`);
    }
  }

  return result;
}

/** Tokenize a string into lowercase alphanumeric tokens, dropping common stop-words. */
function tokenize(s: string): Set<string> {
  const STOP = new Set(['the', 'and', 'or', 'with', 'a', 'an', 'of', 'for']);
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 2 && !STOP.has(t)),
  );
}

/** Jaccard similarity = |A ∩ B| / |A ∪ B|. */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Convert ArrayBuffer to base64 (Workers-compatible — no Buffer). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}
