# Accessories Discovery & Seeding Guide

**Last Updated**: 2026-03-19
**Total**: 2,913 accessories across 13 OEMs (incl. Chery AU), 2,981 accessory-model joins

## Overview

Each OEM exposes accessory data differently. This document records the data source, extraction methodology, edge cases, and re-seeding instructions for each OEM.

All seed scripts are in `dashboard/scripts/` and follow a common pattern:
1. Fetch data from OEM source
2. Upsert `vehicle_models` rows
3. Delete existing OEM accessories (clean slate)
4. Insert `accessories` in 200-row batches
5. Populate `accessory_models` join table

**Run from**: `cd dashboard/scripts && node seed-{oem}-accessories.mjs`

---

## KGM (225 accessories)

**Script**: `seed-kgm-accessories.mjs`
**Source**: Payload CMS REST API at `payloadb.therefinerydesign.com/api/accessories`
**Auth**: None (requires Origin/Referer headers)
**Categories**: 7 (Protection, Towing, Exterior Styling, Interior, Cargo, Performance, Electrical)

### API Details
- `GET /api/accessories?limit=1000&depth=3` returns all accessories with nested model references
- Each accessory has `models[]` array linking to vehicle models
- Some accessories have `parentAccessory` for sub-accessory relationships (stored as `parent_id`)
- Image URLs are relative — prepend `https://payloadb.therefinerydesign.com`

### Edge Cases
- 13 sub-accessories with parent_id references (e.g., tow bar wiring sub-components)
- Phase 1 inserts parents first, Phase 2 inserts children with parent_id lookup
- Model names include prefix (e.g., "Musso MY26 Ultimate") — match by prefix to vehicle_models

---

## Mitsubishi (223 accessories)

**Script**: `seed-mitsubishi-accessories.mjs`
**Source**: Magento 2 GraphQL at `store.mitsubishi-motors.com.au/graphql`
**Auth**: None
**Categories**: Per model-year subcategories under parent category 133

### API Details
- GraphQL query fetches `products(filter: { category_id: { eq: N } })` with pagination
- Subcategory IDs per model: Triton 25MY=97, Outlander=61, Eclipse Cross=38, ASX=44, Pajero Sport=48
- Returns: name, sku, price_range, description, image, custom_attributes (for fitment info)

### Edge Cases
- Category structure changes with model year refreshes (e.g., "Triton 25MY" vs "Triton 24MY")
- Some accessories span multiple models — matched by name similarity
- Magento pagination: `pageSize: 100, currentPage: N`

---

## Mazda (266 accessories)

**Script**: `seed-mazda-accessories.mjs`
**Source**: React hydration data embedded in HTML at `mazda.com.au/shopping-tools/genuine-accessories/{model}/`
**Auth**: None
**Categories**: Per-model page, no consistent category structure

### API Details
- No API — data is inline in `ReactDOM.hydrate(React.createElement(Koala.App, {props}))` call
- Extract `"accessories":[` array via bracket matching on the HTML source
- Each accessory: `{ name, partNumber, priceText, price, category, imageSrc, nameplate }`
- `nameplate` contains applicable grades/body styles

### Edge Cases
- CX-8 and MX-30 have no accessory data (likely discontinued models)
- Image URLs may be relative — prepend `https://www.mazda.com.au` for paths starting with `/`
- Price is in cents in some fields, dollars in others — use `priceText` and parse `$X,XXX`
- 387 accessory_models join rows (many accessories shared across grades)

---

## Isuzu (204 accessories)

**Script**: `seed-isuzu-accessories.mjs`
**Source**: Sitecore/AEM BuildandQuote API at `isuzuute.com.au/isuzuapi/`
**Auth**: None
**Models**: D-MAX, MU-X only

### API Details
- Range API: `GET /isuzuapi/Range/GetRange?rangeid={GUID}` returns all variants
  - D-MAX GUID: `{58ED1496-0A3E-4C26-84B5-4A9A766BF139}`
  - MU-X GUID: `{C91E66BB-1837-4DA2-AB7F-D0041C9384D7}`
- Accessories API: `GET /isuzuapi/BuildandQuote/GetCarColours?carName={variant}`
  - Returns colours + 4 accessory category arrays
