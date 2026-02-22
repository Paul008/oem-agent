/**
 * Seed Mazda Australia discovered APIs from geelong-mazda theme source code.
 * Run: node dashboard/scripts/seed-mazda-apis.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const apis = [
  {
    oem_id: 'mazda-au',
    url: 'https://www.mazda.com.au/build/{model}',
    method: 'GET',
    content_type: 'text/html',
    response_type: 'html',
    data_type: 'products',
    reliability_score: 0.9,
    status: 'verified',
    schema_json: {
      params: { model: 'mazda2 | mazda3 | cx-3 | cx-5 | cx-8 | cx-9 | cx-60 | cx-70 | cx-80 | cx-90 | mx-5 | bt-50 | mz-6' },
      returns: ['BuildMyMazda_config', 'variants', 'colours', 'pricing', 'specifications', 'images', 'accessories'],
      extraction: 'Parse HTML → find <script> with ReactDOM.hydrate → extract JSON blob starting with {"components":[{"name":"BuildMyMazda"',
      note: 'SSR React page. Full configurator data embedded in hydration script tag as JSON props. Returns HTTP 200 with User-Agent header. Relative image paths need mazda.com.au prefix.',
      discovery_source: 'geelong-mazda/src/functions/mazda-api.js',
      verified_date: '2026-02-19',
    },
  },
  {
    oem_id: 'mazda-au',
    url: 'https://www.mazda.com.au/offers/',
    method: 'GET',
    content_type: 'text/html',
    response_type: 'html',
    data_type: 'offers',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      params: { dealersession: '1', dealerCode: 'Dealer code e.g. G332662' },
      returns: ['offer_cards', 'pricing', 'disclaimers', 'images'],
      extraction: 'HTML scraping via Cheerio. Offers in .main-content section.',
      note: 'Dealer-specific offers page. Can filter by dealerCode param. HTML needs URL fixup for relative paths.',
      discovery_source: 'geelong-mazda/src/functions/fetch-mazda-offers.js',
      verified_date: '2026-02-19',
    },
  },
]

// Also add Mazda docs
const mazda_docs = `# Mazda Australia — API Architecture

## Overview

Mazda uses a **Server-Side Rendered React application** — there is no dedicated API. Vehicle data is embedded as JSON props inside hydration script tags on the "Build My Mazda" configurator pages.

## Endpoints

| Endpoint | Method | Returns |
|----------|--------|---------|
| \`mazda.com.au/build/{model}\` | GET | Full configurator data as embedded JSON in SSR React |
| \`mazda.com.au/offers/?dealerCode={code}\` | GET | Dealer-specific offers page (HTML scraping) |

## Build Page Data Extraction

The build page is a React SSR application. The vehicle data is embedded in a \`<script>\` tag containing \`ReactDOM.hydrate\`:

\`\`\`
1. GET https://www.mazda.com.au/build/{model}
2. Parse HTML with Cheerio
3. Find <script> containing 'ReactDOM.hydrate'
4. Extract JSON starting from: {"components":[{"name":"BuildMyMazda"
5. Parse until matching closing brace before document.getElementById
6. Result: Full BuildMyMazda component props
\`\`\`

### Data Structure
The extracted JSON contains the complete \`BuildMyMazda\` component configuration:
- All variant/grade options
- Colour palettes with swatches
- Pricing (RRP and driveaway)
- Specifications per variant
- Accessory packages
- Image URLs (relative — need \`https://www.mazda.com.au\` prefix)

### Models Available
mazda2, mazda3, cx-3, cx-5, cx-8, cx-9, cx-60, cx-70, cx-80, cx-90, mx-5, bt-50, mz-6

## Offers Page

\`mazda.com.au/offers/?dealersession=1&dealerCode={code}\` returns dealer-specific offers as HTML.

**Extraction:** Cheerio scraping of \`.main-content\` section. Requires:
- URL fixup for relative paths (prefix with mazda.com.au)
- Removal of loading layer elements (\`._LoadingLayer_bcd6e\`)
- Image URL cleanup (remove blur/quality params)

## Access Notes

- **No WAF blocking** — Returns HTTP 200 with a standard User-Agent header
- **Caching** — 1-hour cache TTL recommended (NodeCache in source)
- **Bearer Token** — Production endpoint uses a Bearer token in Authorization header
- **Image paths** — All relative, need \`https://www.mazda.com.au\` prefix. Handles protocol-relative URLs too.

## Data Flow Diagram

\`\`\`
┌──────────────────────┐
│  mazda.com.au        │
│  (React SSR / Next)  │
└──────┬───────────────┘
       │
  ┌────┼──────────┐
  │               │
┌─▼────────┐ ┌───▼──────┐
│ /build/  │ │ /offers/ │
│ {model}  │ │ ?dealer  │
│          │ │ Code=... │
│ React    │ │          │
│ hydrate  │ │ HTML     │
│ JSON     │ │ scrape   │
└──────────┘ └──────────┘
     │              │
     ▼              ▼
  Parse          Cheerio
  script         extract
  tag            offers
     │              │
     ▼              ▼
 BuildMyMazda   Offer cards
 full config    with pricing
\`\`\`

## Last Verified
February 2026 — Build page returns HTTP 200. Offers page accessible.`

async function seed() {
  console.log('Inserting Mazda APIs...')
  const { data, error } = await supabase
    .from('discovered_apis')
    .upsert(apis, { onConflict: 'oem_id,url', ignoreDuplicates: false })
    .select('id, oem_id, url')

  if (error) {
    console.error('API Error:', error.message)
    process.exit(1)
  }
  console.log(`Upserted ${data.length} Mazda APIs`)
  data.forEach(d => console.log(`  ${d.url}`))

  // Update docs
  const { data: existing } = await supabase
    .from('oems')
    .select('config_json')
    .eq('id', 'mazda-au')
    .single()

  const config_json = { ...(existing?.config_json || {}), api_docs: mazda_docs }
  const { error: docErr } = await supabase
    .from('oems')
    .update({ config_json })
    .eq('id', 'mazda-au')

  if (docErr) console.error('Doc error:', docErr.message)
  else console.log(`Updated mazda-au docs — ${mazda_docs.length} chars`)
}

seed()
