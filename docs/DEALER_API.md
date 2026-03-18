# Dealer API — WP-Compatible Middleware

Public REST API that serves vehicle variant data from Supabase in the same JSON schema as the legacy WordPress REST API, enabling dealer website components to work without modification.

**Base URL**: `https://oem-agent.adme-dev.workers.dev`
**Auth**: None (public endpoints, mounted before CF Access middleware)
**Cache**: `Cache-Control: public, max-age=300` (5 minutes)

---

## Endpoints

### GET /api/wp/v2/catalog

Returns all models with nested variants for an OEM. This is the primary endpoint for dealer websites that need the complete catalog in a single request.

**Parameters:**
| Param | Required | Description |
|-------|----------|-------------|
| `oem_id` | Yes | OEM identifier (e.g. `kgm-au`, `kia-au`) |

**Response:** Array of model objects, each containing nested `variants` array in WP schema.

```json
[
  {
    "model": "Sportage",
    "slug": "sportage",
    "body_type": "SUV",
    "category": "suv",
    "model_year": 2025,
    "hero_image_url": "",
    "variant_count": 6,
    "variants": [ /* WpVariant[] */ ]
  }
]
```

---

### GET /api/wp/v2/models

Returns active model list for an OEM (lightweight, no variant data).

**Parameters:**
| Param | Required | Description |
|-------|----------|-------------|
| `oem_id` | Yes | OEM identifier |

**Response:** Array of model objects from `vehicle_models` table.

```json
[
  {
    "id": "uuid",
    "slug": "sportage",
    "name": "Sportage",
    "body_type": "SUV",
    "category": "suv",
    "model_year": 2025,
    "hero_image_url": null,
    "is_active": true
  }
]
```

---

### GET /api/wp/v2/variants

Returns paginated variants for a specific model in WP schema. Headers `X-WP-Total` and `X-WP-TotalPages` are included for pagination compatibility.

**Parameters:**
| Param | Required | Description |
|-------|----------|-------------|
| `filter[variant_category]` | Yes | Model slug (e.g. `sportage`, `musso-my26`) |
| `oem_id` | Yes | OEM identifier |
| `per_page` | No | Results per page (default 100, max 100) |
| `page` | No | Page number (default 1) |

**Response:** Array of `WpVariant` objects.

---

## WpVariant Schema

Each variant object matches the legacy WordPress REST API format:

```typescript
{
  id: number,                    // Deterministic hash of UUID
  date: string,                  // ISO date (no timezone)
  title: { rendered: string },   // Variant title
  slug: string,                  // URL-safe slug
  excerpt: { rendered: string }, // Always empty
  metadesc: { rendered: string },
  metatitle: { rendered: string },
  short_desc: string,
  grade_id: string | null,
  features: string,              // HTML <ul> of key features
  em: string,                    // variant_code or external_key
  vehicle_image: [string, number, number, boolean],  // [url, 750, 450, false]
  disclaimer: string,
  model: string,                 // Model name
  grade: string,                 // subtitle / variant_name / body_type
  segment: string,               // body_type
  engine: string,                // e.g. "2.2L 4cyl Diesel"
  fuel: string,                  // "Petrol", "Diesel", "Electric"
  transmission: string,          // "Automatic", "Manual"
  drive_train: string,           // "AWD", "FWD", "4WD"
  seats: string,
  doors: string,
  colours: WpColour[],           // Color options array
  drive_away: string,            // e.g. "$45,990 DRIVEAWAY*"
  drive_away_manual: string,
  offer: string,
  offer_price: string,
  offer_disclaimer: string,
  brochure: string | null,
  specifications: object | null  // specs_json if available
}
```

### WpColour Schema

```typescript
{
  images: string,          // Hero image URL for this color
  swatch_colour_: string,  // Hex code from oem_color_palette
  swatch_image: string,    // Swatch thumbnail URL
  colour_name: string,     // Display name
  paint_price: string,     // Delta from standard (e.g. "700", "0")
  images_360: string,      // Reserved (empty)
  images_360_roof: string,
  roof_color: string,
  roof_price: string
}
```

