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

**Vehicle Specifications (separate columns):**
- `engine_size` - Engine displacement (e.g., "1373", "2.0L")
- `cylinders` - Number of cylinders (e.g., 4, 6)
- `transmission` - Transmission type (e.g., "Sports Automatic", "CVT")
- `gears` - Number of gears (e.g., 6, 8)
- `drive` - Drive type (e.g., "Front Wheel Drive", "AWD")
- `doors` - Number of doors (e.g., 5)
- `seats` - Seating capacity (e.g., 5, 7)

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
- Financing deals, lease specials, incentives

### Banners
- Homepage promotional content

## Output

- Extracted data mapped to canonical schemas (`product.v1`, `offer.v1`, `banner.v1`)
- Content hash for change detection
- Upserted to Supabase with diff computation
- Change events fired if data differs from current record

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