- Variant names built from Range data: `{MODEL}-{driveType}-{grade}-{cabin}-{body}`
  - Example: `D-MAX-4x4-X-TERRAIN-Crew-Cab-Ute`

### Edge Cases
- 4 accessory categories: ExteriorFrontAndSide, ExteriorRear, RoofAndInterior, GenuineTrayBodies
- **2.2L variants share identical accessories with 3.0L** — skip 2.2L to avoid duplicates
- Accessories are per-variant, not per-model — deduplicate by partNumber across variants
- Price range: $59.50–$5,163.75

---

## Hyundai (526 accessories)

**Script**: `seed-hyundai-accessories.mjs`
**Source**: Content API v3 at `hyundai.com/content/api/au/hyundai/v3/accessories`
**Auth**: None
**Models**: 15 (all current models except IONIQ 5 N and i30 N Line)

### API Details
- `GET /content/api/au/hyundai/v3/accessories?groupId={groupId}`
- `groupId` is a UUID specific to each model's accessories page
- Returns `{ accessories: [...], accessoryPacks: [...] }` with name, price, description, images
- Image URLs are relative — prepend `https://www.hyundai.com`

### GroupId Discovery
GroupIds are NOT published in any API. They are scraped from the `model-series-id` attribute on each model's accessories HTML page:
```
<div ... model-series-id="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
```

**Known groupIds** (as of Feb 2026):
| Model | groupId |
|-------|---------|
| Tucson | 3c79bdcd-b75c-4f7e-a0f4-8e25e64f3fe9 |
| Kona | e2f00e6c-bc38-4c63-aab1-2b4a0afcf67c |
| Venue | d7d7e4c6-bc0c-4b6f-a6a9-93f96acab6f6 |
| Santa Fe | 6e8f3c7e-f5c4-4de8-bede-3ea3c3aa6b11 |
| Palisade | f7a20f0b-af56-4b22-80f8-4234cc4f60b3 |
| i30 | 6b08ed7a-6a38-4ead-b4d9-60a9ae547e2e |
| Staria | f00a48b6-dcf2-4faf-ab96-c7a3e1c77d78 |

Additional groupIds discovered by scraping model pages (IONIQ 5, IONIQ 6, i30 Sedan, Kona Electric, etc.).

### Edge Cases
- IONIQ 5 N and i30 N Line accessories pages don't exist (404)
- Packs returned separately in `accessoryPacks[]` — stored with `category: 'Packs'`
- Price range: $45–$10,990

---

## Kia (246 accessories)

**Script**: `seed-kia-accessories.mjs`
**Source**: JSON-LD structured data on model accessories pages
**Auth**: None
**Models**: 12 (excludes Rio and Niro)

### API Details
- No API — data is in `<script type="application/ld+json">` tags on `kia.com/au/cars/{model}/accessories.html`
- Schema.org `Product` objects with: name, description, image, offers.price
- Installation type in `additionalProperty`: "PART & FITMENT" or "PART ONLY"

### Extraction
```javascript
// Parse all JSON-LD blocks from the page
const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
// Filter for Product types with price > 0
```

### Edge Cases
- Rio page exists but has no JSON-LD product data
- Niro page returns 404
- Some accessories appear on multiple model pages — deduplicated by name+price key
- 391 accessory_models join rows across 12 models
- Price range: $17–$2,263

---

## Subaru (299 accessories)

**Script**: `seed-subaru-accessories.mjs`
**Source**: Retailer API v1 (AWS API Gateway)
**Auth**: `x-api-key` header required
**Models**: 7 (Forester, Outback, Crosstrek, WRX, Impreza, BRZ, Solterra)

### API Details
- Base URL: `https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api/v1`
- API Key: `w68ewXf97mnPODxXG6ZA4FKhP65wpUK576oLryW9` (from mansfield-subaru retailer .env)
- Flow:
  1. `GET /models` → list all models (returns ~10, with duplicates)
  2. `GET /models/{id}/variants` → list variants per model
  3. `GET /variants/{id}/accessories` → list accessories per variant

### Response Format
```json
{
  "accessories": [{
    "id": 123,
    "itemCode": "H4610VC030",
    "description": "Cargo Tray - Rear",
    "price": 175.00,
    "priceFitted": 223.00,
    "accessoryCategoryName": "Cargo",
    "imageSrc": "/path/to/image.jpg"
  }]
}
```

