/**
 * Seed OEM API architecture documentation into oems.config_json.api_docs
 * Run: node dashboard/scripts/seed-oem-docs.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const docs = {
  'isuzu-au': `# Isuzu UTE Australia — API Architecture

## Overview

Isuzu operates a **Sitecore-backed API layer** at \`isuzuute.com.au/isuzuapi/\` with three main API families, plus a **BunnyNet CDN** layer for static data distribution. The OEM APIs are WAF-protected (Azure Front Door) and only accessible from browser sessions on the Isuzu domain.

## API Families

### 1. Build & Quote API
**Base:** \`/isuzuapi/BuildandQuote/\`

The configurator pipeline. Three endpoints form a sequential flow:

\`\`\`
GetInitialData?carType={d-max|mu-x}
    → User selects grade, cab, drivetrain
        → GetCarColours?carName={variant}
            → User picks colour + accessories
                → GetSummaryCost?carName=...&colour=...&accessories=...
\`\`\`

- **GetInitialData** — Returns all available grades, cab styles, drivetrains for a vehicle type. Entry point for the build tool.
- **GetCarColours** — Returns colour swatches, hex codes, pricing delta per colour for a specific variant name.
- **GetSummaryCost** — Calculates total driveaway price including base vehicle, colour premium, and selected accessories.

### 2. Compare API
**Base:** \`/isuzuapi/CompareAPI/\`

Grade-level specs and comparison data. Uses Sitecore \`dataSourceId\` GUIDs to select the dataset:

| Vehicle | dataSourceId |
|---------|-------------|
| **D-MAX** | \`{81CA9928-D04D-49F8-A264-48A6F77D7072}\` |
| **MU-X** | \`{AF3B74E8-F4F4-4DE7-A58C-2BE6B1227E84}\` |

**GetCompareModelData** returns:
- All grades with full specifications
- Feature-by-feature comparison matrix
- Engine, safety, comfort, technology specs per grade
- Used for the "Compare Grades" feature on the website

### 3. Range API
**Base:** \`/isuzuapi/RangeAPI/\`

Pricing and availability data per model range. Also uses Sitecore dataSourceId GUIDs:

| Vehicle | dataSourceId |
|---------|-------------|
| **D-MAX** | \`{58ED1496-0A3E-4C26-84B5-4A9A766BF139}\` |
| **MU-X** | \`{C91E66BB-1837-4DA2-AB7F-D0041C9384D7}\` |

**GetRangeData** returns:
- All variants in the range with pricing
- Cab style, drivetrain, grade combinations
- Availability status per variant
- Used for the "Range" pricing grid pages

## CDN Layer (BunnyNet)

**Base:** \`isuzuute.b-cdn.net\`

Publicly accessible static JSON files cached on BunnyNet CDN:

| Endpoint | Returns |
|----------|---------|
| \`/data/models.json\` | Model index — D-MAX & MU-X with images, brochure PDFs, spec sheets, segment data |
| \`/data/{slug}.json\` | Per-page content for any OEM page slug |

## Data Flow Diagram

\`\`\`
                    ┌─────────────────────┐
                    │  isuzuute.com.au     │
                    │  (Sitecore CMS)      │
                    └──────┬──────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌────▼────┐
        │ Build &    │ │Compare │ │ Range   │
        │ Quote API  │ │ API    │ │ API     │
        │            │ │        │ │         │
        │ InitData   │ │ D-MAX  │ │ D-MAX   │
        │ Colours    │ │ MU-X   │ │ MU-X    │
        │ Summary    │ │ grades │ │ pricing │
        └────────────┘ └────────┘ └─────────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼──────┐
                    │ Azure WAF   │
                    │ (Front Door)│
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │                         │
      ┌───────▼──────┐        ┌────────▼────────┐
      │ Browser only │        │ BunnyNet CDN    │
      │ (WAF-blocked │        │ (public access) │
      │  externally) │        │ models.json     │
      └──────────────┘        │ {slug}.json     │
                              └─────────────────┘
\`\`\`

## Access Notes

- **WAF Protection**: All \`/isuzuapi/\` endpoints return 403 when called from outside the Isuzu domain. They require a browser session with valid cookies/referrer on isuzuute.com.au.
- **CDN Endpoints**: Publicly accessible, no auth required. Good for initial data scraping.
- **Image CDN**: Vehicle images served from \`isuzuute.b-cdn.net/files/\` with direct PNG/WebP URLs.
- **Brochures/Specs**: PDF files on the CDN, linked from models.json.

## Scraping Strategy

1. **CDN First** — Pull models.json for the model index, brochure links, and image URLs
2. **Browser Rendering** — Use Puppeteer/Playwright on isuzuute.com.au to access the Sitecore APIs through the WAF
3. **Compare + Range** — Hit both CompareAPI dataSourceIds to get all grades/specs, and both RangeAPI dataSourceIds for pricing
4. **Build & Quote** — Iterate through GetInitialData → GetCarColours per variant for complete colour data

## Last Verified
February 2026 — CDN endpoints live, OEM APIs confirmed via source code analysis of isuzu-ute-theme-new.`,

  'subaru-au': `# Subaru Australia — API Architecture

## Overview

Subaru provides a **dedicated RESTful Retailer API** — the most developer-friendly API of all Australian OEMs. It's a proper REST service hosted on AWS API Gateway with versioned endpoints, Swagger documentation, and API key authentication.

## Authentication

| Header | Value |
|--------|-------|
| \`x-api-key\` | Required for production. Staging is open. |

**Production Base:** \`https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api\`
**Staging Base:** \`https://qhb9js3405.execute-api.ap-southeast-2.amazonaws.com/staging/api\`
**Swagger:** \`https://qhb9js3405.execute-api.ap-southeast-2.amazonaws.com/staging/swagger/\`

## Endpoint Map

### Vehicle Data

| Endpoint | Returns |
|----------|---------|
| \`GET /v1/models\` | All models with variant summaries, colours, pricing |
| \`GET /v1/models/{id}\` | Single model detail |
| \`GET /v1/models/{modelId}/variants\` | All variants for a model |
| \`GET /v1/variants/{id}\` | Full variant detail — colours, interiors, capped service, key features |
| \`GET /v1/variants/{id}/specs\` | Grouped specifications (Engine, Transmission, Safety, etc.) |
| \`GET /v1/variants/{id}/accessories\` | Genuine accessories with pricing, images, item codes |

### Offers

| Endpoint | Returns |
|----------|---------|
| \`GET /v1/offers\` | All current offers (national + regional) |
| \`GET /v1/offers/{region}\` | Regional offers — regional first by displayOrder, then national |
| \`GET /v1/offers/{id}\` | Single offer with full content tree |
| \`GET /v1/regions\` | Available regions list |

### Regions
\`BRISBANE\` · \`CENTRAL\` · \`EASTERN\` · \`MELBOURNE\` · \`NORTHERN\` · \`SOUTHERN\` · \`SYDNEY\` · \`TASMANIA\` · \`WESTERN\`

## Data Model

### Models → Variants (Hierarchical)

\`\`\`
Model (e.g. Forester 2026)
  └── Variant (e.g. Forester AWD 2.5i)
        ├── colourOptions[] — hex codes, front/rear/hi-res images per colour, price delta
        ├── interiorOptions[]
        ├── cappedService{}
        ├── servicePlan{}
        ├── keyFeatures[]
        ├── specs (separate endpoint) — grouped by category
        └── accessories (separate endpoint) — with pricing, images, item codes
\`\`\`

### Variant Fields
Each variant includes: \`manufacturersListPrice\`, \`bodyStyle\`, \`transmission\`, \`fuel\`, \`engineCapacity\`, \`cylinders\`, \`cO2\`, \`tareWeight\`, \`combFuelCycle\`, \`isHybrid\`, \`isElectric\`, \`redbookCode\`, \`nvicCode\`, \`fhiCode\`, \`performanceRating\`, \`gvr\`.

### Offer Content Model
Offers use a recursive content tree:
\`\`\`
Offer
  ├── featuredMedia (hero image)
  ├── featuredContent (blurb)
  ├── mediaGallery[] (multiple images)
  ├── content[] — each node has:
  │     ├── type: paragraph | list | list_item | disclaimer
  │     ├── attributes[]: text, link, target
  │     └── children[] (recursive)
  ├── sash{} (optional banner styling — colour, backgroundColour)
  ├── regions[] (with per-region displayOrder)
  └── categories[], tags[], startDate, expiryDate, price
\`\`\`

## Image CDN

**Base:** \`cdn-image-handler.oem-production.subaru.com.au\`

All image URLs from the API support dynamic parameters:

| Param | Values | Example |
|-------|--------|---------|
| \`pxc_width\` | pixels | \`pxc_width=640\` |
| \`pxc_height\` | pixels | \`pxc_height=480\` |
| \`pxc_size\` | \`w,h\` or \`s:factor\` | \`pxc_size=640,480\` or \`pxc_size=s:1.5\` |
| \`pxc_method\` | crop, fit, fitfill, limit, limitfill | \`pxc_method=fitfill\` |
| \`pxc_bgcolor\` | hex RGB | \`pxc_bgcolor=ffffff\` |

## Data Flow Diagram

\`\`\`
┌──────────────────────────┐
│   AWS API Gateway        │
│   (ap-southeast-2)       │
│                          │
│   x-api-key auth         │
│   Production / Staging   │
└──────────┬───────────────┘
           │
    ┌──────┼──────────────────┐
    │      │                  │
┌───▼──┐ ┌▼──────┐ ┌─────────▼──────┐
│Models│ │Offers │ │ Regions        │
│      │ │       │ │ (9 AU regions) │
│ List │ │ All   │ └────────────────┘
│ By ID│ │Region │
└──┬───┘ │By ID  │
   │     └───────┘
   │
┌──▼───────────┐
│ Variants     │
│              │
│ Detail       │
│ /specs       │
│ /accessories │
└──────────────┘
       │
┌──────▼─────────────────────┐
│ CDN Image Handler          │
│ (pxc_width, pxc_method...) │
│ Front/Rear/Side/HiRes      │
│ per colour per variant     │
└────────────────────────────┘
\`\`\`

## Scraping Strategy

1. **GET /v1/models** — Get full model list with all variant summaries in one call (very rich, includes pricing + colours)
2. **GET /v1/variants/{id}/specs** — Loop through variant IDs for detailed specifications
3. **GET /v1/variants/{id}/accessories** — Loop for accessory catalog per variant
4. **GET /v1/offers** — Single call gets all national + regional offers with full content
5. **Images** — All image URLs from above endpoints, add \`pxc_width=1200\` for hi-res

## Current Coverage
- **10 models**: Impreza (2025, 2026), Crosstrek, Forester, Outback (2025, 2026), BRZ (2025, 2026), WRX, Solterra
- **55 variants** across all models
- **11 active offers** with regional targeting
- **9 regions** for offer localisation

## Last Verified
February 2026 — All endpoints live and returning data with production API key.`,

  'ford-au': `# Ford Australia — API Architecture

## Overview

Ford uses a **multi-layered API system** with the Polk vehicle configurator as the primary data source, Akamai WAF protection on the main site, and a BunnyNet CDN mirror for certain endpoints.

## API Families

### 1. Polk Configurator API
**Primary:** \`servicescache.ford.com/api/polk/v4/\`
**Mirror:** \`ford-api.b-cdn.net/api/polk/v4/\`
**Fallback:** \`imgservices.ford.com/api/buy/vehicle/polk/\`

Three operations on the same Polk engine:

| Endpoint | Purpose |
|----------|---------|
| \`/describe\` | Full vehicle description — images, specs, features, pricing, disclaimers |
| \`/load\` | Lighter load — images and selected marketing content |
| \`/update\` | Config update — recalculate pricing for option changes |

**Key Parameters:**
- \`config\`: \`{catalogId}~{series},{powertrain},{paint}\` — Polk configuration string
- \`retrieve\`: Comma-separated list of data facets to include
- \`locale\`: \`en_AU\`
- \`postCode\`: Australian postcode for driveaway pricing
- \`productType\`: \`P\` (private) or \`B\` (business)

### 2. Website Data APIs
- \`ford.com.au/content/ford/au/en_au.vehiclesmenu.data\` — Vehicle menu navigation data (requires browser session cookies)
- \`ford.com.au/price/{Model}\` — Price page (Akamai-blocked, returns RSC data in browser)
- \`ford.com.au/price/{Model}/summary\` — Full configurator page with driveaway pricing

### 3. Image CDN (GPAS)
\`gpas-cache.ford.com/guid/{GUID}.png\`
- Requires \`Referer: https://www.ford.com.au/\` header
- \`imformat=chrome\` parameter for browser rendering
- GUIDs come from Polk API responses

### 4. Offers
\`ford.com.au/latest-offers/\` — HTML scraping via Cheerio/Puppeteer

## Scraping Strategy

1. **Polk Describe** (CDN mirror) — Primary data source, no WAF, returns everything
2. **Browser Rendering** — For price pages and vehicle menu data (Akamai blocks direct requests)
3. **GPAS Images** — Use GUIDs from Polk with proper Referer header

## Last Verified
February 2026 — Polk APIs via BunnyNet CDN confirmed working. ford.com.au requires browser session.`,

  'kia-au': `# Kia Australia — API Architecture

## Overview

Kia provides **open JSON APIs** at \`kia.com/api/kia_australia/\` — no authentication required. Direct HTTP access returns full pricing and vehicle data.

## Endpoints

| Endpoint | Returns |
|----------|---------|
| \`/common/trimPrice.selectPriceByModel?regionCode=VIC\` | All 41 models with 200+ trims, RRP, offer prices, driveaway prices |
| \`/common/trimPrice.selectPriceByTrim?regionCode=VIC&modelCode={code}\` | Detailed trim specs and pricing for a specific model |
| \`/base/carInfo.selectVehicleList\` | Vehicle list with brochure URLs |

## Key Notes

- **No auth** — Public APIs, direct curl access works
- **Region codes** — VIC, NSW, QLD, WA, SA, TAS, ACT, NT for state-specific driveaway pricing
- **Very rich** — selectPriceByModel returns complete pricing matrix in a single call
- **Reliable** — 0.95 reliability score, rarely changes structure

## Scraping Strategy

1. **selectPriceByModel** — Single call gets all models + pricing. This is the primary endpoint.
2. **selectPriceByTrim** — Per-model detail when needed for full specs.

## Last Verified
February 2026 — All endpoints returning data.`,

  'toyota-au': `# Toyota Australia — API Architecture

## Overview

Toyota uses an **internal API layer** at \`toyota.com.au/main/api/v1/\` with Akamai WAF protection, plus a **BunnyNet CDN mirror** for offers/disclaimers.

## Endpoints

### Vehicle Data (WAF-protected)
| Endpoint | Returns |
|----------|---------|
| \`/finance/grades\` | Grade IDs, names, model mapping |
| \`/toyotavehicles/range/grades/variants/{gradeId}\` | Variants per grade with pricing and specs |
| \`/toyotavehicles/range/grades/variants/trims/{variantId}\` | Trim-level detail with features |
| \`/toyotavehicles/image/360/all/{vehicleId}\` | 360° images — E01-E36 exterior, I01-I36 interior |

### Offers (CDN — public access)
| Endpoint | Returns |
|----------|---------|
| \`toyota-api.b-cdn.net/main/api/v1/toyota/currentoffers/all?tablePrefix=web\` | All current offers with pricing and validity dates |
| \`toyota-api.b-cdn.net/main/api/v1/toyota/currentoffers/disclaimers/all?tablePrefix=web\` | Offer disclaimers and T&Cs |

## Scraping Strategy

1. **CDN Offers** — Direct access, no WAF, gets all current offers
2. **Browser Rendering** — For vehicle data endpoints (Akamai protection)
3. **360 Images** — Available via API once you have vehicle IDs from grade/variant endpoints

## Last Verified
February 2026 — CDN endpoints confirmed live. Vehicle API requires browser session.`,

  'hyundai-au': `# Hyundai Australia — API Architecture

## Overview

Hyundai uses a **price calculator API** at \`hyundai.com/content/api/au/hyundai/v3/\` — accessible via direct HTTP.

## Endpoints

| Endpoint | Returns |
|----------|---------|
| \`/carpricecalculator/models\` | All model list with model codes |
| \`/carpricecalculator?postcode={postcode}\` | Full variant pricing, driveaway prices, specifications by postcode |

## Key Notes

- **Postcode-based pricing** — Driveaway prices vary by location
- **Direct access** — No WAF blocking observed, curl works
- **Two-step flow** — Get model codes first, then query price calculator per model

## Last Verified
February 2026 — Both endpoints returning data.`,

  'nissan-au': `# Nissan Australia — API Architecture

## Overview

Nissan uses a **GraphQL API** for vehicle data, a **Choices API** for location-based pricing, and a **Helios media server** for 360° vehicle imagery.

## Endpoints

| Endpoint | Method | Returns |
|----------|--------|---------|
| \`gq-apn-prod.nissanpace.com/graphql\` | POST | MLP pricing, EIM codes, specifications |
| \`ap.nissan-api.net/v2\` | GET | Location-based driveaway pricing |
| \`ms-prd.apn.mediaserver.heliosnissan.net/iris/iris\` | GET | 360° vehicle images |

## Image Parameters (Helios)
\`fabric=G&paint={code}&vehicle={code}&pov=E01&width=2000&brand=nisglo\`
- E01-E36: exterior angles
- I01-I36: interior angles

## Key Notes

- **GraphQL** — Requires specific query structure for the Nissan PACE platform
- **Choices API** — Separate service for driveaway pricing calculations
- **Helios** — CDN-hosted image server, publicly accessible with correct parameters

## Last Verified
February 2026 — All endpoints confirmed via source code analysis.`,

  'gwm-au': `# GWM Australia — API Architecture

## Overview

GWM (Great Wall Motors) uses **Storyblok CMS** as their headless content backend, with offers served from their main website.

## Endpoints

| Endpoint | Returns |
|----------|---------|
| \`api.storyblok.com/v2/cdn/stories?content_type=AUModel&token={token}\` | Model specs, pricing, variants, images |
| \`gwmanz.com/au/offers/\` | Current offers page (HTML scraping) |

## Key Notes

- **Storyblok** — Public CDN API with a token. Returns structured JSON with full model data.
- **Offers** — HTML page, requires Cheerio scraping for offer cards, pricing, disclaimers.

## Last Verified
February 2026 — Storyblok API confirmed working. Offers page accessible.`,
}

async function seed() {
  for (const [oem_id, api_docs] of Object.entries(docs)) {
    // Merge api_docs into existing config_json
    const { data: existing } = await supabase
      .from('oems')
      .select('config_json')
      .eq('id', oem_id)
      .single()

    const config_json = { ...(existing?.config_json || {}), api_docs }

    const { error } = await supabase
      .from('oems')
      .update({ config_json })
      .eq('id', oem_id)

    if (error) {
      console.error(`Error updating ${oem_id}:`, error.message)
    } else {
      console.log(`Updated ${oem_id} — ${api_docs.length} chars of docs`)
    }
  }
}

seed()
