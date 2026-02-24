---
name: oem-extract
description: Product, offer, and banner extraction from rendered HTML. Uses deterministic extraction first (JSON-LD, OpenGraph, CSS selectors) with LLM fallback for complex cases.
---

# OEM Extract

Extracts structured data from rendered OEM web pages.

## Extraction Priority (deterministic first, LLM fallback)

1. JSON-LD structured data
2. OpenGraph meta tags
3. CSS selector extraction (OEM-specific via `lib/extractors/`)
4. LLM normalisation fallback (Groq) - only if <80% field coverage

## Prerequisites

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for data storage
- `GROQ_API_KEY` for LLM fallback extraction

## Triggered By

- `oem-crawl` skill after full render detects a change

## Page Types

- `vehicle` - Model overview pages with basic specs and pricing
- `build_price` - Build-and-price/configurator pages with:
  - Variant selection (trims, drivetrains)
  - Color options with pricing
  - Detailed disclaimers
  - Example: `kia.com/au/shopping-tools/build-and-price.trim.k4-hatch.html`
- `offers` - Special offers and promotions
- `homepage` - Hero banners and featured content

## Data Types

### Products

Vehicle listings with specifications, pricing, and features.

**Core Fields:**
- `title`, `subtitle` - Vehicle name and series
- `body_type` - SUV, Sedan, Hatchback, etc.
- `fuel_type` - Petrol, Diesel, Hybrid, Electric
- `availability` - For Sale, Coming Soon, Sold Out
- `price_amount`, `price_currency`, `price_type`, `price_qualifier`

**Technical Specifications (`specs_json` JSONB — 692/709 products, 97.6%):**
- `engine` - type, displacement_cc, cylinders, power_kw, torque_nm
- `transmission` - type, gears, drive
- `dimensions` - length_mm, width_mm, height_mm, wheelbase_mm, kerb_weight_kg
- `performance` - fuel_combined_l100km (ICE) or range_km, battery_kwh (EV)
- `towing` - braked_kg, unbraked_kg
- `capacity` - doors, seats, boot_litres, fuel_tank_litres
- `safety` - ancap_stars, airbags
- `wheels` - size, type

All 8 categories at 100% coverage. 12/16 OEMs fully complete (only Ford 11 + Nissan 6 legacy entries missing).

**Vehicle Specifications (legacy scalar columns):**
- `engine_size`, `cylinders`, `transmission`, `gears`, `drive`, `doors`, `seats`

**OEM Marketing Features (`key_features` array):**
- Features displayed on OEM vehicle pages (e.g., "Apple CarPlay", "Blind Spot Monitor", "Adaptive Cruise Control")
- These are promotional/marketing features, NOT vehicle specifications

**Variants (`variants` array):**
- Each variant includes: name, price_amount, price_type, drivetrain, engine
- `colors` - Available color options for the variant:
  - `name` - Color name (e.g., "Aurora Black Pearl")
  - `code` - OEM color code (e.g., "WK")
  - `hex` - Hex color value for UI display
  - `swatch_url` - URL to color swatch image
  - `price_delta` - Additional cost (0 for standard, e.g., 695 for metallic)
  - `is_standard` - Whether included in base price
- `disclaimer_text` - Variant-specific disclaimer

**Product Disclaimer (`disclaimer_text`):**
- Legal disclaimers attached to the product pricing
- Extracted from build-and-price pages

**Metadata (`meta_json`):**
- VIN, registration, stock number
- Odometer, build year, exterior colour
- Location (suburb, state, postcode, lat/lng)
- Source system references (network_id, specification_code)

### Offers

Promotional offers including factory bonuses, run-out sales, value-add deals, and financing specials.

**Core Fields:**
- `title` - Offer headline (e.g., "Musso Factory Bonus - Save $2,000")
- `description` - Offer details and conditions
- `offer_type` - Classification: `factory_bonus`, `run_out`, `value_add`, `finance`, `lease`
- `price_amount` - Private/RRP starting price for the applicable model
- `abn_price_amount` - ABN holder price (when different from private price)
- `saving_amount` - Dollar amount saved (e.g., 2000, 5010)
- `price_currency` - Always `AUD`
- `price_type` - `rrp`, `driveaway`, etc.

**Validity:**
- `validity_start` - Offer start date (ISO 8601)
- `validity_end` - Offer end date (ISO 8601)
- `validity_raw` - Raw validity text from source (e.g., "Limited time, while stocks last")

**Display:**
- `hero_image_r2_key` - URL to offer hero image (OEM CDN or CMS media)
- `cta_text` - Call-to-action button text
- `cta_url` - Call-to-action link URL
- `disclaimer_text` - Legal disclaimer text

**Linking:**
- `model_id` - FK to `vehicle_models` (when offer applies to a single model)
- `applicable_models` - Comma-separated model slugs (when offer applies to multiple models)
- `external_key` - Unique identifier for deduplication (e.g., `offer-musso-factory-bonus`)
- `source_url` - URL where the offer was found

### Banners

Homepage and offers page hero banners across 12 OEMs (50 banners, 2 with video).

**Core Fields:**
- `page_url` - Which page the banner appears on (homepage, offers page)
- `position` - Slide/carousel order (0-indexed)
- `headline` - Primary heading text
- `sub_headline` - Secondary heading text
- `cta_text` - Call-to-action button label
- `cta_url` - Call-to-action link URL
- `image_url_desktop` - Desktop hero image URL
- `image_url_mobile` - Mobile hero image URL
- `image_r2_key` - R2 proxy key (after rewrite)
- `image_sha256` - Content hash for change detection
- `video_url_desktop` - Desktop video URL (mp4 or Brightcove)
- `video_url_mobile` - Mobile video URL
- `disclaimer_text` - Legal disclaimer text

**Extraction Methods:**
- **Server-rendered HTML** (cheerio): Ford, GWM, KGM, Isuzu, Mazda, VW, Kia, Nissan — extract from slick/swiper carousels, background-image CSS, img tags
- **Browser-rendered** (Chrome MCP): Hyundai, Toyota, Suzuki — client-side JS carousels with lazy-loaded images
- **Video banners**: Ford (Brightcove Playback API — account 4082198814001, policy key needed), Suzuki (direct mp4 URLs)
- **Offers page banners**: GWM (`/special-offers/`), Suzuki (`/latest-offers/`)

## Output

- Extracted data mapped to canonical schemas (`product.v1`, `offer.v1`, `banner.v1`)
- Content hash for change detection
- Upserted to Supabase tables:
  - `products` — Vehicle variants/grades with `specs_json` (linked to `vehicle_models` via model_id)
  - `variant_colors` — Colour options per product
  - `variant_pricing` — Per-state driveaway pricing (NSW/VIC/QLD/WA/SA/TAS/ACT/NT)
  - `accessories` — Accessory catalog per OEM (via `accessory_models` join to vehicle_models)
  - `offers` — Promotional offers
  - `banners` — Homepage promotional content
  - `pdf_embeddings` — Vectorized brochure/guidelines chunks for semantic search
- Change events fired to `change_events` table if data differs from current record

## Input

```json
{
  "oem_id": "ford",
  "url": "https://ford.com/suvs/explorer",
  "page_type": "vehicle",
  "rendered_html": "<html>...</html>",
  "screenshot_r2_key": "screenshots/ford/explorer-2024.png"
}
```

## Output

```json
{
  "products": 1,
  "offers": 0,
  "banners": 0,
  "changes": 1
}
```