### Edge Cases
- **Duplicate models**: API returns two "Impreza" and two "BRZ" entries (different model years). Deduplicate by name, keep latest year.
- `priceFitted` stored as the main price; `price` (parts only) stored in `meta_json.price_parts_only`
- Image URLs need base URL prepend
- Price range: $21–$6,469

---

## Nissan (179 accessories)

**Script**: `seed-nissan-accessories.mjs`
**Source**: Server-rendered HTML on accessories pages (no JSON API)
**Auth**: None
**Models**: 7 (Navara, X-Trail, Qashqai, Pathfinder, Patrol, Juke, Ariya)

### Two Page Templates

Nissan uses two different AEM/Sitecore page templates for accessories:

**Template 1 — "Structured"** (Navara, Qashqai):
- CSS classes: `.accessory-name`, `.accessory-price`, `.accessory-part-number`
- Parallel arrays — name[i] corresponds to price[i] and part[i]
- Also has `.style-pack-name` / `.style-pack-price` for packs

**Template 2 — "Rich-text"** (X-Trail, Pathfinder, Patrol, Juke, Ariya):
- No CSS class structure for individual items
- Prices embedded as `Fitted RRP: $X,XXX` in content blocks
- Names in `<h3><span>Name</span></h3>` or `<b>NAME</b>` tags
- Part numbers sometimes in parentheses within the name

### Extraction Strategies
The seed script applies three strategies in order:
1. **Strategy 1**: Extract `.accessory-name` / `.accessory-price` parallel arrays
2. **Strategy 2**: Find all `Fitted RRP: $X` patterns, associate with nearest heading via lookback
3. **Strategy 3**: Extract `.style-pack-name` / `.style-pack-price` pairs

### Edge Cases
- All proxy.json AEM endpoints return 404 — no JSON API available
- **Duplicate external_key resolution**: Multiple accessories can slugify to the same key. Resolution:
  1. Try `nissan-{partNumber || slugify(name)}`
  2. If duplicate, try `nissan-{slugify(name)}-{price}`
  3. If still duplicate, try `nissan-{slugify(mapKey)}`
- Rich-text template heading association uses 1500-char lookback window
- Price sanity check: must be > $0 and < $50,000
- Price range: $23–$24,340

---

## Volkswagen (353 accessories)

**Script**: `seed-vw-accessories.mjs`
**Source**: E-catalogue GraphQL at `volkswagen-genuine-accessories.com/au/api/graphql/`
**Auth**: Bearer token from auto-issued `accessToken` cookie (guest session)
**Categories**: 7 top-level (Sport & Design, Transport, Comfort & Protection, Communication, Wheels, E-Charging, Lifestyle)

### API Details
- Homepage `GET /au/en/` returns `accessToken` JWT cookie (scope: `shop-guest`)
- GraphQL schema (introspection disabled): types discovered by trial-and-error
  - `core_category(id)` → category tree with children
  - `core_product(id)` → single product with variations
  - `coreSearchSuggest(query)` → product search suggestions
  - `shop_search(filter, paging)` → full product search via `ProductSearchResult`
- **Product listing**: `ProductSearchResult.entries[].product` (NOT `.items[]`)
- **Pricing**: `Variation.price { amount currencyCode }` (Money type fields: `amount`, `currencyCode`)
- **Variation type**: `Item` (has `id`, `sku`, `shortDescription`, `price`, `images`, `link`, `availability`)
- Category product listing: `core_category.products(paging, filter) { ... on ProductSearchResult { totalCount entries { product { ... } } } }`

### Category Tree
| Category | Products | Subcategories |
|----------|----------|---------------|
| Sport & Design | 44 | 5 |
| Transport | 52 | 5 |
| Comfort & Protection | 202 | 12 |
| Communication | 7 | 2 |
| Wheels | 29 | 2 |
| E-Charging | 0 | 2 |
| Lifestyle | 30 | 6 |

### Edge Cases
- **No car model associations**: E-catalogue categorizes by accessory type, not by vehicle model. No `accessory_models` rows created.
- **Introspection disabled**: Schema discovered through systematic field probing (14 probe scripts)
- **Shop API v1 returns 403**: `/api/shop/v1/*` endpoints require internal auth — only GraphQL works with guest token
- **Multiple variations**: Some products have multiple SKU variations (different colors/sizes). Primary variation used for price; extras stored in `meta_json.additionalVariations`
- **OSSE platform**: Backend is CARIAD OSSE (Volkswagen Group e-commerce), Nuxt 3 frontend
- Price range: $39.09–$4,160.00

