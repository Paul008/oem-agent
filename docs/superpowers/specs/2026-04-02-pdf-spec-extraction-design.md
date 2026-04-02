# PDF Catalog & Spec Extraction — Design Spec

> Dashboard visibility for all PDFs in the platform, AI-powered structured spec extraction from brochure PDFs, and a REST API for the dealer app to consume vehicle specifications.

**Date**: 2026-04-02
**Status**: Design approved

---

## Problem Statement

The platform has 59 vectorized PDFs across 10 OEMs (1,000 chunks in `pdf_embeddings`), but:
- No admin visibility — you can't see which PDFs exist, which vehicles they're linked to, or what's been extracted
- No structured spec extraction — PDFs are chunked as raw text but not parsed into usable vehicle specifications
- No API — the dealer app has no way to query "what are the specs for this vehicle?"
- Low coverage — only 4/179 vehicle models have `brochure_url` set; 8/18 OEMs have zero PDFs

## Design Principles

1. **Flexible schema** — OEM PDFs vary wildly (ICE vs EV, commercial vs passenger, different OEM terminology). Use categorised groups with well-known keys, not a rigid fixed schema.
2. **Reuse existing infrastructure** — PDF chunks already exist in `pdf_embeddings`. Feed those to the LLM rather than re-downloading and re-parsing PDFs.
3. **Cron + manual** — Daily cron auto-processes new PDFs. Admin can trigger manually for immediate results.
4. **Audit trail** — Store `raw` text alongside parsed values so humans can verify AI extraction accuracy.

---

## Component 1: Data Model

### New columns on `vehicle_models`

```sql
ALTER TABLE vehicle_models
  ADD COLUMN IF NOT EXISTS extracted_specs JSONB,
  ADD COLUMN IF NOT EXISTS extracted_specs_source TEXT,
  ADD COLUMN IF NOT EXISTS extracted_specs_at TIMESTAMPTZ;
```

- `extracted_specs` — AI-extracted structured specs from brochure PDF
- `extracted_specs_source` — `'pdf_brochure'` | `'pdf_spec_sheet'` | `'manual'`
- `extracted_specs_at` — when specs were last extracted

### Spec JSON Structure

Schema-flexible with well-known keys. The AI decides categories based on what the PDF contains.

```json
{
  "_version": 1,
  "_source_pdf": "https://cdn.example.com/hilux-brochure.pdf",
  "_extracted_at": "2026-04-02T12:00:00Z",
  "_model_year": "2025",
  "_variant": "SR5 Double Cab",
  "categories": [
    {
      "name": "Engine & Drivetrain",
      "specs": [
        {
          "key": "engine_type",
          "label": "Engine",
          "value": "2.8L Turbo Diesel",
          "unit": null,
          "raw": "2.8L Turbo Diesel 1GD-FTV"
        },
        {
          "key": "power_kw",
          "label": "Power",
          "value": "150",
          "unit": "kW",
          "raw": "150kW @ 3,600rpm"
        },
        {
          "key": "torque_nm",
          "label": "Torque",
          "value": "500",
          "unit": "Nm",
          "raw": "500Nm @ 1,600-2,600rpm"
        }
      ]
    },
    {
      "name": "Battery & Charging",
      "specs": [
        {
          "key": "battery_kwh",
          "label": "Battery Capacity",
          "value": "88.5",
          "unit": "kWh",
          "raw": "88.5 kWh Lithium-ion"
        },
        {
          "key": "range_km",
          "label": "Range (WLTP)",
          "value": "330",
          "unit": "km",
          "raw": "Up to 330km (WLTP combined)"
        }
      ]
    }
  ]
}
```

**Design rationale:**
- **`categories[]`** — AI creates whatever groups the OEM PDF uses. No predefined set.
- **`key`** — well-known identifier for programmatic access (enables cross-OEM comparison)
- **`label`** — human-readable display name (what the OEM called it)
- **`value`** — parsed value as string (not number, because OEMs use qualifiers like "from 7.8")
- **`unit`** — separated for rendering flexibility ("150 kW" or convert to HP)
- **`raw`** — original text from PDF for audit trail and qualifier preservation

### Well-Known Keys Reference (~50 keys)

These are prompt guidance for the AI extractor — not schema constraints. The AI maps to these when possible, invents new ones when the PDF has specs outside this list.

**Engine & Drivetrain:**
`engine_type`, `power_kw`, `torque_nm`, `cylinders`, `displacement_cc`, `transmission`, `transmission_speeds`, `drive_type`, `fuel_type`

**EV & Hybrid:**
`battery_kwh`, `range_km`, `charge_time_ac_hours`, `charge_time_dc_minutes`, `motor_power_kw`, `motor_torque_nm`, `regen_braking`, `charge_port_type`, `onboard_charger_kw`

**Dimensions & Weight:**
`length_mm`, `width_mm`, `height_mm`, `wheelbase_mm`, `ground_clearance_mm`, `kerb_weight_kg`, `gross_vehicle_mass_kg`, `boot_litres`, `cargo_volume_litres`, `turning_circle_m`