---

## Data Sources

The dealer API pulls from these Supabase tables:

| Table | Data |
|-------|------|
| `vehicle_models` | Model lookup by `(oem_id, slug)` |
| `products` | Variant details (title, specs, pricing, features) |
| `variant_colors` | Per-variant color options with images |
| `variant_pricing` | Per-state driveaway pricing (standard/rrp/premium) |
| `oem_color_palette` | OEM-level color hex codes for UI swatches |

### Query Strategy

1. Look up `vehicle_models` by `(oem_id, slug)`
2. Get `products` by `model_id` (fallback: title `ILIKE` match)
3. Parallel fetch: `variant_colors` + `variant_pricing` + `oem_color_palette`
4. Transform to WP JSON schema via shared `transformProduct()` function

---

## Pricing Logic

The API resolves driveaway pricing with the following priority:

1. `variant_pricing.driveaway_vic` (standard type preferred)
2. `variant_pricing.driveaway_nsw` (fallback state)
3. `variant_pricing.rrp` (fallback to RRP)
4. `products.price_amount` (fallback to product-level price)
5. `products.price_raw_string` (raw text fallback)

---

## Implementation

**File**: `src/routes/dealer-api.ts`
**Mounting**: `src/index.ts` line 168 — `app.route('/api/wp/v2', dealerApi)`

The route is public (no auth required), mounted before the Cloudflare Access middleware in the Hono app.

---

## Available OEM IDs

`ford-au`, `foton-au`, `gac-au`, `gmsv-au`, `gwm-au`, `hyundai-au`, `isuzu-au`, `kgm-au`, `kia-au`, `ldv-au`, `mazda-au`, `mitsubishi-au`, `nissan-au`, `subaru-au`, `suzuki-au`, `toyota-au`, `volkswagen-au`

---

## specs_json Auto-Population

As of March 2026, `specs_json` is automatically built on every product upsert via `orchestrator.buildSpecsJson()`. The canonical structure:

```json
{
  "engine": { "displacement", "type", "cylinders", "power", "torque" },
  "transmission": { "type", "gears", "drivetrain", "transfer_case" },
  "dimensions": { "length", "width", "height", "kerb_weight", "ground_clearance" },
  "towing": { "braked", "unbraked", "payload", "gvm", "gcm" },
  "capacity": { "seats", "doors", "cargo_volume", "fuel_tank" },
  "performance": { "zero_to_hundred", "fuel_consumption", "co2_emissions" }
}
```

`variant_colors` are also auto-synced for all OEMs during product upsert — the `colours` array in the WP schema is populated from this table.

---

## Example Requests

```bash
# Full catalog for KGM/Ssangyong
curl "https://oem-agent.adme-dev.workers.dev/api/wp/v2/catalog?oem_id=kgm-au"

# Model list for Kia
curl "https://oem-agent.adme-dev.workers.dev/api/wp/v2/models?oem_id=kia-au"

# GMSV catalog (Silverado, Corvette, Yukon)
curl "https://oem-agent.adme-dev.workers.dev/api/wp/v2/catalog?oem_id=gmsv-au"

# GMSV Corvette variants
curl "https://oem-agent.adme-dev.workers.dev/api/wp/v2/variants?filter[variant_category]=corvette-stingray&oem_id=gmsv-au"

# Variants for a specific model
curl "https://oem-agent.adme-dev.workers.dev/api/wp/v2/variants?filter[variant_category]=sportage&oem_id=kia-au"

# LDV catalog (T60 MAX, Terron 9, D90, Deliver 7/9, MIFA 9, etc.)
curl "https://oem-agent.adme-dev.workers.dev/api/wp/v2/catalog?oem_id=ldv-au"

# LDV T60 MAX variants
curl "https://oem-agent.adme-dev.workers.dev/api/wp/v2/variants?filter[variant_category]=t60-max&oem_id=ldv-au"
```
