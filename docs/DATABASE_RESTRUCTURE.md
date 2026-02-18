# Database Restructure Proposal

**Date:** 2026-02-18
**Current state:** 13 OEMs, 295 products, 114 offers, 602 discovered APIs, 443 change events

---

## Current Problems

### 1. Product model is flat — doesn't reflect OEM hierarchy
OEMs structure their vehicles as **Model → Variants/Grades → Colors**. Our `products` table has one row per variant (e.g. "Sportage S Petrol"), but colors, pricing, interior options, and gallery images are all crammed into `meta_json` or missing entirely.

**Example:** Kia Sportage has 9 variants × 7 colors = 63 valid configurations, but we store it as 9 product rows with colors as a JSON array.

### 2. Duplicate products from different import sources
The same vehicle appears with different `external_key` formats:
- `ev3-gtl-lr` (from build-and-price extraction)
- `EV3:GT-Line` (from offers page extraction)
- `New Stonic:S  |  DCT` vs `new-stonic-s`

**5 confirmed duplicate groups** in Kia alone. This will get worse as more OEMs are imported.

### 3. Pricing is OEM-specific but schema is generic
Kia provides per-state drive-away pricing + premium paint deltas. Ford uses different pricing models. Everything is stuffed into `meta_json` with no queryable structure.

### 4. Vehicle specs mixed into wrong columns
`engine_size`, `cylinders`, `transmission` etc. were added as flat columns on `products`, but they only apply to some OEMs and conflict with the `variants` JSONB field.

### 5. Empty tables everywhere
`product_images` (0), `product_versions` (0), `offer_assets` (0), `offer_versions` (0), `banners` (0), `brand_tokens` (0), `page_layouts` (0), `design_captures` (0), `oem_members` (0) — these were designed speculatively and never used.

### 6. No proper model-level entity
There's no `vehicle_models` table. A "Sportage" is just implied by multiple products sharing a similar title. This makes it impossible to:
- Group variants under a model
- Track model-level changes
- Show a model overview page

---

## Proposed Schema

### Core Entity Hierarchy

```
oems (13 OEMs)
  └─ vehicle_models (Sportage, EV9, Ranger, etc.)
       └─ vehicle_variants (S Petrol, GT-Line Diesel, etc.)
            ├─ variant_colors (Clear White, Aurora Black Pearl, etc.)
            ├─ variant_pricing (standard / premium / matte, per-state)
            └─ variant_interiors (Black Cloth, Tan Leather, etc.)
```

### New Tables

#### `vehicle_models` — the missing middle layer
```sql
CREATE TABLE vehicle_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,                    -- 'sportage', 'ev9', 'ranger'
  name TEXT NOT NULL,                    -- 'Sportage', 'EV9', 'Ranger'
  body_type TEXT,                        -- 'SUV', 'Sedan', 'Ute', 'Hatch'
  category TEXT,                         -- 'suv', 'electric', 'hybrid', 'commercial'
  model_year INT,                        -- 2025, 2026
  is_active BOOLEAN DEFAULT true,
  hero_image_url TEXT,
  configurator_url TEXT,                 -- build-and-price entry URL
  source_url TEXT,                       -- main model page URL
  oem_model_code TEXT,                   -- OEM internal code (e.g. 'NQ5_PE_RHD')
  meta_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(oem_id, slug)
);
```

#### Rename `products` → use as `vehicle_variants`
Instead of creating a new table and migrating, we ADD columns to `products`:
```sql
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES vehicle_models(id),
  ADD COLUMN IF NOT EXISTS variant_code TEXT,     -- OEM trim code (e.g. 'S-P', 'GTL-D')
  ADD COLUMN IF NOT EXISTS variant_name TEXT,     -- display name (e.g. 'S Petrol')
  ADD COLUMN IF NOT EXISTS drivetrain TEXT,       -- 'FWD', 'AWD', 'RWD'
  ADD COLUMN IF NOT EXISTS engine_desc TEXT;      -- '2.0L MPI Petrol', 'Electric', '1.6L Turbo Diesel'
```

#### `variant_colors` — one product → many colors
```sql
CREATE TABLE variant_colors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_code TEXT NOT NULL,
  color_name TEXT NOT NULL,
  color_type TEXT,                       -- 'solid', 'metallic', 'pearl', 'matte'
  is_standard BOOLEAN DEFAULT false,
  price_delta NUMERIC DEFAULT 0,
  swatch_url TEXT,
  hero_image_url TEXT,                   -- vehicle image in this color
  gallery_urls JSONB DEFAULT '[]',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, color_code)
);
```

