/**
 * Seed Mitsubishi Australia discovered APIs + docs.
 * Magento 2 GraphQL at store.mitsubishi-motors.com.au/graphql
 * Run: node dashboard/scripts/seed-mitsubishi-apis.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const apis = [
  {
    oem_id: 'mitsubishi-au',
    url: 'https://store.mitsubishi-motors.com.au/graphql',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'offers',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      queries: {
        GetAllOffers: {
          variables: { priceGroup: 'PRIVATE | BUSINESS' },
          returns: ['title', 'offer_id', 'family', 'vehicle (sku/name/fuel/drive/transmission/model_year)', 'price per state (nsw/vic/qld/wa/sa/nt/act/tas)', 'image', 'disclaimers'],
        },
      },
      note: '43 offers across ASX, Eclipse Cross, Outlander, Pajero Sport, Triton. State-by-state driveaway pricing. No auth. Introspection disabled.',
      families: ['asx', 'eclipse_cross', 'outlander', 'pajero_sport', 'triton'],
      discovery_source: 'Mitsubishi dealer theme source code',
      verified_date: '2026-02-19',
    },
  },
  {
    oem_id: 'mitsubishi-au',
    url: 'https://store.mitsubishi-motors.com.au/graphql#products',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      endpoint: 'https://store.mitsubishi-motors.com.au/graphql',
      query_name: 'products',
      filters: { category_id: '31 (Vehicles) or 133 (Accessories)', sku: 'exact match' },
      returns: {
        vehicles: '57 ConfigurableProducts with configurable_options (exterior_code/colours with swatches, interior_code, option_pack) and per-variant SKUs with individual pricing',
        accessories: '223 products with pricing and per-family/model-year categories',
      },
      note: 'Magento 2 products query. Vehicles are ConfigurableProducts — variants = colour/interior/pack combos. Each variant has unique SKU and price.',
      discovery_source: 'GraphQL query probing',
      verified_date: '2026-02-19',
    },
  },
  {
    oem_id: 'mitsubishi-au',
    url: 'https://store.mitsubishi-motors.com.au/graphql#categories',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'config',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      endpoint: 'https://store.mitsubishi-motors.com.au/graphql',
      query_name: 'categories',
      returns: {
        top_level: 'Vehicles (31), Accessories (133)',
        accessory_subcategories: 'Triton 25MY (97), Outlander 25MY (61), Pajero Sport 25MY (51), ASX 25MY (44), Eclipse Cross 24MY (11)',
      },
      discovery_source: 'GraphQL query probing',
      verified_date: '2026-02-19',
    },
  },
]

const docs = `# Mitsubishi Motors Australia — API Architecture

## Overview

Mitsubishi runs a **Magento 2 GraphQL storefront** at \`store.mitsubishi-motors.com.au/graphql\`. No authentication required. Introspection is disabled but three main query types are confirmed working.

## Endpoint

| URL | Method | Auth |
|-----|--------|------|
| \`https://store.mitsubishi-motors.com.au/graphql\` | POST | None |

## Available Queries

### 1. offers — Vehicle Offers with State Pricing

43 offers across 5 families with per-state driveaway pricing.

\`\`\`
query GetAllOffers($priceGroup: CustomerGroupEnum) {
  offers(priceGroup: $priceGroup) {
    items {
      title, offer_id, family, category
      vehicle { sku, name, fuel_type, drive_type, transmission, model_year }
      price {
        label, value, disclaimer
        nsw/vic/qld/wa/sa/nt/act/tas { label, value, override_label }
      }
      image, seats, short_description, disclaimers { marker, text }
    }
  }
}
\`\`\`

Variables: \`{ "priceGroup": "PRIVATE" }\` or \`"BUSINESS"\`

### 2. products — Vehicles & Accessories

**Vehicles** (category_id: 31) — 57 configurable products:
- ConfigurableProduct type with \`configurable_options\`:
  - \`exterior_code\` (Colour) — 3-8 colours per vehicle with swatch images
  - \`interior_code\` (Interior Trim) — 1-2 options (Cloth, Leather)
  - \`option_pack\` — 1-2 options (Standard, Deluxe)
- Each \`variant\` = unique colour/interior/pack combo with its own SKU and price
- Price varies by colour (e.g. White $39,990 vs Black Diamond $40,980)

**Accessories** (category_id: 133) — 223 products:
- Priced individually with SKU codes
- Categorized by vehicle family and model year
- Subcategories: Triton 25MY (97), Outlander 25MY (61), Pajero Sport 25MY (51), ASX 25MY (44), Eclipse Cross 24MY (11)

### 3. categories — Category Tree

Returns vehicle and accessory category hierarchy for filtering.

## Vehicle Families

| Family | Grades | Fuel Types |
|--------|--------|------------|
| ASX | LS, ASPIRE, EXCEED | Unleaded |
| Eclipse Cross | ES, ASPIRE, EXCEED | PHEV |
| Outlander | ES, LS, ASPIRE, EXCEED, EXCEED TOURER | Unleaded, PHEV |
| Pajero Sport | GLX, GLS, EXCEED, GSR | Diesel |
| Triton | GLX, GLX+, GLX-R, GLS, GSR, GSR SE | Diesel |

## Data Model

\`\`\`
Category: Vehicles (31)
  └── ConfigurableProduct (e.g. Outlander ES ZM2M45-2025)
        ├── configurable_options:
        │     ├── exterior_code: [White, Cosmic Blue, Red Diamond, ...]
        │     ├── interior_code: [Black Cloth, Leather Seats]
        │     └── option_pack: [Standard, Deluxe]
        └── variants[] — one per combo:
              ├── SKU: ZM2M452025B0136LD14
              ├── price: $40,780
              └── attributes: {exterior: Cosmic Blue, interior: Black Cloth}

Category: Accessories (133)
  ├── Triton 25MY (97 items)
  │     ├── Pick Up (64) / Cab Chassis (71)
  ├── Outlander 25MY (61 items)
  │     ├── Unleaded (50) / PHEV (49)
  ├── Pajero Sport 25MY (51 items)
  ├── ASX 25MY (44 items)
  └── Eclipse Cross 24MY (11 items)
\`\`\`

## Access Notes

- **No authentication** — Public endpoint, no API key needed
- **Introspection disabled** — Cannot discover schema via __schema
- **CORS** — May need proxy for browser access
- **Magento 2** — Standard Magento GraphQL patterns apply
- **Pagination** — pageSize up to ~60, use currentPage for more
- **Price groups** — PRIVATE (consumer) and BUSINESS (fleet/ABN)

## Scraping Strategy

1. **offers** — Single call gets all 43 offers with state pricing
2. **products(category 31)** — All 57 vehicles with colours, interiors, packs, per-variant pricing
3. **products(category 133)** — All 223 accessories with per-family categorization
4. **categories** — Category tree for accessory filtering by model

## Last Verified
February 2026 — 57 vehicles, 223 accessories, 43 offers. All queries returning data.`

async function seed() {
  console.log(`Inserting ${apis.length} Mitsubishi APIs...`)
  const { data, error } = await supabase
    .from('discovered_apis')
    .upsert(apis, { onConflict: 'oem_id,url', ignoreDuplicates: false })
    .select('id, oem_id, url')
  if (error) { console.error('API Error:', error.message); process.exit(1) }
  console.log(`Upserted ${data.length} APIs`)
  data.forEach(d => console.log(`  ${d.url}`))

  // Update docs
  const { data: existing } = await supabase
    .from('oems')
    .select('config_json')
    .eq('id', 'mitsubishi-au')
    .single()
  const config_json = { ...(existing?.config_json || {}), api_docs: docs }
  const { error: docErr } = await supabase
    .from('oems')
    .update({ config_json })
    .eq('id', 'mitsubishi-au')
  if (docErr) console.error('Doc error:', docErr.message)
  else console.log(`Updated docs — ${docs.length} chars`)
}

seed()