**Performance & Efficiency:**
`towing_capacity_kg`, `towing_capacity_unbraked_kg`, `payload_kg`, `fuel_economy_l100km`, `fuel_tank_l`, `top_speed_kmh`, `acceleration_0_100_s`, `wading_depth_mm`, `approach_angle_deg`, `departure_angle_deg`

**Safety:**
`ancap_rating`, `airbags`, `abs`, `esc`, `aeb`, `blind_spot_monitor`, `lane_keep_assist`, `rear_camera`, `parking_sensors`, `adaptive_cruise_control`, `rear_cross_traffic_alert`

**Comfort & Technology:**
`screen_size_inch`, `apple_carplay`, `android_auto`, `satellite_navigation`, `cruise_control`, `climate_zones`, `sunroof`, `heated_seats`, `wireless_charging`, `speaker_count`

---

## Component 2: Spec Extraction Pipeline

### Flow

```
vehicle_models with brochure_url
  |
  +-> Check: extracted_specs_at within 30 days? SKIP
  +-> Check: brochure_url changed since last extraction? RE-EXTRACT
  |
  +-> Query pdf_embeddings for chunks matching this model's source_id
  |     (already vectorized by existing pipeline)
  |
  +-> If no chunks found:
  |     Flag for vectorization (existing vectorize-pdfs.mjs handles this)
  |     SKIP for now
  |
  +-> Concatenate chunk_text (ordered by chunk_index)
  +-> Send to Gemini 2.5 Flash with structured extraction prompt
  |
  +-> Validate response:
  |     - Has categories array
  |     - Each spec has key, label, value
  |     - At least 3 specs extracted
  |
  +-> Store to vehicle_models:
        extracted_specs = validated JSON
        extracted_specs_source = 'pdf_brochure'
        extracted_specs_at = now()
```

### LLM Prompt

```
You are an automotive data extraction specialist. Extract structured vehicle specifications from this brochure text.

Vehicle: {model_name} ({oem_name})
Brochure text:
---
{concatenated_chunk_text}
---

Extract specifications into categorised groups. Use the OEM's own category names where clear (e.g., "Engine & Drivetrain", "Safety", "Dimensions").

For each specification, provide:
- key: a snake_case identifier (use well-known keys where applicable: power_kw, torque_nm, towing_capacity_kg, range_km, battery_kwh, length_mm, width_mm, height_mm, wheelbase_mm, ground_clearance_mm, kerb_weight_kg, fuel_economy_l100km, ancap_rating, airbags, etc.)
- label: the human-readable name as the OEM wrote it
- value: the parsed value as a string
- unit: the unit of measurement (or null if unitless)
- raw: the original text from the brochure

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
}
```

### AI Model

- **Primary**: Gemini 2.5 Flash ($0.15/M input tokens)
- **Fallback**: Llama 4 Scout via Groq ($0.11/M)
- **Cost per model**: ~$0.002 (5-15K tokens input)
- **Cost for all 59 PDFs**: ~$0.12
- Uses existing `aiRouter.route({ taskType: 'spec_extraction' })` pattern

### Cron Schedule

- **Job ID**: `pdf-spec-extract`
- **Schedule**: Daily at 5am AEDT (`0 18 * * *` UTC) — after homepage and offers crawls
- **Batch size**: Up to 20 models per run
- **Skip logic**: Skip if `extracted_specs_at` is within 30 days AND `brochure_url` hasn't changed
- **Re-extract**: When `brochure_url` changed or admin triggers manually

### File: `src/sync/pdf-spec-extractor.ts`

Exports:
```typescript
interface SpecExtractionResult {
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

async function executePdfSpecExtraction(
  supabase: SupabaseClient,
  aiRouter: AiRouter,
  options?: { modelIds?: string[]; maxModels?: number; force?: boolean }
): Promise<SpecExtractionResult>
```

---

## Component 3: PDF Catalog Dashboard Page

### Route: `/dashboard/pdfs`

### Stats Bar (4 cards)

| Card | Value | Source |
|------|-------|--------|
| Total PDFs | Count of unique `pdf_url` in `pdf_embeddings` + `brochure_url` in `vehicle_models` | DB query |
| Models with Brochures | X / 179 total | `vehicle_models WHERE brochure_url IS NOT NULL` |
| PDFs Vectorized | Count of unique source_id in `pdf_embeddings` | DB query |
| Specs Extracted | X / Y (models with specs / models with brochures) | `vehicle_models WHERE extracted_specs IS NOT NULL` |

### Filters

- **OEM**: Dropdown of all 18 OEMs
- **Type**: brochure / spec_sheet / warranty / guidelines
- **Status**: All / Vectorized / Specs Extracted / Pending

### Table

| Column | Source |
|--------|--------|
| OEM | `vehicle_models.oem_id` |
| Model | `vehicle_models.slug` → display name |
| Type | Inferred from `pdf_embeddings.source_type` or `cta_links` type |
| PDF URL | `vehicle_models.brochure_url` or `pdf_embeddings.pdf_url` (truncated, clickable) |
| Chunks | Count from `pdf_embeddings` grouped by source_id |
| Specs Extracted | Yes/No badge based on `extracted_specs IS NOT NULL` |
| Specs Count | Number of specs in `extracted_specs.categories[].specs[]` |
| Last Extracted | `extracted_specs_at` formatted |
| Actions | View Specs / Re-extract / View PDF |

