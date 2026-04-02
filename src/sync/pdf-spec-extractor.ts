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
  route: (req: { taskType: string; prompt: string; oemId?: string }) => Promise<{ content: string }>;
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
        .eq('source_type', 'vehicle_model')
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
