# PDF Catalog & Spec Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract structured vehicle specifications from brochure PDFs, expose them via API, and provide a dashboard page for managing the PDF catalog.

**Architecture:** Reuses existing `pdf_embeddings` chunks as input to Gemini Flash, which extracts categorised specs with well-known keys. Stored on `vehicle_models.extracted_specs` as flexible JSONB. Daily cron processes new PDFs; admin can trigger manually. Public API serves specs to dealer app with fallback to `specs_json`.

**Tech Stack:** TypeScript, Supabase (JSONB, pgvector), Gemini 2.5 Flash via aiRouter, Hono routes, Vue 3 dashboard page.

**Spec:** `docs/superpowers/specs/2026-04-02-pdf-spec-extraction-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260402_extracted_specs.sql` | Add extracted_specs columns to vehicle_models |
| `src/sync/pdf-spec-extractor.ts` | Core: fetch chunks, prompt LLM, validate, store specs |
| `src/sync/pdf-spec-extractor.test.ts` | Unit tests for validation and key normalisation |
| `src/routes/specs-api.ts` | Public specs endpoint + admin extract/catalog endpoints |
| `dashboard/src/pages/dashboard/pdfs.vue` | PDF Catalog dashboard page |

### Modified Files

| File | Change |
|------|--------|
| `src/oem/types.ts:662-679` | Add `'spec_extraction'` to AiTaskType union |
| `src/ai/router.ts:239-392` | Add `spec_extraction` to TASK_ROUTING |
| `src/routes/cron.ts:361-385` | Add `pdf-spec-extract` skill case |
| `src/index.ts:31,227-236` | Import and mount specs-api routes |
| `config/openclaw/cron-jobs.json` | Add `pdf-spec-extract` cron entry |
| `dashboard/src/composables/use-sidebar.ts` | Add "PDFs" nav link |

---

### Task 1: Migration — extracted_specs columns

**Files:**
- Create: `supabase/migrations/20260402_extracted_specs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add extracted_specs columns to vehicle_models for AI-extracted PDF specs
ALTER TABLE vehicle_models
  ADD COLUMN IF NOT EXISTS extracted_specs JSONB,
  ADD COLUMN IF NOT EXISTS extracted_specs_source TEXT,
  ADD COLUMN IF NOT EXISTS extracted_specs_at TIMESTAMPTZ;

COMMENT ON COLUMN vehicle_models.extracted_specs IS 'AI-extracted structured specs from brochure PDF — flexible categorised JSON with well-known keys';
COMMENT ON COLUMN vehicle_models.extracted_specs_source IS 'Source of extraction: pdf_brochure, pdf_spec_sheet, manual';
COMMENT ON COLUMN vehicle_models.extracted_specs_at IS 'When specs were last extracted';

-- Index for finding models needing extraction
CREATE INDEX IF NOT EXISTS idx_vehicle_models_specs_status
  ON vehicle_models(oem_id) WHERE brochure_url IS NOT NULL AND extracted_specs IS NULL;
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase migration up --linked`
Expected: Migration applies successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260402_extracted_specs.sql
git commit -m "feat: add extracted_specs columns to vehicle_models"
```

---

### Task 2: Add spec_extraction AI task type

**Files:**
- Modify: `src/oem/types.ts:662-679`
- Modify: `src/ai/router.ts:239-392`

- [ ] **Step 1: Add task type to union**

In `src/oem/types.ts`, find the `AiTaskType` union (line 662) and add `'spec_extraction'` at the end:

```typescript
export type AiTaskType =
  | 'html_normalisation'
  | 'llm_extraction'
  | 'diff_classification'
  | 'change_summary'
  | 'design_pre_screening'
  | 'design_vision'
  | 'sales_conversation'
  | 'content_generation'
  | 'page_generation'
  | 'page_visual_extraction'
  | 'page_content_generation'
  | 'page_screenshot_to_code'
  | 'page_structuring'
  | 'quick_scan'
  | 'extraction_quality_check'
  | 'section_deep_analysis'
  | 'bespoke_component'
  | 'spec_extraction';
```

- [ ] **Step 2: Add routing config**

In `src/ai/router.ts`, find the `TASK_ROUTING` object and add the `spec_extraction` entry. Use Gemini Flash as primary (good at structured extraction, cheap) with Groq Llama as fallback:

```typescript
  spec_extraction: {
    provider: 'gemini',
    model: AI_ROUTER_CONFIG.gemini.models.flash.model,
    modelConfig: AI_ROUTER_CONFIG.gemini.models.flash,
    fallbackProvider: 'groq',
    fallbackModel: AI_ROUTER_CONFIG.groq.models.balanced.model,
  },
