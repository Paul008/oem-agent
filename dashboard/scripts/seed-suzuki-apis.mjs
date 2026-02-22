/**
 * Seed Suzuki Australia discovered APIs + docs.
 * Static WordPress export on S3/CloudFront — no WP REST API available.
 * Run: node dashboard/scripts/seed-suzuki-apis.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const apis = [
  {
    oem_id: 'suzuki-au',
    url: 'https://www.suzuki.com.au/suzuki-finance-calculator-data.json',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      returns: {
        models: '7 models with modelID, logo, image',
        variants: '15 variants per model with variantID, per-state driveaway pricing (ACT/NSW/VIC/QLD/WA/SA/TAS/NT), transmission options (automatic/manual), guaranteed future value (GFV) schedules for finance calculations',
        pricing: 'State-by-state driveaway prices per transmission type',
        finance: 'GFV tables at 12/24/36/48/60 months × 10K-50K kms/year',
      },
      models: ['Swift Hybrid', 'Swift Sport', 'Fronx Hybrid', 'Ignis', 'Vitara', 'S-CROSS', 'Jimny'],
      note: 'Static JSON file on S3/CloudFront. Primary source for vehicle pricing. 15 variants across 7 models with full state-by-state driveaway pricing and GFV finance data.',
      discovery_source: 'Network analysis of finance calculator widget',
      verified_date: '2026-02-19',
    },
  },
  {
    oem_id: 'suzuki-au',
    url: 'https://www.suzuki.com.au/sites/default/files/staticly/dynamic-data/dealers.json',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'dealers',
    reliability_score: 0.90,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      returns: {
        dealers: '92 dealers across all Australian states',
        fields: 'name, code, lqsDealerCode, region (Metro/Regional), location (street/suburb/state/postcode/geo), sales contact (phone/website/hours), service contact (phone/website/hours)',
      },
      note: 'Static JSON export. Nested structure: dealers[].data with sales and service sub-objects. Includes opening hours per day.',
      discovery_source: 'Network analysis of dealer locator',
      verified_date: '2026-02-19',
    },
  },
  {
    oem_id: 'suzuki-au',
    url: 'https://www.suzuki.com.au/wp-content/themes/suzuki/data/postcodes.json',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'config',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      returns: 'Complete Australian postcodes lookup (2.1MB) for dealer locator',
      note: 'Large static JSON. Used by dealer finder to map postcodes to nearest dealers.',
      discovery_source: 'Network analysis of dealer locator',
      verified_date: '2026-02-19',
    },
  },
]

const docs = `# Suzuki Australia — API Architecture

## Overview

Suzuki Australia runs a **static WordPress export on S3/CloudFront**. The site is NOT a live WordPress server — there is no WP REST API available. All data is served as static JSON files deployed alongside the HTML pages.

## Architecture

| Component | Detail |
|-----------|--------|
| Hosting | AWS S3 + CloudFront CDN |
| CMS Origin | WordPress (static export) |
| WP REST API | **Not available** (stripped from export) |
| Auth | None required for any endpoint |

## Endpoints

### 1. Finance Calculator Data — Vehicle Models & Pricing

| URL | Method | Auth |
|-----|--------|------|
| \`https://www.suzuki.com.au/suzuki-finance-calculator-data.json\` | GET | None |

**Primary data source** for vehicle information. Returns 7 models, 15 variants with comprehensive pricing.

**Response Structure:**
\`\`\`json
{
  "models": [
    {
      "model": "Swift Hybrid",
      "modelID": 10475,
      "logo": { "alt": "...", "sizes": { "default": { "src": "..." } } },
      "image": { "alt": "...", "sizes": { "default": { "src": "..." } } },
      "modelVariants": [
        {
          "variant": "Swift Hybrid GLX",
          "variantID": 10715,
          "price": {
            "ACT": { "automatic": { "price": 31490, "futureValue": [...] } },
            "NSW": { "automatic": { "price": 31490, "futureValue": [...] } },
            ...8 states
          }
        }
      ]
    }
  ]
}
\`\`\`

**Models & Variants:**

| Model | Variants | Price Range (NSW) |
|-------|----------|-------------------|
| Swift Hybrid | Swift Hybrid, Plus, GLX | $25,490 – $31,490 |
| Swift Sport | Swift Sport | $34,990 |
| Fronx Hybrid | Fronx Hybrid | $31,790 |
| Ignis | GL, GLX | $24,490 – $26,490 |
| Vitara | Turbo, Turbo ALLGRIP | $34,590 – $39,490 |
| S-CROSS | S-CROSS, ALLGRIP, ALLGRIP Prestige | $36,990 – $42,290 |
| Jimny | Lite, Jimny, XL | $36,490 – $42,990 |

**Pricing includes:**
- Per-state driveaway prices (ACT, NSW, VIC, QLD, WA, SA, TAS, NT)
- Per-transmission pricing (automatic and/or manual)
- Guaranteed Future Value (GFV) schedules for finance calculations
- GFV tables at 12/24/36/48/60 months × 10K-50K kms/year

### 2. Dealer Network

| URL | Method | Auth |
|-----|--------|------|
| \`https://www.suzuki.com.au/sites/default/files/staticly/dynamic-data/dealers.json\` | GET | None |

92 dealers across all states with sales + service contact details.

**Response Structure:**
\`\`\`json
{
  "dealers": [
    {
      "data": {
        "name": "Alan Mance Suzuki",
        "code": "VALANM01",
        "lqsDealerCode": "VALANM01",
        "region": "Metro",
        "location": { "street": "...", "suburb": "...", "state": "VIC", "postcode": "3012", "geo": { "latitude": "...", "longitude": "..." } },
        "sales": { "location": {...}, "contact": { "phone": "...", "website": "..." }, "hours": {...} },
        "service": { "location": {...}, "contact": { "phone": "...", "website": "..." }, "hours": {...} }
      }
    }
  ]
}
\`\`\`

### 3. Postcodes Lookup

| URL | Method | Auth |
|-----|--------|------|
| \`https://www.suzuki.com.au/wp-content/themes/suzuki/data/postcodes.json\` | GET | None |

2.1MB postcodes file for dealer locator mapping.

## Vehicle Data in HTML Pages

Vehicle specifications, colours, and spinner images are **embedded directly in HTML pages** as data attributes and inline styles — not served via JSON APIs. Each model page contains:
- Colour swatches with hex codes and names
- 360° spinner image URLs per colour
- Pricing in data attributes
- LQS model codes for dealer integration

## Scraping Strategy

1. **Finance calculator JSON** — Single GET for all 7 models, 15 variants, state pricing + GFV data
2. **Dealers JSON** — Single GET for all 92 dealers with locations and contacts
3. **Model pages** (HTML scraping) — For colours, specs, and images not in JSON

## Limitations

- **No WP REST API** — Static site, API discovery link stripped from headers/HTML
- **No introspection** — Static JSON files, no query parameters
- **Vehicle specs** — Only available via HTML scraping, not JSON
- **Colours** — Only in HTML pages as data attributes

## Last Verified

February 2026 — 7 models, 15 variants, 92 dealers. All JSON endpoints returning data.`

async function seed() {
  // Delete old broken Suzuki discovered APIs
  console.log('Cleaning old Suzuki discovered APIs...')
  const { data: old, error: oldErr } = await supabase
    .from('discovered_apis')
    .delete()
    .eq('oem_id', 'suzuki-au')
    .eq('status', 'discovered')
    .select('id, url')
  if (oldErr) console.error('Delete error:', oldErr.message)
  else console.log(`  Deleted ${old.length} old discovered APIs`)

  console.log(`\nInserting ${apis.length} Suzuki APIs...`)
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
    .eq('id', 'suzuki-au')
    .single()
  const config_json = { ...(existing?.config_json || {}), api_docs: docs }
  const { error: docErr } = await supabase
    .from('oems')
    .update({ config_json })
    .eq('id', 'suzuki-au')
  if (docErr) console.error('Doc error:', docErr.message)
  else console.log(`Updated docs — ${docs.length} chars`)
}

seed()