---

## GWM (181 accessories)

**Script**: `seed-gwm-accessories.mjs`
**Source**: Storyblok CDN API at `api.storyblok.com/v2/cdn/stories`
**Auth**: Public token `rII785g9nG3hemzhYNQvQwtt` (requires Origin/Referer headers)
**Models**: 9 Storyblok models mapped to 8 DB models

### API Details
- `GET /v2/cdn/stories?by_slugs=car-configurator/models/{model}/accessories/**&language=au&per_page=100&token={token}&version=published`
- Each accessory story has: `code`, `name`, `price`, `description`, `image`
- Category derived from path hierarchy (e.g., `accessories/exterior/...` → "Exterior")
- Headers required: `Origin: https://www.gwmanz.com`, `Referer: https://www.gwmanz.com/`

### Model Mapping
Storyblok model slugs don't match DB slugs 1:1:
- `cannon-alpha` → DB `cannon` (no separate cannon-alpha in DB)
- `haval-h6gt` → DB `haval-h6` (no separate h6gt in DB)
- All others map directly

### Edge Cases
- Some accessories span multiple Storyblok models — deduplicated by external_key (`gwm-au-{code}`)
- 56.4% have images (some Storyblok entries lack `image.filename`)
- Price range: $52–$4,949
- Also has driveaway pricing data in Storyblok (not yet extracted)

---

## OEMs Without Accessories Data

| OEM | Status | Reason |
|-----|--------|--------|
| Toyota | Blocked | APIs accessible via browser session only (Cloudflare blocks curl). Products/colors/pricing seeded but no accessory API found. |
| Ford | No API | AEM server-rendered, 13MB HTML pages, no structured data |
| LDV | Not found | No accessory APIs discovered (only 1 product in DB) |
| Suzuki | Not found | No accessory APIs discovered |

---

## Supabase Schema

### `accessories` table
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| oem_id | TEXT | FK to oems |
| external_key | TEXT | Unique per OEM (pattern: `{oem}-{partNumber or slug}`) |
| name | TEXT | Display name |
| slug | TEXT | URL-safe name |
| part_number | TEXT | OEM part number (nullable) |
| category | TEXT | Accessory category (nullable) |
| price | NUMERIC(10,2) | Price in AUD |
| description_html | TEXT | Rich description (nullable) |
| image_url | TEXT | Primary image URL (nullable) |
| inc_fitting | TEXT | 'includes', 'excludes', or 'none' |
| parent_id | UUID | Self-ref FK for sub-accessories (KGM only) |
| meta_json | JSONB | OEM-specific fields |

### `accessory_models` join table
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| accessory_id | UUID | FK to accessories (CASCADE) |
| model_id | UUID | FK to vehicle_models (CASCADE) |
| UNIQUE(accessory_id, model_id) | | |

---

## Re-seeding Instructions

To refresh all accessories data:

```bash
cd dashboard/scripts

# Run each OEM seed script
node seed-kgm-accessories.mjs
node seed-mitsubishi-accessories.mjs
node seed-mazda-accessories.mjs
node seed-isuzu-accessories.mjs
node seed-hyundai-accessories.mjs
node seed-kia-accessories.mjs
node seed-subaru-accessories.mjs
node seed-nissan-accessories.mjs
node seed-vw-accessories.mjs
node seed-gwm-accessories.mjs
```

Each script is idempotent — it deletes existing OEM accessories and re-inserts fresh data.

### Cron Considerations
- **KGM, Mitsubishi, Hyundai, Subaru**: Stable APIs, safe for daily cron
- **Mazda**: Inline HTML data, may break if page template changes
- **Isuzu**: API is stable, safe for cron
- **Kia**: JSON-LD in HTML, moderately stable
- **Nissan**: HTML scraping with dual templates — most fragile, monitor for template changes
- **Volkswagen**: GraphQL API with guest JWT — stable, safe for daily cron. Token auto-renewed per request.
- **GWM**: Storyblok CDN API with public token — stable, safe for daily cron
- **All scripts**: Add error alerting for HTTP failures or zero-item results