```

Find the existing `llm_extraction` entry and place `spec_extraction` right after it for readability.

- [ ] **Step 3: Commit**

```bash
git add src/oem/types.ts src/ai/router.ts
git commit -m "feat: add spec_extraction AI task type with Gemini Flash routing"
```

---

### Task 3: Spec Extractor Module

**Files:**
- Create: `src/sync/pdf-spec-extractor.ts`
- Create: `src/sync/pdf-spec-extractor.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/sync/pdf-spec-extractor.test.ts
import { describe, test, expect } from 'vitest';
import { validateSpecsJson, buildExtractionPrompt, WELL_KNOWN_KEYS } from './pdf-spec-extractor';

describe('validateSpecsJson', () => {
  test('accepts valid spec JSON', () => {
    const valid = {
      _version: 1,
      categories: [
        {
          name: 'Engine',
          specs: [
            { key: 'power_kw', label: 'Power', value: '150', unit: 'kW', raw: '150kW @ 3600rpm' },
            { key: 'torque_nm', label: 'Torque', value: '500', unit: 'Nm', raw: '500Nm' },
            { key: 'engine_type', label: 'Engine', value: '2.0L Diesel', unit: null, raw: '2.0L Turbo Diesel' },
          ],
        },
      ],
    };
    const result = validateSpecsJson(valid);
    expect(result.valid).toBe(true);
    expect(result.specsCount).toBe(3);
    expect(result.categoriesCount).toBe(1);
  });

  test('rejects missing categories array', () => {
    const result = validateSpecsJson({ _version: 1 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('categories');
  });

  test('rejects empty categories', () => {
    const result = validateSpecsJson({ _version: 1, categories: [] });
    expect(result.valid).toBe(false);
  });

  test('rejects specs without key field', () => {
    const result = validateSpecsJson({
      _version: 1,
      categories: [{ name: 'Engine', specs: [{ label: 'Power', value: '150' }] }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('key');
  });

  test('rejects fewer than 3 total specs', () => {
    const result = validateSpecsJson({
      _version: 1,
      categories: [{ name: 'Engine', specs: [
        { key: 'power_kw', label: 'Power', value: '150', unit: 'kW', raw: '150kW' },
        { key: 'torque_nm', label: 'Torque', value: '500', unit: 'Nm', raw: '500Nm' },
      ] }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('3');
  });
});

describe('buildExtractionPrompt', () => {
  test('includes model name and OEM', () => {
    const prompt = buildExtractionPrompt('HiLux', 'Toyota Australia', 'Specs text here');
    expect(prompt).toContain('HiLux');
    expect(prompt).toContain('Toyota Australia');
    expect(prompt).toContain('Specs text here');
  });

  test('includes well-known keys in prompt', () => {
    const prompt = buildExtractionPrompt('CX-5', 'Mazda', 'text');
    expect(prompt).toContain('power_kw');
    expect(prompt).toContain('towing_capacity_kg');
    expect(prompt).toContain('battery_kwh');
  });

  test('truncates very long chunk text', () => {
    const longText = 'A'.repeat(100000);
    const prompt = buildExtractionPrompt('Model', 'OEM', longText);
    expect(prompt.length).toBeLessThan(60000);
  });
});

describe('WELL_KNOWN_KEYS', () => {
  test('has at least 40 keys', () => {
    expect(WELL_KNOWN_KEYS.length).toBeGreaterThanOrEqual(40);
  });

  test('all keys are snake_case', () => {
    for (const key of WELL_KNOWN_KEYS) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sync/pdf-spec-extractor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/sync/pdf-spec-extractor.ts
/**
 * PDF Spec Extractor — Extract structured vehicle specs from brochure PDF chunks.
 *
 * Uses existing pdf_embeddings chunks (already vectorized) as input to Gemini Flash,
 * which returns categorised specs with well-known keys.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiRouter } from '../ai/router';

// ── Types ──

export interface SpecCategory {
  name: string;
  specs: SpecEntry[];
}

export interface SpecEntry {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  raw: string;
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

interface ValidationResult {
  valid: boolean;
  error?: string;
  specsCount: number;
  categoriesCount: number;
}

// ── Well-Known Keys ──

export const WELL_KNOWN_KEYS = [
  // Engine & Drivetrain
  'engine_type', 'power_kw', 'torque_nm', 'cylinders', 'displacement_cc',
  'transmission', 'transmission_speeds', 'drive_type', 'fuel_type',
  // EV & Hybrid
  'battery_kwh', 'range_km', 'charge_time_ac_hours', 'charge_time_dc_minutes',
  'motor_power_kw', 'motor_torque_nm', 'regen_braking', 'charge_port_type', 'onboard_charger_kw',
  // Dimensions & Weight
  'length_mm', 'width_mm', 'height_mm', 'wheelbase_mm', 'ground_clearance_mm',
  'kerb_weight_kg', 'gross_vehicle_mass_kg', 'boot_litres', 'cargo_volume_litres', 'turning_circle_m',
  // Performance & Efficiency
  'towing_capacity_kg', 'towing_capacity_unbraked_kg', 'payload_kg',
  'fuel_economy_l100km', 'fuel_tank_l', 'top_speed_kmh', 'acceleration_0_100_s',
  'wading_depth_mm', 'approach_angle_deg', 'departure_angle_deg',
  // Safety
  'ancap_rating', 'airbags', 'abs', 'esc', 'aeb', 'blind_spot_monitor',
  'lane_keep_assist', 'rear_camera', 'parking_sensors', 'adaptive_cruise_control',
  'rear_cross_traffic_alert',
  // Comfort & Tech
  'screen_size_inch', 'apple_carplay', 'android_auto', 'satellite_navigation',
  'cruise_control', 'climate_zones', 'sunroof', 'heated_seats', 'wireless_charging', 'speaker_count',
];

// ── Validation ──

export function validateSpecsJson(data: unknown): ValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Response is not an object', specsCount: 0, categoriesCount: 0 };
  }

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.categories)) {
    return { valid: false, error: 'Missing categories array', specsCount: 0, categoriesCount: 0 };
  }

  if (obj.categories.length === 0) {
    return { valid: false, error: 'Empty categories array', specsCount: 0, categoriesCount: 0 };
  }

  let totalSpecs = 0;
  for (const cat of obj.categories) {
    if (!cat || typeof cat !== 'object' || !Array.isArray((cat as any).specs)) {
      return { valid: false, error: 'Category missing specs array', specsCount: 0, categoriesCount: 0 };
    }
    for (const spec of (cat as any).specs) {
      if (!spec.key || typeof spec.key !== 'string') {
        return { valid: false, error: 'Spec missing key field', specsCount: 0, categoriesCount: 0 };
      }
      if (!spec.value && spec.value !== '0') {
        continue; // skip empty specs silently
      }
      totalSpecs++;
    }
  }

  if (totalSpecs < 3) {
    return { valid: false, error: `Only ${totalSpecs} specs extracted (minimum 3)`, specsCount: totalSpecs, categoriesCount: obj.categories.length };
  }

  return { valid: true, specsCount: totalSpecs, categoriesCount: obj.categories.length };
}

// ── Prompt ──

const MAX_CHUNK_TEXT = 50000; // ~12K tokens

export function buildExtractionPrompt(modelName: string, oemName: string, chunkText: string): string {
  const truncated = chunkText.length > MAX_CHUNK_TEXT ? chunkText.slice(0, MAX_CHUNK_TEXT) : chunkText;
  const keysSample = WELL_KNOWN_KEYS.join(', ');

  return `You are an automotive data extraction specialist. Extract structured vehicle specifications from this brochure text.

Vehicle: ${modelName} (${oemName})

Brochure text:
---
${truncated}
---

Extract specifications into categorised groups. Use the OEM's own category names where clear (e.g., "Engine & Drivetrain", "Safety", "Dimensions").

For each specification, provide:
- key: a snake_case identifier. Use well-known keys where applicable: ${keysSample}
- label: the human-readable name as the OEM wrote it
- value: the parsed value as a string (not a number)
- unit: the unit of measurement (or null if unitless, e.g., for boolean features)
- raw: the original text from the brochure including any qualifiers

If the brochure covers multiple variants/trims, extract specs for the primary/highest variant.

Return ONLY valid JSON matching this structure:
{
  "_version": 1,
  "_variant": "variant name if identifiable",
  "_model_year": "year if identifiable",
  "categories": [
    {
      "name": "Category Name",
      "specs": [
        { "key": "snake_case_key", "label": "Display Label", "value": "parsed value", "unit": "unit or null", "raw": "original text" }
      ]
    }
  ]
}`;
}

// ── Main Executor ──

export async function executePdfSpecExtraction(
  supabase: SupabaseClient,
  aiRouter: { route: (req: any) => Promise<any> },
  options?: { modelIds?: string[]; maxModels?: number; force?: boolean },
): Promise<SpecExtractionResult> {
  const maxModels = options?.maxModels ?? 20;
  const force = options?.force ?? false;

  const result: SpecExtractionResult = {
    models_processed: 0,
    models_skipped: 0,
    models_failed: 0,
    extractions: [],
    errors: [],
  };

  // Find models with brochures that need extraction
  let query = supabase
    .from('vehicle_models')
    .select('id, oem_id, slug, name, brochure_url, extracted_specs_at')
    .not('brochure_url', 'is', null);

  if (options?.modelIds?.length) {
    query = query.in('id', options.modelIds);
  }

  const { data: models, error: queryError } = await query.limit(maxModels * 2);

  if (queryError || !models) {
    console.error('[PdfSpecExtractor] Failed to query models:', queryError);
    return result;
  }

  // Filter: skip recently extracted unless forced
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const candidates = models.filter(m => {
    if (force) return true;
    if (!m.extracted_specs_at) return true;
    return m.extracted_specs_at < thirtyDaysAgo;
  }).slice(0, maxModels);

  result.models_skipped = models.length - candidates.length;

  console.log(`[PdfSpecExtractor] Processing ${candidates.length} models (${result.models_skipped} skipped, ${models.length} total with brochures)`);

  for (const model of candidates) {
    try {
      // Fetch pre-existing PDF chunks
      const { data: chunks } = await supabase
        .from('pdf_embeddings')
        .select('chunk_text, chunk_index')
        .eq('source_id', model.id)
        .eq('source_type', 'brochure')
        .order('chunk_index', { ascending: true });

      if (!chunks || chunks.length === 0) {
        console.log(`[PdfSpecExtractor] No chunks for ${model.slug} (${model.oem_id}) — needs vectorization first`);
        result.models_skipped++;
        continue;
      }

      // Concatenate chunks
      const fullText = chunks.map(c => c.chunk_text).join('\n\n');

      // Get OEM name for prompt
      const { data: oem } = await supabase
        .from('oems')
        .select('name')
        .eq('id', model.oem_id)
        .single();

      const prompt = buildExtractionPrompt(
        model.name || model.slug,
        oem?.name || model.oem_id,
        fullText,
      );

      // Call LLM
      const aiResponse = await aiRouter.route({
        taskType: 'spec_extraction',
        prompt,
        oemId: model.oem_id,
      });

      if (!aiResponse?.content) {
        throw new Error('Empty AI response');
      }

      // Parse response
      let parsed: unknown;
      try {
        const content = typeof aiResponse.content === 'string' ? aiResponse.content : JSON.stringify(aiResponse.content);
        // Strip markdown code blocks if present
        const cleaned = content.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error(`Failed to parse AI response as JSON: ${String(aiResponse.content).slice(0, 200)}`);
      }

      // Validate
      const validation = validateSpecsJson(parsed);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.error}`);
      }

      // Enrich with metadata
      const specs = parsed as ExtractedSpecs;
      specs._version = 1;
      specs._source_pdf = model.brochure_url;
      specs._extracted_at = new Date().toISOString();

      // Store
      const { error: updateError } = await supabase
        .from('vehicle_models')
        .update({
          extracted_specs: specs,
          extracted_specs_source: 'pdf_brochure',
          extracted_specs_at: new Date().toISOString(),
        })
        .eq('id', model.id);

      if (updateError) {
        throw new Error(`DB update failed: ${updateError.message}`);
      }

      result.models_processed++;
      result.extractions.push({
        model_id: model.id,
        oem_id: model.oem_id,
        slug: model.slug,
        categories_count: validation.categoriesCount,
        specs_count: validation.specsCount,
        source_pdf: model.brochure_url,
      });

      console.log(`[PdfSpecExtractor] Extracted ${validation.specsCount} specs (${validation.categoriesCount} categories) for ${model.slug} (${model.oem_id})`);

    } catch (err) {
      result.models_failed++;
      result.errors.push({ model_id: model.id, error: String(err) });
      console.error(`[PdfSpecExtractor] Failed for ${model.slug} (${model.oem_id}):`, err);
    }
  }

  console.log(`[PdfSpecExtractor] Done — ${result.models_processed} extracted, ${result.models_failed} failed, ${result.models_skipped} skipped`);
  return result;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/sync/pdf-spec-extractor.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync/pdf-spec-extractor.ts src/sync/pdf-spec-extractor.test.ts
git commit -m "feat: PDF spec extractor — chunks to structured specs via Gemini Flash"
```

---

### Task 4: Specs API Routes

**Files:**
- Create: `src/routes/specs-api.ts`
- Modify: `src/index.ts:31,227-236`

- [ ] **Step 1: Create the route file**

```typescript
// src/routes/specs-api.ts
import { Hono } from 'hono';
import type { MoltbotEnv } from '../types';
import { createSupabaseClient } from '../utils/supabase';

const specsApi = new Hono<{ Bindings: MoltbotEnv }>();

// ── Public: GET /api/v1/vehicles/:oemId/:modelSlug/specs ──

specsApi.get('/vehicles/:oemId/:modelSlug/specs', async (c) => {
  const { oemId, modelSlug } = c.req.param();
  const keys = c.req.query('keys')?.split(',').map(k => k.trim());
  const category = c.req.query('category');
  const format = c.req.query('format'); // 'flat' for key-value pairs

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Try extracted_specs first (AI-extracted from PDF)
  const { data: model } = await supabase
    .from('vehicle_models')
    .select('id, name, slug, oem_id, brochure_url, extracted_specs, extracted_specs_source, extracted_specs_at')
    .eq('oem_id', oemId)
    .eq('slug', modelSlug)
    .maybeSingle();

  if (!model) {
    return c.json({ error: 'Model not found' }, 404);
  }

  if (model.extracted_specs) {
    let specs = model.extracted_specs as any;

    // Filter by category
    if (category && specs.categories) {
      specs = {
        ...specs,
        categories: specs.categories.filter((cat: any) =>
          cat.name.toLowerCase().includes(category.toLowerCase())
        ),
      };
    }

    // Filter by keys
    if (keys && specs.categories) {
      specs = {
        ...specs,
        categories: specs.categories.map((cat: any) => ({
          ...cat,
          specs: cat.specs.filter((s: any) => keys.includes(s.key)),
        })).filter((cat: any) => cat.specs.length > 0),
      };
    }

    // Flat format
    if (format === 'flat' && specs.categories) {
      const flat: Record<string, string> = {};
      for (const cat of specs.categories) {
        for (const spec of cat.specs) {
          flat[spec.key] = spec.unit ? `${spec.value} ${spec.unit}` : spec.value;
        }
      }
      return c.json({
        oem_id: model.oem_id,
        model: model.name,
        model_slug: model.slug,
        source: model.extracted_specs_source,
        specs: flat,
      });
    }

    return c.json({
      oem_id: model.oem_id,
      model: model.name,
      model_slug: model.slug,
      variant: specs._variant || null,
      source: model.extracted_specs_source,
      extracted_at: model.extracted_specs_at,
      categories: specs.categories || [],
    });
  }

  // Fallback: try products.specs_json
  const { data: product } = await supabase
    .from('products')
    .select('specs_json')
    .eq('oem_id', oemId)
    .ilike('slug', `%${modelSlug}%`)
    .not('specs_json', 'is', null)
    .limit(1)
    .maybeSingle();

  if (product?.specs_json) {
    return c.json({
      oem_id: oemId,
      model: model.name,
      model_slug: model.slug,
      source: 'scraped',
      specs: product.specs_json,
    });
  }

  return c.json({
    error: 'No specs available',
    has_brochure: !!model.brochure_url,
  }, 404);
});

// ── Admin: GET /admin/pdf-catalog ──

specsApi.get('/admin/pdf-catalog', async (c) => {
  const oemFilter = c.req.query('oem_id');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Models with brochures
  let modelsQuery = supabase
    .from('vehicle_models')
    .select('id, oem_id, slug, name, brochure_url, extracted_specs, extracted_specs_source, extracted_specs_at')
    .not('brochure_url', 'is', null)
    .order('oem_id');

  if (oemFilter) modelsQuery = modelsQuery.eq('oem_id', oemFilter);

  const { data: models } = await modelsQuery;

  // Chunk counts from pdf_embeddings
  const { data: chunkCounts } = await supabase
    .from('pdf_embeddings')
    .select('source_id, oem_id');

  // Group chunks by source_id
  const chunkMap: Record<string, number> = {};
  for (const row of chunkCounts ?? []) {
    chunkMap[row.source_id] = (chunkMap[row.source_id] || 0) + 1;
  }

  // Total model count
  const { count: totalModels } = await supabase
    .from('vehicle_models')
    .select('id', { count: 'exact', head: true });

  const pdfs = (models ?? []).map(m => {
    const specsCount = m.extracted_specs
      ? (m.extracted_specs as any).categories?.reduce((sum: number, cat: any) => sum + (cat.specs?.length || 0), 0) || 0
      : 0;

    return {
      model_id: m.id,
      oem_id: m.oem_id,
      slug: m.slug,
      name: m.name,
      brochure_url: m.brochure_url,
      chunks: chunkMap[m.id] || 0,
      has_specs: !!m.extracted_specs,
      specs_count: specsCount,
      extracted_at: m.extracted_specs_at,
      source: m.extracted_specs_source,
    };
  });

  const stats = {
    total_models: totalModels || 0,
    models_with_brochures: pdfs.length,
    pdfs_vectorized: pdfs.filter(p => p.chunks > 0).length,
    specs_extracted: pdfs.filter(p => p.has_specs).length,
  };

  return c.json({ stats, pdfs });
});

// ── Admin: POST /admin/extract-specs ──

specsApi.post('/admin/extract-specs', async (c) => {
  const body = await c.req.json<{ model_id?: string; oem_id?: string; force?: boolean }>();
  const { AiRouter } = await import('../ai/router');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const aiRouter = new AiRouter(c.env, supabase);

  const { executePdfSpecExtraction } = await import('../sync/pdf-spec-extractor');

  let modelIds: string[] | undefined;
  if (body.model_id) {
    modelIds = [body.model_id];
  } else if (body.oem_id) {
    const { data } = await supabase
      .from('vehicle_models')
      .select('id')
      .eq('oem_id', body.oem_id)
      .not('brochure_url', 'is', null);
    modelIds = data?.map(m => m.id);
  }

  const result = await executePdfSpecExtraction(supabase, aiRouter, {
    modelIds,
    force: body.force ?? false,
  });

  return c.json(result);
});

export { specsApi };
```

- [ ] **Step 2: Mount routes in index.ts**

In `src/index.ts`, add the import at line 31:

```typescript
import { specsApi } from './routes/specs-api';
```

And mount it in the routes section (around line 227-236):

```typescript
app.route('/api/v1', specsApi);
```

This makes the endpoints available at:
- `GET /api/v1/vehicles/:oemId/:modelSlug/specs`
- `GET /api/v1/admin/pdf-catalog`
- `POST /api/v1/admin/extract-specs`

- [ ] **Step 3: Commit**

```bash
git add src/routes/specs-api.ts src/index.ts
git commit -m "feat: specs API — public endpoint, admin catalog, manual extraction trigger"
```

---

### Task 5: Cron Registration

**Files:**
- Modify: `src/routes/cron.ts`
- Modify: `config/openclaw/cron-jobs.json`

- [ ] **Step 1: Add cron case**

In `src/routes/cron.ts`, after the `banner-triage` case, add:

```typescript
      case 'pdf-spec-extract': {
        const { executePdfSpecExtraction } = await import('../sync/pdf-spec-extractor');
        const { createSupabaseClient: createSbSpec } = await import('../utils/supabase');
        const { AiRouter } = await import('../ai/router');
        const sbSpec = createSbSpec({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
        const aiRouter = new AiRouter(env, sbSpec);
        const maxModels = (job.config as any)?.max_models_per_run ?? 20;
        result = await executePdfSpecExtraction(sbSpec, aiRouter, { maxModels }) as unknown as Record<string, unknown>;
        break;
      }
```

- [ ] **Step 2: Add cron-jobs.json entry**

In `config/openclaw/cron-jobs.json`, add to the `jobs` array before the closing `]`:

```json
    {
      "id": "pdf-spec-extract",
      "name": "PDF Spec Extraction",
      "description": "Extract structured vehicle specifications from brochure PDFs via Gemini Flash. Processes models with brochure_url but no extracted_specs, up to 20 per run.",
      "schedule": "0 18 * * *",
      "timezone": "Australia/Sydney",
      "skill": "pdf-spec-extract",
      "enabled": true,
      "config": {
        "max_models_per_run": 20,
        "reextract_after_days": 30,
        "llm_model": "gemini-2.5-flash",
        "llm_fallback": "llama-4-scout-17b",
        "notify_channel": "slack:#oem-alerts"
      }
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/cron.ts config/openclaw/cron-jobs.json
git commit -m "feat: register pdf-spec-extract cron job — daily at 5am AEDT"
```

---

### Task 6: PDF Catalog Dashboard Page

**Files:**
- Create: `dashboard/src/pages/dashboard/pdfs.vue`
- Modify: `dashboard/src/composables/use-sidebar.ts`

- [ ] **Step 1: Add sidebar link**

In `dashboard/src/composables/use-sidebar.ts`, find the "Catalog" or "Infrastructure" section and add:

```typescript
{ title: 'PDFs & Specs', url: '/dashboard/pdfs', icon: FileText },
```

Import `FileText` from lucide-vue-next at the top of the file if not already imported.

- [ ] **Step 2: Create the dashboard page**

```vue
<!-- dashboard/src/pages/dashboard/pdfs.vue -->
<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { useSupabase } from '@/composables/use-supabase'

interface PdfRow {
  model_id: string
  oem_id: string
  slug: string
  name: string
  brochure_url: string
  chunks: number
  has_specs: boolean
  specs_count: number
  extracted_at: string | null
  source: string | null
}

interface Stats {
  total_models: number
  models_with_brochures: number
  pdfs_vectorized: number
  specs_extracted: number
}

const { supabase } = useSupabase()
const pdfs = ref<PdfRow[]>([])
const stats = ref<Stats>({ total_models: 0, models_with_brochures: 0, pdfs_vectorized: 0, specs_extracted: 0 })
const loading = ref(true)
const extracting = ref<string | null>(null)
const oemFilter = ref('')
const statusFilter = ref('')
const viewingSpecs = ref<any>(null)
const viewingModel = ref('')

const oems = computed(() => {
  const unique = [...new Set(pdfs.value.map(p => p.oem_id))].sort()
  return unique
})

const filtered = computed(() => {
  let list = pdfs.value
  if (oemFilter.value) list = list.filter(p => p.oem_id === oemFilter.value)
  if (statusFilter.value === 'vectorized') list = list.filter(p => p.chunks > 0)
  if (statusFilter.value === 'extracted') list = list.filter(p => p.has_specs)
  if (statusFilter.value === 'pending') list = list.filter(p => !p.has_specs && p.chunks > 0)
  return list
})

async function fetchCatalog() {
  loading.value = true
  try {
    const res = await fetch(`/api/v1/admin/pdf-catalog${oemFilter.value ? `?oem_id=${oemFilter.value}` : ''}`)
    const data = await res.json()
    pdfs.value = data.pdfs
    stats.value = data.stats
  } catch (e) {
    console.error('Failed to fetch PDF catalog:', e)
  } finally {
    loading.value = false
  }
}

async function extractSpecs(modelId: string) {
  extracting.value = modelId
  try {
    const res = await fetch('/api/v1/admin/extract-specs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: modelId, force: true }),
    })
    const result = await res.json()
    if (result.models_processed > 0) {
      await fetchCatalog()
    }
  } finally {
    extracting.value = null
  }
}

async function extractAllMissing() {
  extracting.value = 'all'
  try {
    const res = await fetch('/api/v1/admin/extract-specs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: false }),
    })
    await res.json()
    await fetchCatalog()
  } finally {
    extracting.value = null
  }
}

async function viewSpecs(modelId: string, modelName: string) {
  const pdf = pdfs.value.find(p => p.model_id === modelId)
  if (!pdf) return
  const { data } = await supabase
    .from('vehicle_models')
    .select('extracted_specs')
    .eq('id', modelId)
    .single()
  viewingSpecs.value = data?.extracted_specs
  viewingModel.value = modelName
}

onMounted(fetchCatalog)
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">PDF Catalog & Specs</h1>
      <button
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        :disabled="extracting !== null"
        @click="extractAllMissing"
      >
        {{ extracting === 'all' ? 'Extracting...' : 'Extract All Missing Specs' }}
      </button>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-4 gap-4">
      <div class="bg-white dark:bg-zinc-800 rounded-lg p-4 shadow">
        <div class="text-sm text-zinc-500">Total Models</div>
        <div class="text-2xl font-bold">{{ stats.total_models }}</div>
      </div>
      <div class="bg-white dark:bg-zinc-800 rounded-lg p-4 shadow">
        <div class="text-sm text-zinc-500">With Brochures</div>
        <div class="text-2xl font-bold">{{ stats.models_with_brochures }}</div>
      </div>
      <div class="bg-white dark:bg-zinc-800 rounded-lg p-4 shadow">
        <div class="text-sm text-zinc-500">Vectorized</div>
        <div class="text-2xl font-bold">{{ stats.pdfs_vectorized }}</div>
      </div>
      <div class="bg-white dark:bg-zinc-800 rounded-lg p-4 shadow">
        <div class="text-sm text-zinc-500">Specs Extracted</div>
        <div class="text-2xl font-bold text-green-600">{{ stats.specs_extracted }}</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex gap-4">
      <select v-model="oemFilter" class="border rounded px-3 py-2 dark:bg-zinc-800" @change="fetchCatalog">
        <option value="">All OEMs</option>
        <option v-for="oem in oems" :key="oem" :value="oem">{{ oem }}</option>
      </select>
      <select v-model="statusFilter" class="border rounded px-3 py-2 dark:bg-zinc-800">
        <option value="">All Status</option>
        <option value="vectorized">Vectorized</option>
        <option value="extracted">Specs Extracted</option>
        <option value="pending">Pending Extraction</option>
      </select>
    </div>

    <!-- Table -->
    <div class="bg-white dark:bg-zinc-800 rounded-lg shadow overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="bg-zinc-50 dark:bg-zinc-700">
          <tr>
            <th class="px-4 py-3 text-left">OEM</th>
            <th class="px-4 py-3 text-left">Model</th>
            <th class="px-4 py-3 text-left">PDF</th>
            <th class="px-4 py-3 text-right">Chunks</th>
            <th class="px-4 py-3 text-center">Specs</th>
            <th class="px-4 py-3 text-right">Spec Count</th>
            <th class="px-4 py-3 text-left">Extracted</th>
            <th class="px-4 py-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-200 dark:divide-zinc-600">
          <tr v-for="pdf in filtered" :key="pdf.model_id">
            <td class="px-4 py-3 font-mono text-xs">{{ pdf.oem_id }}</td>
            <td class="px-4 py-3 font-medium">{{ pdf.name || pdf.slug }}</td>
            <td class="px-4 py-3">
              <a :href="pdf.brochure_url" target="_blank" class="text-blue-500 hover:underline truncate block max-w-[200px]">
                {{ pdf.brochure_url.split('/').pop() }}
              </a>
            </td>
            <td class="px-4 py-3 text-right">{{ pdf.chunks }}</td>
            <td class="px-4 py-3 text-center">
              <span v-if="pdf.has_specs" class="text-green-600 font-bold">Yes</span>
              <span v-else-if="pdf.chunks > 0" class="text-yellow-500">Pending</span>
              <span v-else class="text-zinc-400">No chunks</span>
            </td>
            <td class="px-4 py-3 text-right">{{ pdf.specs_count || '—' }}</td>
            <td class="px-4 py-3 text-xs text-zinc-500">
              {{ pdf.extracted_at ? new Date(pdf.extracted_at).toLocaleDateString() : '—' }}
            </td>
            <td class="px-4 py-3 space-x-2">
              <button
                v-if="pdf.has_specs"
                class="text-blue-500 hover:underline text-xs"
                @click="viewSpecs(pdf.model_id, pdf.name || pdf.slug)"
              >View</button>
              <button
                class="text-orange-500 hover:underline text-xs disabled:opacity-50"
                :disabled="extracting !== null || pdf.chunks === 0"
                @click="extractSpecs(pdf.model_id)"
              >{{ extracting === pdf.model_id ? 'Extracting...' : 'Extract' }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="p-8 text-center text-zinc-400">Loading...</div>
      <div v-if="!loading && filtered.length === 0" class="p-8 text-center text-zinc-400">No PDFs found</div>
    </div>

    <!-- Specs Modal -->
    <div v-if="viewingSpecs" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="viewingSpecs = null">
      <div class="bg-white dark:bg-zinc-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-y-auto p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">{{ viewingModel }} — Extracted Specs</h2>
          <button class="text-zinc-400 hover:text-zinc-600" @click="viewingSpecs = null">Close</button>
        </div>
        <div v-if="viewingSpecs._variant" class="text-sm text-zinc-500 mb-4">Variant: {{ viewingSpecs._variant }}</div>
        <div v-for="cat in viewingSpecs.categories" :key="cat.name" class="mb-6">
          <h3 class="font-semibold text-lg border-b pb-1 mb-2">{{ cat.name }}</h3>
          <table class="w-full text-sm">
            <tr v-for="spec in cat.specs" :key="spec.key" class="border-b border-zinc-100 dark:border-zinc-700">
              <td class="py-1.5 text-zinc-500 w-1/3">{{ spec.label }}</td>
              <td class="py-1.5 font-medium">{{ spec.value }}{{ spec.unit ? ` ${spec.unit}` : '' }}</td>
              <td class="py-1.5 text-xs text-zinc-400 italic" :title="spec.raw">{{ spec.raw !== spec.value ? spec.raw : '' }}</td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/pages/dashboard/pdfs.vue dashboard/src/composables/use-sidebar.ts
git commit -m "feat: PDF Catalog dashboard page with stats, filters, spec viewer modal"
```

---

### Task 7: Smoke Test

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (including new pdf-spec-extractor tests).

- [ ] **Step 2: Test the admin catalog endpoint locally**

Run: `curl -s http://localhost:8787/api/v1/admin/pdf-catalog | jq '.stats'`
Expected: Returns stats with `models_with_brochures`, `pdfs_vectorized` counts.

- [ ] **Step 3: Test manual spec extraction for one model**

Pick a model ID from the catalog response and trigger extraction:

```bash
curl -s -X POST http://localhost:8787/api/v1/admin/extract-specs \
  -H 'Content-Type: application/json' \
  -d '{"model_id":"<MODEL_ID>","force":true}' | jq '.extractions'
```

Expected: Returns extraction result with `categories_count` > 0, `specs_count` >= 3.

- [ ] **Step 4: Test the public specs endpoint**

```bash
curl -s http://localhost:8787/api/v1/vehicles/kia-au/sportage/specs | jq '.categories[0]'
```

Expected: Returns the first spec category with structured specs.

- [ ] **Step 5: Test flat format**

```bash
curl -s "http://localhost:8787/api/v1/vehicles/kia-au/sportage/specs?format=flat" | jq '.specs'
```

Expected: Returns `{ "power_kw": "150 kW", ... }` flat key-value pairs.

- [ ] **Step 6: Commit docs**

```bash
git add docs/superpowers/specs/2026-04-02-pdf-spec-extraction-design.md
git add docs/superpowers/plans/2026-04-02-pdf-spec-extraction.md
git commit -m "docs: PDF spec extraction design spec and implementation plan"
```
