/**
 * Seed GAC Australia discovered APIs + docs.
 * Nuxt SSR app with HmacSHA256-signed API gateway.
 * Run: node dashboard/scripts/seed-gac-apis.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const apis = [
  {
    oem_id: 'gac-au',
    url: 'https://eu-www-api.gacgroup.com/gateway/v1/www/api/showroom/vehicle/query/config-model',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      auth: 'HmacSHA256 signed request (fnc-app-id, fnc-timestamp, fnc-requestId, sig headers)',
      sign_algorithm: 'HmacSHA256 with secret "fe-official-450etarvpz"',
      sign_parts: 'Sort and join: body{JSON}, fnc-app-id{appId}, fnc-requestId{uuid}, fnc-timestamp{ms}',
      request_body: '{"vehSeriesCode":"aion-v","vehStyleCode":"2024"}',
      required_headers: {
        'fnc-app-id': 'fe-official',
        'locale': 'en',
        'region': 'AU',
      },
      returns: {
        vehicleModels: 'Array of variants with vehModelId, vehModelName, salePrice',
        configs: 'Array of spec categories (BASIC INFORMATION, EXTERIOR, INTERIOR, etc) with per-variant values',
      },
      models: {
        'aion-v': { style: '2024', variants: ['Premium ($42,590)', 'Luxury ($44,590)'], type: 'BEV' },
        'm8-phev': { style: '2024', variants: ['Premium ($76,590)', 'Luxury ($83,590)', 'Luxury Plus ($84,990)'], type: 'PHEV' },
        'emzoom': { style: '2024', variants: ['Luxury ($25,590)'], type: 'ICE' },
        'aion-ut': { style: '2025', status: 'Not yet launched in AU' },
      },
      note: 'Primary source for vehicle specs and variant pricing. Full spec comparison data per variant. Uses lowercase vehSeriesCode (aion-v, m8-phev, emzoom). Uppercase with spaces (AION V, M8 PHEV) fails.',
      discovery_source: 'Network analysis of showroom configurator',
      verified_date: '2026-03-11',
    },
  },
  {
    oem_id: 'gac-au',
    url: 'https://eu-www-api.gacgroup.com/gateway/v1/www/api/showroom/veh-model/query/priceConfigModel',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'pricing',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      auth: 'HmacSHA256 signed request',
      request_body: '{"vehSeriesCode":"m8-phev","vehStyleCode":"2024"}',
      returns: {
        vehicleModels: 'Array with id, name, vehModelCode, salePrice, sortNo, picUrlList (3-6 hero images), powerType',
        driveAwayPriceText: 'Label text',
        driveAwayContentText: 'HTML terms and conditions',
        thumbNameplateBlack: 'Model logo URL',
      },
      note: 'RRP pricing + hero images per variant. Used for variant_pricing (rrp) and product hero_image_url/gallery_urls. IDs match config-model vehModelId.',
      discovery_source: 'Network analysis of drive-away price calculator',
      verified_date: '2026-03-11',
    },
  },
  {
    oem_id: 'gac-au',
    url: 'https://eu-www-api.gacgroup.com/gateway/v1/www/api/vehicle/driveaway/price/queryDriveAwayList',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'pricing',
    reliability_score: 0.0,
    status: 'deprecated',
    schema_json: {
      auth: 'HmacSHA256 signed request',
      request_body: '{}',
      returns: {
        personalTreeList: 'Cost tree with formulas for stamp duty, registration, CTP by state',
        businessTreeList: 'Business registration cost tree',
      },
      note: 'DEPRECATED: Returns HTTP 404 as of March 2026. Previously contained state-by-state formulas for stamp duty, rego, CTP. Per-state driveaway pricing is NOT available via API — only RRP from priceConfigModel.',
      regions: 'AUS00001 (NSW), AUS00002 (VIC), AUS00003 (QLD), AUS00004 (SA), AUS00005 (WA), AUS00006 (TAS), AUS00007 (ACT), AUS00008 (NT)',
      discovery_source: 'Network analysis of drive-away calculator',
      verified_date: '2026-03-11',
      deprecated_date: '2026-03-11',
    },
  },
  {
    oem_id: 'gac-au',
    url: 'https://eu-www-api.gacgroup.com/gateway/v1/www/api/experience/config/show',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'config',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      auth: 'HmacSHA256 signed request',
      returns: {
        list: 'Array of vehicle series with vehSeriesCode, vehStyleName, vehStyleCode, vehStyleId, thumbnail images, background images',
      },
      veh_style_ids: { 10: 'AION V', 11: 'M8 PHEV', 12: 'EMZOOM', 13: 'AION UT' },
      note: 'Test drive/experience config with all available models and their hero images. Useful for discovering all models in the AU market. vehStyleId values needed for color API endpoints.',
      discovery_source: 'Network analysis of test drive booking page',
      verified_date: '2026-03-11',
    },
  },
  {
    oem_id: 'gac-au',
    url: 'https://eu-www-api.gacgroup.com/gateway/v1/www/api/showroom/vehicle/query/optional',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      auth: 'HmacSHA256 signed request',
      request_body: '{"vehStyleId":10,"opCategoryType":"color"}',
      returns: {
        list: 'Array of color options with optionalId, name, selectPicUrl (swatch), price',
      },
      note: 'Color options per model. Only works for AION V (vehStyleId=10, returns 7 colors). M8 PHEV (11) and EMZOOM (12) return 0 colors — their colors are HTML-embedded CDN URLs.',
      discovery_source: 'Network analysis of showroom configurator',
      verified_date: '2026-03-11',
    },
  },
  {
    oem_id: 'gac-au',
    url: 'https://www.gacgroup.com/en-au/{path}/_payload.json',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'page_content',
    reliability_score: 1.0,
    status: 'verified',
    schema_json: {
      auth: 'None — public endpoint, no signing required',
      url_pattern: 'https://www.gacgroup.com/en-au{path}/_payload.json',
      example: 'https://www.gacgroup.com/en-au/hatchback/aion-ut/_payload.json',
      format: 'Nuxt 3 indexed-reference payload (flat array, integers are refs)',
      returns: {
        pageData: 'rowList[] of rows, each with moduleList[] of modules, each with componentList[] of components',
        modules: {
          'M_BIGHEADER_PIC': 'Full-bleed hero (C_BIGHEADER_PIC=bg image, C_TITLE_INTRO=title/content, C_BUTTON=CTAs)',
          'M_TEXT_DISPLAY': 'Text section (C_TEXT_DISPLAY with richTextContent HTML)',
          'M_SLIDER_SELLING_POINTS': 'Scroll-pinned horizontal card scroller (C_TITLE_INTRO=intro panel, C_SELLING_POINTS_SETTING=card array)',
          'M_APP_DOWNLOAD': 'App download CTA banner',
        },
        attr_format: 'Each component has an `attr` field which is a JSON-stringified object (sometimes an array for C_BUTTON / C_SELLING_POINTS_SETTING)',
      },
      note: 'Primary page-content endpoint — use BEFORE any HTML scraping or browser rendering. Every GAC AU page path supports /_payload.json suffix. Consumed by src/design/gac-scraper.ts. Verified Apr 2026 against /hatchback/aion-ut (9 rows, 11 modules).',
      discovery_source: 'Nuxt 3 SSR payload inspection',
      verified_date: '2026-04-21',
    },
  },
  {
    oem_id: 'gac-au',
    url: 'https://eu-www-api.gacgroup.com/gateway/v1/www/api/showroom/vehicle/query/panorama',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      auth: 'HmacSHA256 signed request',
      request_body: '{"vehStyleId":10,"colorOptionalId":"{optionalId from color query}"}',
      returns: {
        list: 'Array of panorama images with picUrl and angle (degrees)',
      },
      note: 'Hero images per color per model. Use first image (angle 0) as hero_image_url. Requires optionalId from the optional query endpoint.',
      discovery_source: 'Network analysis of showroom 360 viewer',
      verified_date: '2026-03-11',
    },
  },
]

const docs = `# GAC Australia — API Architecture

## Overview

GAC Australia runs a **Nuxt 3 (Vue SSR) application** deployed on CDN with a separate API gateway. All data endpoints require **HmacSHA256 signed requests** with timestamp validation.

## Architecture

| Component | Detail |
|-----------|--------|
| Frontend | Nuxt 3 (Vue 3) SSR on CDN |
| API Gateway | \`eu-www-api.gacgroup.com\` |
| CDN (Assets) | \`eu-www-resouce-cdn.gacgroup.com\` |
| Auth | HmacSHA256 request signing |
| Region | AU (\`en-au\` locale) |

## Request Signing

All API requests must include signed headers:

| Header | Value |
|--------|-------|
| \`fnc-app-id\` | \`fe-official\` |
| \`fnc-timestamp\` | Current Unix timestamp (ms) |
| \`fnc-requestId\` | Random UUID v4 |
| \`sig\` | HmacSHA256 signature |
| \`locale\` | \`en\` |
| \`region\` | \`AU\` |

### Signature Algorithm

\`\`\`javascript
const parts = [];
// POST: add body
if (method === 'post' && body) parts.push('body' + JSON.stringify(body));
// GET: add each param
if (method === 'get' && params) Object.keys(params).forEach(k => parts.push(k + params[k]));
// Always add these
parts.push('fnc-app-id' + appId);
parts.push('fnc-requestId' + requestId);
parts.push('fnc-timestamp' + timestamp);
// Sort and sign
parts.sort();
const sig = HmacSHA256(parts.join(''), 'fe-official-450etarvpz').toUpperCase();
\`\`\`

## Endpoints

### 1. Vehicle Config & Specs

| URL | Method | Auth | Status |
|-----|--------|------|--------|
| \`/showroom/vehicle/query/config-model\` | POST | Signed | Verified |

**Request:** \`{"vehSeriesCode":"aion-v","vehStyleCode":"2024"}\`

Returns full spec comparison data with all variants and their features. Uses lowercase vehSeriesCode (aion-v, m8-phev, emzoom). Uppercase with spaces fails.

### 2. RRP Pricing & Hero Images

| URL | Method | Auth | Status |
|-----|--------|------|--------|
| \`/showroom/veh-model/query/priceConfigModel\` | POST | Signed | Verified |

**Request:** \`{"vehSeriesCode":"m8-phev","vehStyleCode":"2024"}\`

Returns RRP pricing, 3-6 hero images per variant, and drive-away T&Cs. Variant IDs match config-model vehModelId. Used for variant_pricing (rrp) and product hero_image_url/gallery_urls.

### 3. Drive-Away Calculation Rules (DEPRECATED)

| URL | Method | Auth | Status |
|-----|--------|------|--------|
| \`/vehicle/driveaway/price/queryDriveAwayList\` | POST | Signed | **404 — Deprecated** |

Returns HTTP 404 as of March 2026. Per-state driveaway pricing is NOT available via API — only RRP from priceConfigModel.

### 4. Experience/Models Config

| URL | Method | Auth | Status |
|-----|--------|------|--------|
| \`/experience/config/show\` | GET | Signed | Verified |

Returns all available models with thumbnail images, series codes, and vehStyleId values (needed for colour API).

### 5. Colour Options (per model)

| URL | Method | Auth | Status |
|-----|--------|------|--------|
| \`/showroom/vehicle/query/optional\` | POST | Signed | Verified |

**Request:** \`{"vehStyleId":10,"opCategoryType":"color"}\`

Returns colour options with optionalId, name, swatch URL. Only AION V (vehStyleId=10) returns data (7 colours). M8 PHEV (11) and EMZOOM (12) return 0 — their colours are from HTML-embedded CDN URLs.

### 6. Colour Hero Images (panorama)

| URL | Method | Auth | Status |
|-----|--------|------|--------|
| \`/showroom/vehicle/query/panorama\` | POST | Signed | Verified |

**Request:** \`{"vehStyleId":10,"colorOptionalId":"{id}"}\`

Returns hero images per colour per model. Use first image (angle 0) as hero.

## Models (AU Market — March 2026)

| Model | Series Code | vehStyleId | Year | Type | Variants | Price Range |
|-------|-------------|------------|------|------|----------|-------------|
| AION V | aion-v | 10 | 2024 | BEV | Premium, Luxury | $42,590 – $44,590 |
| M8 PHEV | m8-phev | 11 | 2024 | PHEV | Premium, Luxury, Luxury Plus | $76,590 – $84,990 |
| EMZOOM | emzoom | 12 | 2024 | ICE | Luxury | $25,590 |
| AION UT | aion-ut | 13 | 2025 | BEV | Coming soon | TBA |

## Data Pipeline

| Table | Source | Script |
|-------|--------|--------|
| vehicle_models | config-model | seed-gac-products.mjs |
| products | config-model | seed-gac-products.mjs |
| variant_pricing | priceConfigModel (rrp) | seed-gac-products.mjs |
| variant_colors | optional + panorama API (AION V), CDN URLs (EMZOOM, M8 PHEV) | seed-gac-colors.mjs |
| discovered_apis | Manual | seed-gac-apis.mjs |

## Website URLs

| Model | URL |
|-------|-----|
| AION V | \`/en-au/suv/aion-v\` |
| M8 PHEV | \`/en-au/mpv/gac-m8-phev\` |
| EMZOOM | \`/en-au/suv/gac-emzoom\` |
| AION UT | \`/en-au/hatchback/aion-ut\` |

## Colour Data

### API Colours (AION V only)
- 7 colours from optional API with swatch + panorama hero images
- Arctic White is standard (free), others AUD $600 surcharge

### HTML-Embedded CDN Colours
- **EMZOOM**: 7 colours (White, Silver, Light Grey, Graphene Grey, Black, Galaxy Lilac, Red) — $600 surcharge
- **M8 PHEV**: 2 colours (White, Black) — $1,200 surcharge
- CDN base: \`eu-www-resouce-cdn.gacgroup.com/static/AU/tenant/cms/common\`

## Limitations

- **Signed requests required** — Cannot use simple GET/POST, must compute HmacSHA256
- **Timestamp validation** — Signatures expire quickly (within minutes)
- **Driveaway API deprecated** — Returns 404, only RRP available
- **Colour API partial** — Only AION V returns colours from API, others require HTML scraping
- **AION UT** — Not yet launched, config-model API returns "Model year data does not exist"
- **vehSeriesCode casing** — Must use lowercase slugs (aion-v, m8-phev, emzoom). Uppercase with spaces fails.

## Last Verified

March 2026 — 3 active models, 6 variants, 6 variant_pricing (rrp), 27 variant_colors. AION UT announced but not yet available.`

async function seed() {
  // Delete old GAC discovered APIs
  console.log('Cleaning old GAC discovered APIs...')
  const { data: old, error: oldErr } = await supabase
    .from('discovered_apis')
    .delete()
    .eq('oem_id', 'gac-au')
    .select('id, url')
  if (oldErr) console.error('Delete error:', oldErr.message)
  else console.log(`  Deleted ${old?.length || 0} old discovered APIs`)

  console.log(`\nInserting ${apis.length} GAC APIs...`)
  const { data, error } = await supabase
    .from('discovered_apis')
    .upsert(apis, { onConflict: 'oem_id,url', ignoreDuplicates: false })
    .select('id, oem_id, url, status')
  if (error) { console.error('API Error:', error.message); process.exit(1) }
  console.log(`Upserted ${data.length} APIs`)
  data.forEach(d => console.log(`  [${d.status}] ${d.url}`))

  // Update docs on OEM record
  const { data: existing } = await supabase
    .from('oems')
    .select('config_json')
    .eq('id', 'gac-au')
    .single()
  const config_json = { ...(existing?.config_json || {}), api_docs: docs }
  const { error: docErr } = await supabase
    .from('oems')
    .update({ config_json })
    .eq('id', 'gac-au')
  if (docErr) console.error('Doc error:', docErr.message)
  else console.log(`Updated docs — ${docs.length} chars`)
}

seed()