### Actions

- **View Specs**: Modal rendering the `extracted_specs` JSON as a readable spec sheet — categories as sections, specs as key-value rows. Shows `raw` text on hover.
- **Re-extract**: POST to `/api/v1/oem-agent/admin/extract-specs` with `{ model_id }`. Triggers extraction for this model regardless of TTL.
- **View PDF**: Opens `brochure_url` in new tab.
- **Bulk "Extract All Missing"**: Button above table. POST with `{ force: false }` — processes all models with PDFs but no specs.

### API Endpoints for Dashboard

```
GET  /api/v1/oem-agent/admin/pdf-catalog
     Returns: { stats, pdfs: PdfCatalogRow[] }
     Filters via query params: ?oem_id=kia-au&status=pending

POST /api/v1/oem-agent/admin/extract-specs
     Body: { model_id?: string, oem_id?: string, force?: boolean }
     Returns: SpecExtractionResult
```

---

## Component 4: Specs API Endpoint

### Public Endpoint

```
GET /api/v1/vehicles/:oemId/:modelSlug/specs
```

### Response

```json
{
  "oem_id": "toyota-au",
  "model": "HiLux",
  "model_slug": "hilux",
  "variant": "SR5 Double Cab",
  "source": "pdf_brochure",
  "extracted_at": "2026-04-02T12:00:00Z",
  "categories": [
    {
      "name": "Engine & Drivetrain",
      "specs": [
        { "key": "engine_type", "label": "Engine", "value": "2.8L Turbo Diesel", "unit": null, "raw": "2.8L Turbo Diesel 1GD-FTV" },
        { "key": "power_kw", "label": "Power", "value": "150", "unit": "kW", "raw": "150kW @ 3,600rpm" }
      ]
    }
  ]
}
```

### Fallback Chain

1. `vehicle_models.extracted_specs` (AI-extracted from PDF) — preferred, richest data
2. `products.specs_json` (scraped from OEM site) — fallback if no PDF specs exist
3. `404` with `{ "error": "No specs available", "has_brochure": true }` — tells the caller a PDF exists but hasn't been processed yet

### Query Parameters

- `?keys=power_kw,torque_nm,towing_capacity_kg` — filter to specific keys (for comparison grids in dealer app)
- `?category=Engine` — filter to a category name (partial match)
- `?format=flat` — returns flat `{ power_kw: "150", torque_nm: "500" }` instead of categorised structure (convenience for simple integrations)

### Auth

Public read — no auth required. Matches existing `/api/wp/v2/variants` pattern for dealer app consumption.

---

## New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260402_extracted_specs.sql` | Add extracted_specs columns to vehicle_models |
| `src/sync/pdf-spec-extractor.ts` | Core extraction pipeline (chunks → LLM → structured specs) |
| `src/sync/pdf-spec-extractor.test.ts` | Unit tests for prompt building, response validation, key normalisation |
| `src/routes/specs-api.ts` | Public specs API endpoint + admin extract-specs + admin pdf-catalog |
| `dashboard/src/pages/dashboard/pdfs.vue` | PDF Catalog dashboard page |

## Modified Files

| File | Change |
|------|--------|
| `src/routes/cron.ts` | Add `pdf-spec-extract` skill case |
| `config/openclaw/cron-jobs.json` | Add `pdf-spec-extract` cron entry |
| `src/index.ts` | Mount specs-api routes |
| `dashboard/src/components/Sidebar.vue` | Add "PDFs" link under Catalog section |

---

## Cron Job Entry

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

---

## Cost Analysis

| Item | Cost |
|------|------|
| Extraction per model | ~$0.002 (Gemini Flash, 5-15K tokens) |
| All 59 existing PDFs | ~$0.12 one-time |
| Daily cron (1-3 new PDFs) | ~$0.006/day |
| Monthly estimate | ~$0.20 |

---

## Success Criteria

1. **Visibility**: Admin can see all PDFs, their vectorization status, and extraction status from one page
2. **Coverage**: Specs extracted for 90%+ of models that have brochure PDFs
3. **Accuracy**: AI-extracted specs match PDF content (verifiable via `raw` field)
4. **API latency**: Specs endpoint returns in <200ms (DB read, no LLM call at request time)
5. **Extensibility**: New OEM with unusual specs (e.g., hydrogen fuel cell) works without schema changes

---

## Migration Path

### Phase 1: Foundation
- Migration: add `extracted_specs` columns to `vehicle_models`
- Spec extractor module with LLM prompt and validation
- Cron registration

### Phase 2: API
- Public specs endpoint with fallback chain
- Admin endpoints for pdf-catalog and extract-specs

### Phase 3: Dashboard
- PDF catalog page with stats, table, filters, actions
- View Specs modal
- Sidebar integration