#### `variant_pricing` — per-state, per-paint-type pricing
```sql
CREATE TABLE variant_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_type TEXT NOT NULL DEFAULT 'standard',
  rrp NUMERIC,
  driveaway_nsw NUMERIC,
  driveaway_vic NUMERIC,
  driveaway_qld NUMERIC,
  driveaway_wa NUMERIC,
  driveaway_sa NUMERIC,
  driveaway_tas NUMERIC,
  driveaway_act NUMERIC,
  driveaway_nt NUMERIC,
  price_qualifier TEXT,
  effective_date DATE,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, price_type)
);
```

#### `variant_interiors`
```sql
CREATE TABLE variant_interiors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  interior_code TEXT NOT NULL,
  interior_name TEXT NOT NULL,
  material TEXT,
  is_standard BOOLEAN DEFAULT true,
  price_delta NUMERIC DEFAULT 0,
  swatch_url TEXT,
  image_url TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, interior_code)
);
```

#### `oem_color_palette` — master color table per OEM
```sql
CREATE TABLE oem_color_palette (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  color_code TEXT NOT NULL,
  color_name TEXT NOT NULL,
  color_type TEXT,
  hex_approx TEXT,                       -- '#000000' for UI rendering
  swatch_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(oem_id, color_code)
);
```
This avoids duplicating color metadata across hundreds of variant_colors rows.

### Tables to Keep As-Is
- `oems` ✓
- `offers` ✓ (but add `model_id` FK)
- `change_events` ✓
- `import_runs` ✓
- `source_pages` ✓
- `discovered_apis` ✓
- `ai_inference_log` ✓
- `*_embeddings` ✓

### Tables to Drop (unused, 0 rows)
- `product_images` → replaced by `variant_colors.gallery_urls`
- `product_versions` → `change_events` already tracks changes
- `offer_assets` → `offers.hero_image_r2_key` is sufficient
- `offer_versions` → tracked by `change_events`
- `banner_versions` → tracked by `change_events`
- `oem_members` → not used

### Columns to Remove from `products`
These were added ad-hoc and belong elsewhere:
- `engine_size`, `cylinders`, `gears`, `doors`, `seats` → move to `meta_json` or `vehicle_models`
- `variants` JSONB → replaced by the model→variant hierarchy
- `key_features` → keep but clarify: marketing features only
- `cta_links` → rarely used, keep in `meta_json`

---

## Data Cleanup

### Deduplicate products
Products from offer pages (with colon-pipe keys like `"Seltos:S  |  CVT"`) should be merged into the canonical build-and-price entries:

| Keep | Delete | Reason |
|------|--------|--------|
| `seltos-s-cvt` ($31,250) | `Seltos:S  |  CVT` ($33,640) | B&P is canonical, offer page dupe |
| `ev3-gtl-lr` ($63,950) | `EV3:GT-Line` (no price) | B&P has full data |
| `new-stonic-s` ($28,180) | `New Stonic:S  |  DCT` ($29,990) | Different price = offer price, link via offers table |

### Fix `offer_products` join table
The `offer_products` table (0 rows) should link offers to their applicable products. Currently `offers.applicable_models` is a JSON array of strings — these should be FKs.

---

## Relationship Diagram

```
oems
 ├── vehicle_models          (1 OEM → many models)
 │    └── products           (1 model → many variants)
 │         ├── variant_colors     (1 variant → many colors)
 │         ├── variant_pricing    (1 variant → standard + premium + matte)
 │         ├── variant_interiors  (1 variant → many interior options)
 │         └── product_embeddings (1 variant → 1 embedding)
 ├── oem_color_palette       (master color list per OEM)
 ├── offers                  (promotions, linked to models/variants)
 │    └── offer_products     (many-to-many: offer ↔ product)
 ├── source_pages            (URLs we monitor)
 ├── discovered_apis         (API endpoints found via crawling)
 ├── import_runs             (crawl job history)
 ├── change_events           (what changed and when)
 └── brand_tokens / page_layouts / design_captures  (design system)
```

---

## Migration Plan

### Phase 1: Add new tables (non-breaking)
1. Create `vehicle_models`
2. Create `variant_colors`
3. Create `variant_pricing`
4. Create `variant_interiors`
5. Create `oem_color_palette`
6. Add `model_id`, `variant_code`, `variant_name`, `drivetrain`, `engine_desc` to `products`

### Phase 2: Populate from existing data
1. Extract distinct models from products → populate `vehicle_models`
2. Parse `meta_json.colours` → populate `variant_colors`
3. Parse `meta_json.driveaway_by_state` → populate `variant_pricing`
4. Parse `meta_json` interior data → populate `variant_interiors`
5. Build `oem_color_palette` from all unique colors per OEM
6. Link products to models via `model_id`

### Phase 3: Clean up (breaking)
1. Deduplicate products (merge offer-page dupes)
2. Populate `offer_products` join table
3. Drop unused tables
4. Remove deprecated columns from products

### Phase 4: Update application code
1. Update extractors to write to new tables
2. Update sales-rep queries to use new structure
3. Add API endpoints for model→variant→color drill-down
