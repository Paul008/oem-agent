/**
 * Seed KGM Australia (formerly SsangYong) discovered APIs + docs.
 * Payload CMS at payloadb.therefinerydesign.com — no auth required.
 * Run: node dashboard/scripts/seed-kgm-apis.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const apis = [
  {
    oem_id: 'kgm-au',
    url: 'https://payloadb.therefinerydesign.com/api/models',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      auth: 'None required (Origin: https://kgm.com.au, Referer: https://kgm.com.au/)',
      params: '?limit=100&depth=2',
      returns: {
        models: '8 models with id, name, title, price, badge, banner_image',
        fields: 'id, name (e.g. "Musso MY26"), title (e.g. "Musso"), price (starting RRP), badge, banner_image',
      },
      note: 'Payload CMS collection. Returns all vehicle models including current (MY26) and previous (MY24) generations.',
      discovery_source: 'Network analysis of kgm.com.au configurator',
      verified_date: '2026-02-19',
    },
  },
  {
    oem_id: 'kgm-au',
    url: 'https://payloadb.therefinerydesign.com/api/grades',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      params: '?limit=100&depth=3',
      returns: {
        grades: '26 grades with RRP pricing, colour options, variant packs',
        fields: 'id, name, title, slug, price, colours[], variants[], power_source, model_year, accessories[], year_discount, feature_sets',
        colours: 'Each colour has title, price ($0 standard, $700 premium), is_standard, icon (swatch URL), car_image (vehicle image URL)',
        variants: 'Optional add-on packs (XLV Pack $1500, Sport Pack $2000, Black Edge $2000, Luxury Pack $3000, Black wheels $1500)',
      },
      note: 'Primary data source. Grades are vehicle variants/trims. Grade name includes model prefix (e.g. "Musso MY26 Ultimate"). Prices are national RRP, not per-state driveaway.',
      discovery_source: 'Network analysis of kgm.com.au configurator',
      verified_date: '2026-02-19',
    },
  },
  {
    oem_id: 'kgm-au',
    url: 'https://payloadb.therefinerydesign.com/api/variants',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      params: '?limit=100&depth=2',
      returns: {
        variants: '11 optional variant packs with pricing',
        fields: 'id, name, title, price',
        examples: 'XLV Pack ($1,500), Sport Pack ($2,000), Black Edge ($2,000), Luxury Pack ($3,000), Black wheels ($1,500)',
      },
      note: 'Variant packs are optional add-ons attached to specific grades. Not separate products — they modify a base grade.',
      discovery_source: 'Network analysis of kgm.com.au configurator',
      verified_date: '2026-02-19',
    },
  },
  {
    oem_id: 'kgm-au',
    url: 'https://payloadb.therefinerydesign.com/api/colours',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      params: '?limit=200&depth=1',
      returns: {
        colours: '133 colour entries (per-grade colour options)',
        fields: 'id, name, title, price, is_standard, icon (swatch), car_image (vehicle image)',
        pricing: 'Grand White = $0 (standard), all others = $700 (premium)',
      },
      note: 'Master colour list. Each entry is grade-specific (e.g. "Musso MY26 Ultimate Grand White"). Use grades endpoint at depth=3 for grade→colour relationships.',
      discovery_source: 'Network analysis of kgm.com.au configurator',
      verified_date: '2026-02-19',
    },
  },
  {
    oem_id: 'kgm-au',
    url: 'https://payloadb.therefinerydesign.com/api/accessories',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.90,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      params: '?where[models.name][equals]={ModelName}&limit=1000&depth=3',
      returns: {
        accessories: '58+ accessories per model with pricing, categories, images',
        fields: 'id, name, title, price, sku, category, description, images, models[]',
        filter: 'Filter by model name: Musso MY26, Rexton MY26, Actyon, Torres, etc.',
      },
      note: 'Accessories catalog. Filter by model name using Payload CMS where query. Some accessories have null prices.',
      discovery_source: 'Network analysis of kgm.com.au accessories page',
      verified_date: '2026-02-19',
    },
  },
  {
    oem_id: 'kgm-au',
    url: 'https://payloadb.therefinerydesign.com/api/media',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'other',
    reliability_score: 0.90,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      params: '?limit=100&depth=1',
      returns: {
        media: '882 media items (images, documents)',
        fields: 'id, filename, url, mimeType, sizes (thumbnail, medium, large)',
      },
      note: 'Media library. All vehicle images, colour swatches, accessory photos. Referenced by other collections via ID.',
      discovery_source: 'Network analysis of kgm.com.au',
      verified_date: '2026-02-19',
    },
  },
]

const docs = `# KGM Australia — API Architecture

## Overview

KGM (formerly SsangYong) Australia runs a **Payload CMS** headless API at \`payloadb.therefinerydesign.com\`. All endpoints are public — no authentication required (just Origin/Referer headers from kgm.com.au).

## Architecture

| Component | Detail |
|-----------|--------|
| CMS | Payload CMS (Node.js headless CMS) |
| API Base | \`https://payloadb.therefinerydesign.com/api\` |
| Auth | None required |
| Headers | \`Accept: application/json\`, \`Origin: https://kgm.com.au\`, \`Referer: https://kgm.com.au/\` |
| Format | JSON with pagination (\`docs[]\`, \`totalDocs\`, \`limit\`, \`page\`) |

## Collections

### 1. Models — Vehicle Model Registry

| URL | Method | Auth |
|-----|--------|------|
| \`/api/models?limit=100&depth=2\` | GET | None |

8 models including current (MY26) and previous (MY24) generations.

**Response Structure:**
\`\`\`json
{
  "docs": [
    { "id": 10, "name": "Musso EV MY26", "title": "Musso EV", "price": 60000, "badge": null }
  ],
  "totalDocs": 8
}
\`\`\`

**Current Models:**

| Model | Starting Price | Body Type |
|-------|---------------|-----------|
| Musso EV MY26 | $60,000 | Ute (Electric) |
| Musso MY26 | $42,500 | Ute (Diesel) |
| Rexton MY26 | $50,000 | SUV (Diesel) |
| Actyon | $47,000 | SUV (Petrol/Hybrid) |
| Rexton MY24 | $50,000 | SUV (Diesel, runout) |
| Musso MY24 | $40,000 | Ute (Diesel, runout) |
| Torres | $38,000 | SUV (Petrol/Electric) |
| Korando | — | SUV (Petrol, outgoing) |

### 2. Grades — Vehicle Variants with Pricing & Colours (PRIMARY DATA SOURCE)

| URL | Method | Auth |
|-----|--------|------|
| \`/api/grades?limit=100&depth=3\` | GET | None |

26 grades with direct RRP pricing, colour options, and variant packs.

**Response Structure:**
\`\`\`json
{
  "docs": [
    {
      "id": 20,
      "name": "Musso MY26 Ultimate",
      "title": "Ultimate",
      "price": 49500,
      "power_source": "diesel",
      "colours": [
        { "title": "Grand White", "price": 0, "is_standard": false, "icon": { "url": "..." }, "car_image": { "url": "..." } },
        { "title": "Space Black", "price": 700, "is_standard": false, "icon": { "url": "..." }, "car_image": { "url": "..." } }
      ],
      "variants": [
        { "title": "XLV Pack", "price": 1500 }
      ],
      "feature_sets": { "docs": [...] },
      "accessories": []
    }
  ],
  "totalDocs": 26
}
\`\`\`

**Grade → Model Mapping:**
Grade names include model prefix. Match by prefix:
- "Musso MY26 Ultimate" → Musso MY26
- "Musso Ultimate" → Musso MY24 (no MY prefix = previous gen)
- "Torres K30" → Torres
- "Actyon K60 Hybrid" → Actyon

**Pricing:**
- Prices are **national RRP** (not per-state driveaway)
- Grand White = $0 (standard colour)
- All other colours = $700 premium
- Variant packs: $1,500–$3,000 add-on

### 3. Variants — Optional Add-on Packs

| URL | Method | Auth |
|-----|--------|------|
| \`/api/variants?limit=100&depth=2\` | GET | None |

11 variant packs:
- XLV Pack ($1,500) — Musso bed extension
- Sport Pack ($2,000) — Rexton styling
- Black Edge ($2,000) — Musso EV styling
- Luxury Pack ($3,000) — Musso interior upgrade
- Black wheels ($1,500) — Korando styling

### 4. Colours — Per-Grade Colour Options

| URL | Method | Auth |
|-----|--------|------|
| \`/api/colours?limit=200&depth=1\` | GET | None |

133 colour entries. Each is grade-specific with swatch icon and vehicle image URLs.

### 5. Accessories — Per-Model Accessories Catalog

| URL | Method | Auth |
|-----|--------|------|
| \`/api/accessories?where[models.name][equals]={ModelName}&limit=1000&depth=3\` | GET | None |

58+ accessories per model. Filter by model name.

### 6. Media — Asset Library

| URL | Method | Auth |
|-----|--------|------|
| \`/api/media?limit=100&depth=1\` | GET | None |

882 media items (images, documents) with multiple size variants.

## Payload CMS Query Syntax

Standard Payload CMS query parameters:
- \`limit\`: Results per page (default 10)
- \`depth\`: Relationship population depth (0=IDs only, 1-3=populated)
- \`where[field][operator]=value\`: Filtering (\`equals\`, \`contains\`, \`in\`, etc.)
- \`sort\`: Sort field (\`-createdAt\` for newest first)
- \`page\`: Pagination

## Scraping Strategy

1. **Grades endpoint** (depth=3) — Single GET for all 26 grades with pricing, colours, and variant packs
2. **Models endpoint** — Model registry for hierarchy mapping
3. **Accessories** — Per-model filtered queries for accessories catalog
4. **Media** — Asset URLs for images and documents

## Limitations

- **No per-state driveaway pricing** — Only national RRP available
- **No specifications collection** — Specs not exposed via API (may be in HTML pages)
- **Grade→model relationship is implicit** — Derived from grade name prefix, not an explicit FK
- **Some accessories have null prices** — Dealer-quoted items

## Last Verified

February 2026 — 8 models, 26 grades, 133 colours, 11 variant packs, 882 media items. All endpoints returning data.`

async function seed() {
  // Delete old tracking/analytics APIs
  console.log('Cleaning old KGM discovered APIs...')
  const { data: old, error: oldErr } = await supabase
    .from('discovered_apis')
    .delete()
    .eq('oem_id', 'kgm-au')
    .eq('status', 'discovered')
    .select('id, url')
  if (oldErr) console.error('Delete error:', oldErr.message)
  else console.log(`  Deleted ${old.length} old discovered APIs`)

  console.log(`\nInserting ${apis.length} KGM APIs...`)
  const { data, error } = await supabase
    .from('discovered_apis')
    .upsert(apis, { onConflict: 'oem_id,url', ignoreDuplicates: false })
    .select('id, oem_id, url, status')
  if (error) { console.error('API Error:', error.message); process.exit(1) }
  console.log(`Upserted ${data.length} APIs`)
  data.forEach(d => console.log(`  [${d.status}] ${d.url}`))

  // Update docs
  const { data: existing } = await supabase
    .from('oems')
    .select('config_json')
    .eq('id', 'kgm-au')
    .single()
  const config_json = { ...(existing?.config_json || {}), api_docs: docs }
  const { error: docErr } = await supabase
    .from('oems')
    .update({ config_json })
    .eq('id', 'kgm-au')
  if (docErr) console.error('Doc error:', docErr.message)
  else console.log(`\nUpdated docs — ${docs.length} chars`)
}

seed()
