/**
 * Seed Nissan Australia discovered APIs + comprehensive docs.
 * Multi-API architecture: GraphQL, Choices/Apigee, Finance Calculator, CMS Build, Helios Media
 * Run: node dashboard/scripts/seed-nissan-apis.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const apis = [
  // 1. Apigee Gateway — Models + Choices + Pricing
  {
    oem_id: 'nissan-au',
    url: 'https://ap.nissan-api.net/v2',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'pricing',
    reliability_score: 0.90,
    status: 'verified',
    schema_json: {
      auth: {
        type: 'OAuth + API keys',
        public_token_url: 'GET /v2/publicAccessToken?locale=en_AU&scope=READ&proxy=*&brand=nissan&environment=prod',
        public_token_headers: { Origin: 'https://www.nissan.com.au' },
        request_headers: {
          apiKey: 'A2X4O66rkJotaSQsTDLlXb9keGbVyN8Y',
          clientKey: 'h84dIG2S17QNq6j9fgvv6t3KXBQRJJts',
          accesstoken: 'Bearer {token from publicAccessToken}',
          Origin: 'https://www.nissan.com.au',
        },
      },
      endpoints: {
        models: {
          path: '/v2/models',
          method: 'GET',
          auth: 'apiKey + clientKey + accesstoken',
          returns: '21 models with modelCode, name, year, configurator URL, dataPath',
          status: 'verified-working',
        },
        configuration: {
          path: '/v2/models/{modelCode}/configuration/{configCode}:A',
          method: 'GET',
          auth: 'apiKey + clientKey + accesstoken',
          returns: 'configurationURI, modelSpecCode',
          status: 'verified-working',
        },
        choices: {
          path: '/v2/models/{modelCode}/configuration/{configCode}:A/choices',
          method: 'GET',
          auth: 'apiKey + clientKey + accesstoken',
          params: 'filterByChoiceIDs={choiceIDs}&priceType=retail&priceMethod=driveaway',
          returns: 'Grade/version choices with retail and driveaway pricing',
          status: 'requires-browser-session-choice-ids',
          note: 'filterByChoiceIDs must come from configurator session — empty value returns 404',
        },
        prices: {
          path: '/v2/models/{modelCode}/prices/{priceCode}',
          method: 'GET',
          auth: 'apiKey + clientKey + accesstoken',
          returns: 'Model pricing by price code (Retail, driveaway)',
          status: 'returns-404-for-retail',
        },
        gradeWalk: {
          path: '/v2/models/{modelCode}/configuration/{configCode}:A/gradeWalk',
          method: 'GET',
          returns: 'Grade walk data for configurator',
          status: 'blocked-by-fingerprint-js',
        },
      },
      note: 'Nissan Apigee gateway. /v2/models is the primary source for model registry. Choices API is the primary pricing source but needs browser-session choice IDs. Some endpoints behind FingerprintJS bot protection.',
      discovery_source: 'Network analysis of nissan.com.au configurator',
      verified_date: '2026-02-19',
    },
  },
  // 2. GraphQL — Configurator data
  {
    oem_id: 'nissan-au',
    url: 'https://gq-apn-prod.nissanpace.com/graphql',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      auth: {
        type: 'AWS Cognito JWT OR x-api-key',
        cognito: {
          note: 'JWT from browser session. Username: nissan_live_au_pacepublisher, group: configurator',
          header: 'Authorization: Bearer {jwt}',
          expires: 'Short-lived — must capture from browser',
        },
        api_key: {
          header: 'x-api-key: da2-nwmjdvbxfvbwhmtqpukluhmnva',
          note: 'May require specific origin/referer. Returns Unauthorized for some queries.',
        },
      },
      queries: {
        getConfiguratorInformation: {
          variables: {
            language: 'EN',
            market: 'AU',
            modelHash: '{configCode from Apigee}',
            configurationHash: '{from configurator session}',
            location: '{postcode e.g. 3122}',
          },
          operations: [
            'GetSummaryInformation',
            'GetInteriorInformation',
            'GetExteriorInformation',
            'GetPacksAndOptionsInformation',
          ],
          returns: 'Full configurator data: exterior/interior details, pricing, EIM codes, packs & options',
          status: 'requires-cognito-jwt',
        },
      },
      type_fields: {
        ConfiguratorData: [
          'configuratorHeaders', 'obsoleteConfigDetails', 'modelPreviewImageDetails',
          'exteriorDetails', 'interiorColorDetails', 'packsAndOptionsDetails',
          'stickyPriceBarDetails', 'carSummaryDetails', 'warrantiesAndServicesDetails',
          'nextConfigurations', 'showroomDetails', 'overlayDetails',
        ],
        Model: [
          'modelName', 'modelCodeYearListing', 'programCode', 'phase',
          'modelKind', 'startingPrice', 'stickyPriceBarDetails',
        ],
      },
      introspection: 'Enabled — full schema discovery via __type and __schema queries',
      models_with_configurator: ['ariya', 'navara', 'x-trail', 'pathfinder', 'patrol', 'Z'],
      models_without_configurator: ['juke', 'qashqai'],
      note: 'AWS AppSync GraphQL. Introspection enabled. Needs Cognito JWT for data queries. Best for EIM codes and detailed configurator data.',
      discovery_source: 'Network analysis + GraphQL introspection',
      verified_date: '2026-02-19',
    },
  },
  // 3. Helios Media Server — 360° images
  {
    oem_id: 'nissan-au',
    url: 'https://ms-prd.apn.mediaserver.heliosnissan.net/iris/iris',
    method: 'GET',
    content_type: 'image/png',
    response_type: 'binary',
    data_type: 'other',
    reliability_score: 0.90,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      url_pattern: '/iris/iris?client=nissan-au&brand=nissan&vehicle={vehicleCode}&angle={0-24}&sa={saCode}',
      eim_to_sa_decoding: {
        note: 'EIM codes from GraphQL must be decoded to SA codes for Helios',
        algorithm: 'Split EIM by / → each segment is a feature choice → map to SA code',
        example: 'EIM: GAT/KH3/G → SA codes for body, colour, grade',
      },
      vehicle_codes: {
        ariya: 'FE0-B', patrol: 'Y62-A', pathfinder: 'R53-A',
        navara: 'D23-C', 'x-trail': 'T33-B', Z: 'RZ34',
      },
      angles: '0-24 for 360° rotation (15° increments)',
      note: 'Public image CDN. No auth. Returns PNG images. Needs SA code from EIM-to-SA decoding.',
      discovery_source: 'Network analysis of configurator 360° viewer',
      verified_date: '2026-02-19',
    },
  },
  // 4. Finance Calculator API
  {
    oem_id: 'nissan-au',
    url: 'https://ap.nissan-api.net/v2/finance/models/financeCalc',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'pricing',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      auth: {
        type: 'OAuth Bearer token',
        token_source: '/v2/publicAccessToken (same as Choices API)',
        header: 'accesstoken: Bearer {token}',
      },
      request_body: {
        vehicleInfo: {
          modelCode: '{modelCode}',
          gradeId: '{modelCode}-{gradeName}',
          versionId: '{versionCode}',
          purchasePrice: '{price from Choices API}',
        },
        deposit: 0,
        balloon: 0,
        term: 60,
        frequency: 'monthly',
        annualKms: 15000,
      },
      returns: 'Finance repayment calculations: monthly/fortnightly/weekly payments, interest rate, comparison rate',
      finance_slugs: {
        ariya: 'ariya', juke: 'juke', navara: 'navara', 'x-trail': 'x-trail',
        'new-x-trail': 'new-x-trail', pathfinder: 'pathfinder', patrol: 'patrol',
        qashqai: 'qashqai', Z: 'z', 'all-new-navara': 'all-new-navara',
      },
      note: 'Finance calculator. Needs vehicle purchase price from Choices API. Returns loan repayment breakdowns.',
      discovery_source: 'Network analysis of finance calculator widget',
      verified_date: '2026-02-19',
    },
  },
  // 5. CMS Build API (AEM)
  {
    oem_id: 'nissan-au',
    url: 'https://www.nissan.com.au/content/nissan_prod/en_AU/index/vehicles/browse-range',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'config',
    reliability_score: 0.70,
    status: 'verified',
    schema_json: {
      auth: 'None required',
      url_patterns: {
        build_price_entry: '/content/nissan_prod/en_AU/index/vehicles/browse-range/{slug}/dam/jcr:content/root/buildpriceentry.buildPriceEntry.json',
        finance_calculator: '/content/nissan_prod/en_AU/index/vehicles/browse-range/{slug}/dam/jcr:content/root/financecalculator.finance_calculator.json',
        vehicle360_images: '/content/nissan_prod/en_AU/index/vehicles/browse-range/{slug}/jcr:content/root/.../vehicle360_*.vehicle360_images.json',
      },
      returns: 'Grade listings, build-and-price entry data, finance calculator config, 360° image paths',
      status: 'endpoints-intermittent-404-502',
      note: 'AEM (Adobe Experience Manager) CMS content APIs. Path structure varies by model. Some endpoints return 404/502 intermittently. Useful for grade listings and build-price-entry config when available.',
      discovery_source: 'AEM path pattern analysis',
      verified_date: '2026-02-19',
    },
  },
]

const docs = `# Nissan Australia — API Architecture

## Overview

Nissan Australia uses a **multi-API architecture** with 4 primary data sources. The system is significantly more complex than most OEMs, requiring multiple auth methods and API coordination.

## Architecture Summary

| API | URL | Auth | Primary Use |
|-----|-----|------|-------------|
| Apigee Gateway | ap.nissan-api.net/v2 | OAuth + apiKey + clientKey | Model registry, Choices pricing |
| GraphQL | gq-apn-prod.nissanpace.com/graphql | Cognito JWT or x-api-key | Configurator data, EIM codes |
| Finance Calculator | ap.nissan-api.net/v2/finance | OAuth Bearer | Repayment calculations |
| CMS Build (AEM) | nissan.com.au/content/... | None | Grade listings, config |
| Helios Media | ms-prd.apn.mediaserver.heliosnissan.net | None | 360° vehicle images |

## 1. Apigee Gateway (Primary)

### Authentication

\`\`\`
# Step 1: Get public access token
GET https://ap.nissan-api.net/v2/publicAccessToken?locale=en_AU&scope=READ&proxy=*&brand=nissan&environment=prod
Headers: Origin: https://www.nissan.com.au
Returns: { "access_token": "DJQ1l27VJpiht2MfAa28CjzqApwu" }

# Step 2: Use token + API keys for all requests
Headers:
  apiKey: A2X4O66rkJotaSQsTDLlXb9keGbVyN8Y
  clientKey: h84dIG2S17QNq6j9fgvv6t3KXBQRJJts
  accesstoken: Bearer {access_token}
  Origin: https://www.nissan.com.au
\`\`\`

### Endpoints

#### GET /v2/models — Model Registry (VERIFIED WORKING)
Returns all 21 models (current + legacy) with modelCode, name, year, configurator URL.

\`\`\`json
{
  "models": [
    {
      "modelCode": "30170",
      "dataPath": "/product/model/30170/patrol",
      "configurator": "https://c2gweb.heliosnissan.net/nissan-au/c/BAHv/A?v=2",
      "basicModelInformation": { "name": "Patrol", "year": "2025" },
      "versions": { "versions": [] },
      "defaultSpecs": [],
      "extendedAvailable": false
    }
  ]
}
\`\`\`

#### GET /v2/models/{modelCode}/configuration/{configCode}:A — Config Lookup (VERIFIED)
Returns configurationURI and modelSpecCode.

#### GET /v2/models/{modelCode}/configuration/{configCode}:A/choices — Pricing (REQUIRES BROWSER SESSION)
**Primary pricing source.** Needs filterByChoiceIDs from configurator session.
Required params: \`filterByChoiceIDs={ids}&priceType=retail&priceMethod=driveaway\`

### Pricing Hierarchy
1. **Choices API** — Best: grade-level driveaway pricing per postcode
2. **GraphQL MLP** — Good: Manufacturer List Price from configurator
3. **Finance Calculator** — Fallback: purchase price used for finance calc

## 2. GraphQL API

### Authentication
- **Cognito JWT** (browser-captured): \`Authorization: Bearer {jwt}\`
  - Username: \`nissan_live_au_pacepublisher\`, group: \`configurator\`
  - Short-lived, must capture from browser session
- **API Key** (static): \`x-api-key: da2-nwmjdvbxfvbwhmtqpukluhmnva\`
  - May return Unauthorized for some queries

### Available Queries
- \`getConfiguratorInformation\` — Full configurator data (exterior, interior, pricing, EIM codes)
- \`getAfterSalesInventoryWithFiltersPaginated\` — After-sales inventory (different auth scope)
- \`getDistinctModelsForAfterSales\` — After-sales models (different auth scope)

### ConfiguratorData Fields
\`configuratorHeaders\`, \`exteriorDetails\`, \`interiorColorDetails\`, \`packsAndOptionsDetails\`, \`stickyPriceBarDetails\`, \`carSummaryDetails\`, \`warrantiesAndServicesDetails\`, \`nextConfigurations\`, \`showroomDetails\`, \`overlayDetails\`

### Introspection
Fully enabled. Use \`__type(name: "ConfiguratorData")\` or \`__schema\` queries.

## 3. Helios Media Server

### 360° Images (NO AUTH)
\`\`\`
https://ms-prd.apn.mediaserver.heliosnissan.net/iris/iris?client=nissan-au&brand=nissan&vehicle={vehicleCode}&angle={0-24}&sa={saCode}
\`\`\`

**Vehicle Codes:** ariya=FE0-B, patrol=Y62-A, pathfinder=R53-A, navara=D23-C, x-trail=T33-B, Z=RZ34

**EIM-to-SA Decoding:** EIM codes from GraphQL must be decoded to SA codes. Split EIM by \`/\` → each segment maps to a feature choice → concatenate SA codes.

## Model Registry

| Model | Code | Config | Year | Configurator | Browse Range |
|-------|------|--------|------|-------------|-------------|
| Ariya | 30179 | BAHj | 2025 | Yes | Yes |
| Juke | 30304 | BAHx | 2025 | Yes | Yes |
| Navara (MY25) | 29299 | BAHo | 2021 | Yes | Yes |
| X-Trail (MY25) | 30145 | BAG_ | 2025 | Yes | Yes |
| New X-Trail (MY26) | 70049 | BAHt | 2026 | Yes | Yes |
| Pathfinder | 29652 | BAHy | 2022 | Yes | Yes |
| Patrol | 30170 | BAHv | 2025 | Yes | Yes |
| Qashqai | 30128 | BAHi | 2025 | Yes | Yes |
| Z | 30273 | BAG- | 2025 | Yes | Yes |
| All-New Navara (MY26) | 30316 | BAHu | 2026 | Yes | Yes (as Navara) |

**Note:** Config codes above are from Apigee \`/v2/models\` response (configurator URL path). 21 total models in Apigee including legacy model years.

## Known Issues

- **X-Trail 30145**: Finance calc returns 502 intermittently
- **Pathfinder**: Has shown $0 pricing in Choices API historically
- **CMS Build API**: Endpoints intermittently 404/502 across all models
- **Choices API**: Requires browser-session choice IDs — empty filterByChoiceIDs returns 404
- **GraphQL x-api-key**: Returns Unauthorized for getConfiguratorInformation — may need specific headers
- **Some Apigee endpoints** (gradeWalk, versions, prices): Behind FingerprintJS bot protection

## Scraping Strategy

### Recommended Pipeline
1. **\`/v2/models\`** — Model registry with codes and configurator URLs (public, always works)
2. **Choices API** — Grade/version pricing (needs browser session for choice IDs)
3. **GraphQL** — Detailed configurator data, EIM codes (needs Cognito JWT)
4. **Finance Calculator** — Repayment calculations (needs purchase price from step 2)
5. **Helios Media** — 360° images (public, needs SA codes from step 3)

### Auth Token Strategy
- Apigee: publicAccessToken is stable, apiKey/clientKey are static
- GraphQL Cognito JWT: Must be captured from browser — use CDP/Playwright to intercept
- CMS/Helios: No auth needed

## Last Verified
February 2026 — 21 models in Apigee, 9 on browse-range page. /v2/models and configuration endpoints working. Choices API needs browser session. GraphQL introspection confirmed.`

async function seed() {
  // 1. Delete old discovered AEM image APIs
  console.log('Cleaning old Nissan discovered APIs...')
  const { data: old, error: oldErr } = await supabase
    .from('discovered_apis')
    .delete()
    .eq('oem_id', 'nissan-au')
    .eq('status', 'discovered')
    .select('id, url')
  if (oldErr) console.error('Delete error:', oldErr.message)
  else console.log(`  Deleted ${old.length} old discovered APIs`)

  // 2. Upsert verified APIs
  console.log(`\nInserting ${apis.length} Nissan APIs...`)
  const { data, error } = await supabase
    .from('discovered_apis')
    .upsert(apis, { onConflict: 'oem_id,url', ignoreDuplicates: false })
    .select('id, oem_id, url, status, reliability_score')
  if (error) { console.error('API Error:', error.message); process.exit(1) }
  console.log(`Upserted ${data.length} APIs`)
  data.forEach(d => console.log(`  [${d.status} ${d.reliability_score}] ${d.url}`))

  // 3. Update API docs on OEM record
  const { data: existing } = await supabase
    .from('oems')
    .select('config_json')
    .eq('id', 'nissan-au')
    .single()
  const config_json = { ...(existing?.config_json || {}), api_docs: docs }
  const { error: docErr } = await supabase
    .from('oems')
    .update({ config_json })
    .eq('id', 'nissan-au')
  if (docErr) console.error('Doc error:', docErr.message)
  else console.log(`\nUpdated docs — ${docs.length} chars`)
}

seed()
