# OEM Data Pipelines — API & Data Source Reference

How we fetch variant data (pricing, colors, specs, images, features) for each Australian OEM.

---

## Overview

| OEM | API Type | Auth | Pricing | Colors/Images | Features | In Daily Sync |
|-----|----------|------|---------|---------------|----------|---------------|
| Kia | REST API + HTML scrape | None (UA + Referer) | RRP + driveaway (8 states) | HTML parse from B&P pages | Brochure PDFs → Groq LLM | Yes |
| Ford | Polk API (PUT/GET) via Puppeteer | Akamai bypass (in-browser fetch) | RRP + driveaway per variant | Polk API image GUIDs | Polk API key features | Yes |
| Nissan | 4 APIs (REST + GraphQL + CMS) | apiKey/clientKey + x-api-key | Driveaway via Choices API | CMS colors + Helios 360° renderer | GraphQL mainFeatures + CMS USPs | Yes |
| Toyota | REST APIs via Puppeteer | None (UA + Referer) | RRP + driveaway via Finance API | rotorint.com CDN (360° + hero) | Not extracted | Yes |
| Hyundai | 2-step REST API | None (UA + Referer) | RRP + driveaway (VIC) | Relative paths on hyundai.com | Not extracted | Yes |
| Suzuki | Single public JSON | None | RRP by state (no driveaway) | Embedded in finance JSON | HTML string in API | Yes |
| GWM | Storyblok CMS API | Public tokens in URL | Driveaway (retail + ABN) | Storyblok asset CDN | Parsed from feature text | Yes |
| Isuzu | HTML scrape (offers only) | None | Driveaway (offers page only) | Page images only | From offers cards | No |
| Volkswagen | OneHub Offers API (REST) | None (dealer code param) | MRDP driveaway + MRRP | 4-angle renders + swatch tiles (VGA S3) | OneHub payload.features array | Yes |
| Chery | Drupal HTML + `data-json` attrs | None (SSR) | Driveaway per variant | `data-json` car_image + colour_image | Model page feature lists | No |

**Current totals:** 18 OEMs complete, 179 vehicle_models, 796 products (100% specs_json), 4,952 variant_colors, 1,158 variant_pricing, 322 offers, 176 banners.

> **Gatsby SSG OEMs**: LDV Australia uses Gatsby 5.14.6 with i-Motor CMS. All vehicle data (models, specs, variants, colors, pricing) is available via `page-data.json` endpoints — no browser rendering or API keys needed. See section 9 below.

### Automatic Post-Processing (All OEMs)

Every product upsert via the orchestrator now performs two automatic enrichment steps:

1. **`syncVariantColors()`** — Auto-syncs `variant_colors` rows for all OEMs during product upsert. Colors are matched from `product_colors` and OEM color palettes. No separate seed script needed for basic color data.
2. **`buildSpecsJson()`** — Builds a canonical `specs_json` JSONB column on every product upsert by consolidating `meta_json` fields + individual spec columns (`engine_size`, `cylinders`, `transmission`, `drive`, `drivetrain`). Individual spec columns are also populated from `meta_json` when present.

---

## Shared Infrastructure

All OEMs flow through the same post-processing pipeline:

```
OEM-specific fetch/build
        ↓
  output/{oem}/{model}.json          ← Carsales format (per-model files)
        ↓
  buildLegacyJson.js --oem={oem}     ← Legacy WordPress REST API format
        ↓
  output/{oem}/legacy/{model}.json
        ↓
  syncAssetsToR2.js --oem={oem}      ← Images/swatches → Cloudflare R2 CDN
        ↓
  syncOemToSupabase.js --oem={oem}   ← Variant data → Supabase database
```

Orchestrated by `scripts/sync-all-oems.js` which runs each OEM's pipeline in sequence.

---

## 1. Kia Australia

**Models:** 24 active | **Trims:** 121 | **Colors:** 848
**Marketing assets:** 2,637 via Sesimi DAM — see [`SESIMI_API_INTEGRATION.md`](./SESIMI_API_INTEGRATION.md)

### Scripts

| Script | Purpose | Output |
|--------|---------|--------|
| `scripts/import-kia-full.mjs` | Colors + pricing + brochures → Supabase | `product_colors`, `product_pricing`, `products` |
| `dashboard/scripts/seed-kia-colors.mjs` | 360 hero images from KWCMS CDN → `variant_colors` | `hero_image_url`, `gallery_urls` (6 angles from 36 frames) |
| `dashboard/scripts/seed-kia-sesimi-colors.mjs` | Sesimi 3D renders → `variant_colors` (from `portal_assets`, no API key needed) | `hero_image_url`, `gallery_urls`, `portal_asset_id` |
| `dashboard/scripts/seed-kia-offers.mjs` | Two-tier offer scraping (main + detail pages) | `offers` table (driveaway, value-add, finance) |
| `dashboard/scripts/seed-kia-accessories.mjs` | JSON-LD structured data from accessory pages | `accessories` table |
| `dashboard/scripts/seed-kia-specs.mjs` | `selectVehicleList` API + JSON-LD spec pages | Engine/transmission/capacity/tire data |
| `dashboard/scripts/seed-kia-sesimi-assets.mjs` | Sesimi Algolia → `portal_assets` (requires API key) | 2,637 marketing assets |

### Pipeline Flow

```
① import-kia-full.mjs (colors + pricing + brochures)
   Fetch trims (BYO HTML) → Fetch colors (BYO HTML) → Match to products
   Fetch pricing (trimPrice API per car_key) → product_colors + product_pricing
   Fetch brochures (carInfo.selectVehicleList) → vehicle_models.brochure_url
        ↓
② seed-kia-colors.mjs (360 hero images from KWCMS CDN)
   Scrape model pages → Find 360 render URLs → CDN probe per color
   6 key angles from 36 frames → hero_image_url + gallery_urls
        ↓
③ seed-kia-sesimi-colors.mjs (Sesimi 3D renders, alternative hero source)
   Read portal_assets → Match to variant_colors by model+color
   Profile/front/rear/side angles → hero_image_url + gallery_urls
        ↓
④ seed-kia-offers.mjs (current offers)
   Main offers page → per-model detail pages → offers table
        ↓
⑤ seed-kia-accessories.mjs (accessories catalog)
   JSON-LD from /au/cars/{model}/accessories.html → accessories table
        ↓
⑥ seed-kia-specs.mjs (vehicle specifications)
   selectVehicleList API (engine/trans encoded in trim names)
   + JSON-LD from /au/cars/{model}/specification.html
   → product specs (engine, transmission, dimensions, towing)
```

### API Endpoints

| # | URL | Method | Auth | Returns |
|---|-----|--------|------|---------|
| 1 | `https://www.kia.com/api/kia_australia/common/trimPrice.selectPriceByModel?regionCode=VIC` | GET | UA + Referer | All models with base prices, model codes |
| 2 | `https://www.kia.com/api/kia_australia/common/trimPrice.selectPriceByTrim?regionCode=VIC&modelCode={code}` | GET | UA + Referer | Per-trim RRP + driveaway pricing for all 8 states |
| 3 | `https://www.kia.com/api/kia_australia/base/carInfo.selectVehicleList` | GET | X-Requested-With | 48 vehicles with brochure URLs, reviews, finance rates, trim details, tire sizes |
| 4 | `https://www.kia.com/api/kia_australia/base/qt07/preferenceColor.selectPreferenceColorList` | GET | None | Color codes, names, popularity rate/count per trim |
| 5 | `https://www.kia.com/api/kia_australia/base/qt06/preferenceTrim.selectPreferenceTrimList` | GET | None | Trim codes, names, hero image CDN paths, 360VR display flag |
| 6 | `https://www.kia.com/api/kia_australia/base/region.selectRegionCate` | GET | None | State postcode patterns (currently returns empty — may need params) |
| 7 | `https://www.kia.com/au/shopping-tools/build-and-price.html` | GET | None | Model discovery — all live model slugs (HTML scrape) |
| 8 | `https://www.kia.com/au/shopping-tools/build-and-price.trim.{slug}.html` | GET | None | Trim codes per model (HTML scrape) |
| 9 | `https://www.kia.com/au/shopping-tools/build-and-price.color.{slug}.{trimCode}.html` | GET | None | Color names, codes, prices, swatch images, vehicle images |
| 10 | `https://www.kia.com/au/shopping-tools/offers/car-offers.html` | GET | None | Model-level offers with hero images |
| 11 | `https://www.kia.com/au/shopping-tools/offers/car-offers/{model}.html` | GET | None | Per-grade driveaway offer pricing |
| 12 | `https://www.kia.com/au/cars/{model}/accessories.html` | GET | None | Accessories via JSON-LD structured data |
| 13 | `https://www.kia.com/au/cars/{model}/features.html` | GET | None | Specs via JSON-LD (doors, seats, cargo, fuel, CO2). Formerly `/specification.html` (now 301 redirects here) |

**Headers (endpoints 1-2):**
```
User-Agent: Mozilla/5.0 (Macintosh; ... Safari/605.1.15)
Referer: https://www.kia.com/au/
```

### What Data Comes From Where

| Data | Source | Script |
|------|--------|--------|
| Model list & base prices | Endpoint 1 (pricing API) | `import-kia-full.mjs` |
| Per-trim RRP + driveaway (8 states) | Endpoint 2 (pricing API) | `import-kia-full.mjs` |
| Vehicle catalog + brochure URLs | Endpoint 3 (`selectVehicleList`) | `import-kia-full.mjs`, `seed-kia-specs.mjs` |
| BYO color codes + popularity | Endpoint 4 (`preferenceColorList`) | Discovered, available |
| BYO trim codes + hero CDN paths | Endpoint 5 (`preferenceTrimList`) | Discovered, available |
| Which models/trims are currently live | Endpoint 7-8 (Build & Price HTML) | `import-kia-full.mjs` |
| Color names, codes, swatches, paint premiums | Endpoint 9 (color pages HTML) | `import-kia-full.mjs` |
| 360 hero images (36-frame spins) | KWCMS CDN scrape + probe | `seed-kia-colors.mjs` |
| Sesimi 3D renders (profile/front/rear/side) | `portal_assets` table | `seed-kia-sesimi-colors.mjs` |
| Offers (driveaway, value-add, finance) | Endpoints 10-11 (offers pages) | `seed-kia-offers.mjs` |
| Accessories | Endpoint 12 (JSON-LD) | `seed-kia-accessories.mjs` |
| Specs (engine, transmission, dimensions) | Endpoint 3 + 13 (API + JSON-LD) | `seed-kia-specs.mjs` |
| Sub-variant discovery (K4 Hatch, Stonic MY25) | Code logic matching trim codes vs model details | `import-kia-full.mjs` |

### Color Master Table

42 color codes mapped in `import-kia-full.mjs` (lines 26-73). Standard color: `UD` (Clear White, no upcharge). All others are premium metallic/pearl/matte.

### Image Sources (Two Systems)

1. **KWCMS CDN** (`seed-kia-colors.mjs`): 360-degree renders with 36 frames per color. CDN pattern: `/content/dam/kwcms/au/en/images/showroom/{folder}/360vr/{color-slug}/{filename}_NNNNN.png`
2. **Sesimi/Cloudinary** (`seed-kia-sesimi-colors.mjs`): Studio 3D renders at 3840x2160. Profile/front/rear/side angles. CDN: `res.cloudinary.com/mabx-eu-prod`

Both write to `variant_colors.hero_image_url` — Sesimi colors script skips rows already using Cloudinary heroes.

---

## 2. Ford Australia

**Orchestrator:** `scripts/ford/syncFordPipeline.js`
**Models:** 9 active (+ 2 disabled EVs) | **Variants:** 52 | **Colors:** 400

### Pipeline Flow

```
① Discover via Polk API (Puppeteer loads ford.com.au, calls API from browser)
   → data/ford/ford-color-guids.json
   → data/ford/ford-key-features.json
        ↓
② Build from Cache
   → output/ford/{model}.json
        ↓
③ Legacy JSON → ④ Brochures → ⑤ R2 Sync → ⑥ Supabase Sync
```

### API Endpoints

All Polk API calls MUST originate from within Puppeteer's `page.evaluate(fetch())` on ford.com.au — direct curl/axios calls are blocked by Akamai.

| # | URL | Method | Returns |
|---|-----|--------|---------|
| 1 | `https://www.imgservices.ford.com/api/buy/vehicle/polk/update` | PUT | Stateful configurator — per-variant pricing, key features, chained configState |
| 2 | `https://www.imgservices.ford.com/api/buy/vehicle/polk/describe` | GET | Stateless image lookup — exterior/interior/showroom images by GUID |
| 3 | `https://www.ford.com.au/content/ford/au/en_au.vehiclesmenu.data` | GET | Full vehicle catalog menu (for new model detection) |

**Entry point (Puppeteer navigates to):**
```
https://www.ford.com.au/price/{modelSlug}?postalCode={postCode}&usageType=P
```

**Polk `update` request body:**
```json
{
  "configState": "<base64 from previous response>",
  "displayContext": "VISTA",
  "feature": "<entity code or paint code>",
  "locale": "en_AU",
  "postCode": "3000",
  "productType": "P",
  "retrieve": "images,specs,featuresMkt,selectedMkt,featureImages,featureSpecs,keyFeatures,keyFeaturesModel,keyFeaturesWalkup,uscCodes,prices,featurePrices,content,disclaimers",
  "suppressDisplayContext": true,
  "unselect": false
}
```

**Polk `describe` query params:**
```
locale=en_AU&retrieve=images&config={catalogId}~{seriesCode},{bodyCode},{powertrainCode},{paintCode}&namedConfig=default&postCode=3000&productType=P&suppressDisplayContext=true&displayContext=VISTA
```

**Image URL format:**
```
https://www.gpas-cache.ford.com/guid/{guid}.png?catalogId={catalogId}
```

**Puppeteer stealth flags required:**
- `--disable-blink-features=AutomationControlled`
- `--disable-web-security`
- `navigator.webdriver` removed
- Do NOT block stylesheets (breaks SPA hydration)

### What Data Comes From Where

| Data | Source |
|------|--------|
| Variant matrix (entity codes, grades, bodies, powertrains) | Polk `update` initial interception |
| Per-variant pricing (RRP + driveaway + dealer delivery) | Polk `update` per entity code |
| Key features per variant/grade | Polk `update` `keyFeatures` |
| Color images (exterior, interior, showroom) | Polk `describe` (preferred, drift-free) or Polk `update` per paint code |
| New model detection | Ford vehicles menu API |

### Key Caveat: Grade Drift
Polk `update` with paint codes can drift to a different grade's body styling on "hero colors" (e.g. Command Grey → Raptor, Blue Lightning → Sport). Use `polk/describe` for color images to avoid this.

---

## 3. Nissan Australia

**Key script:** `scripts/nissan/fetchNissanVariants.js`
**Models:** 10 (9 active + All-New Navara landing page) | **Variants:** 53 | **Colors:** 418

### Pipeline Flow

```
① Fetch from 4 APIs simultaneously
   → data/nissan/{slug}-raw.json (cached per model)
        ↓
② Build Variants (combines all API data + EIM→SA decoding)
   → output/nissan/{slug}.json
        ↓
③ Legacy JSON → ④ Supabase Sync
```

### API Endpoints

| # | URL | Method | Auth | Returns |
|---|-----|--------|------|---------|
| 1 | `https://www.nissan.com.au/content/nissan_prod/en_AU/index/finance-calculator/.../gradeVersionSelection.gradeVersionDetails.{financeSlug}.data.json` | GET | `X-Requested-With: XMLHttpRequest` | configCodes, version IDs |
| 2 | `https://ap.nissan-api.net/v2/models/{modelCode}/configuration/{configurator}:A/choices?...&regionalPriceLocation=3000&regionalPriceLocationType=postCode` | GET | `apiKey` + `clientKey` headers | Driveaway pricing per version/grade |
| 3 | `https://gq-apn-prod.nissanpace.com/graphql` | POST | `x-api-key` header | EIM codes, MLP pricing, features, specs |
| 4 | `https://www.nissan.com.au/content/nissan_prod/en_AU/index/vehicles/browse-range/{slug}/build/jcr:content/core.version.versions.properties.key.name.exteriorColours.engine.usp...json` | GET | None | Colors, swatches, engine specs, features |
| 5 | `https://ms-prd.apn.mediaserver.heliosnissan.net/iris/iris?...` | GET | `Referer: https://www.nissan.com.au/` | 360° rendered images (36 exterior + 36 interior angles) |

**Auth headers for Choices API (endpoint 2):**
```
apiKey: A2X4O66rkJotaSQsTDLlXb9keGbVyN8Y
clientKey: h84dIG2S17QNq6j9fgvv6t3KXBQRJJts
```

**Auth header for GraphQL (endpoint 3):**
```
x-api-key: da2-nwmjdvbxfvbwhmtqpukluhmnva
```

**Helios image URL format:**
```
https://ms-prd.apn.mediaserver.heliosnissan.net/iris/iris?fabric=G&paint={paintCode}&vehicle={vehicleCode}&sa={saString}&width=1000&client=nis&brand=nisglo&pov=E01,cgd&quality=80&y=-1000&bkgnd=white
```

### What Data Comes From Where

| Data | Source |
|------|--------|
| Config codes, version IDs | Finance Calculator API |
| Driveaway pricing (primary) | Choices API |
| MLP/EGC pricing (fallback) | GraphQL `price.amount` |
| EIM codes (for 360° image URLs) | GraphQL `eimCode` |
| Key features | GraphQL `mainFeatures` |
| Colors, swatches, hex codes | CMS API |
| Engine specs, drivetrain, transmission | CMS API `engine` object |
| 360° exterior/interior images | Helios media server (dynamically rendered) |
| Paint premium pricing | Configurator scrape (Puppeteer, supplementary) |

### EIM-to-SA Decoding (Critical for Images)
GraphQL returns an 18-character `eimCode` per variant. This is decoded to a Helios SA string that tells the image renderer which exact variant to render. Positions 0-6 map to SA params 1-7, positions 7-9 are the vehicle code (skipped), positions 10-17 map to SA params 11-18. Every variant gets a unique SA string — no static fallbacks.

---

## 4. Toyota Australia

**Key script:** `scripts/toyota/fetchToyotaVariants.js` (Puppeteer + REST APIs)
**Alt script:** `scripts/toyota/fetchToyotaVariantsAI.js` (Cloudflare AI — currently active but unreliable)

### Pipeline Flow (Puppeteer version — the reliable one)

```
① Scrape grade IDs from car loan calculator page
   → data/toyota/gradeIds.json
        ↓
② Fetch grades + pricing (Finance API)
        ↓
③ Fetch variant details (Variants API, per variant)
        ↓
④ Fetch trims + colors (Trims API, per trim)
        ↓
⑤ Fetch 360° images (Images API, per material code)
        ↓
⑥ Build output
   → output/toyota/Toyota_{Model}.json
```

### API Endpoints

| # | URL | Method | Auth | Returns |
|---|-----|--------|------|---------|
| 1 | `https://www.toyota.com.au/car-finance/car-loan-calculator` | GET (Puppeteer) | None | Grade IDs from `<ty-vehicle-selector>` DOM element `data-json` |
| 2 | `https://www.toyota.com.au/main/api/v1/finance/grades?gradeIds={id1}&gradeIds={id2}...` | GET | UA + Referer | Grade names, RRP, driveaway prices, base material codes |
| 3 | `https://www.toyota.com.au/main/api/v1/toyotavehicles/range/grades/variants/{variantId}` | GET | UA + Referer | Drivetrain, transmission, engine type, seats, doors, body style |
| 4 | `https://www.toyota.com.au/main/api/v1/toyotavehicles/range/grades/variants/trims/{trimId}?postcode=3000` | GET | UA + Referer | Paint colors (name, code, hex, swatch, images), trim details |
| 5 | `https://www.toyota.com.au/main/api/v1/toyotavehicles/image/360/all/{materialCode}` | GET | UA + Referer | 360° images at 1920x1080 webp from `cdn.rotorint.com` |

**Headers (all endpoints):**
```
User-Agent: Mozilla/5.0 (Macintosh; ...)
Accept: application/json, text/plain, */*
Referer: https://www.toyota.com.au/
```

**Image CDN:**
```
https://cdn.rotorint.com/{Model}/{Year}_{Month}/e/360/webp/lo/1920x1080/{code}_comp_{angle}.webp
https://cdn.rotorint.com/{Model}/{Year}_{Month}/e/hero/png/lo/2704x1520/{code}_compcrop_004.png
```

### Cloudflare AI Alternative (currently wired into sync-all-oems.js)

| URL | Method | Returns |
|-----|--------|---------|
| `https://stagehand-extractor.adme-dev.workers.dev` | POST | AI-extracted variants from `toyota.com.au/{slug}` showroom pages |

This approach sends each model's showroom URL to a Cloudflare Worker that uses AI to extract variant data. Currently producing `extractionFailed: true` for many models.

### What Data Comes From Where

| Data | Source |
|------|--------|
| Model/grade list + grade IDs | Car loan calculator page (DOM scrape) |
| RRP + driveaway pricing | Finance API (endpoint 2) |
| Drivetrain, transmission, engine, seats, doors | Variants API (endpoint 3) |
| Color names, codes, hex, swatches | Trims API (endpoint 4) |
| Hero + 360° images | Images API → rotorint.com CDN (endpoint 5) |

---

## 5. Hyundai Australia

**Key script:** `scripts/hyundai/fetchHyundaiVariants.js`
**Models:** 17 active

### Pipeline Flow

```
① Fetch model list (calculator models API)
        ↓
② Fetch variants per model (calculator API with postcode)
   → output/hyundai/{model}.json (one file per model)
        ↓
③ Legacy JSON → ④ R2 Sync → ⑤ Supabase Sync
```

### API Endpoints

| # | URL | Method | Auth | Returns |
|---|-----|--------|------|---------|
| 1 | `https://www.hyundai.com/content/api/au/hyundai/v3/carpricecalculator/models` | GET | UA + Referer | All models with `priceEnabled` flag |
| 2 | `https://www.hyundai.com/content/api/au/hyundai/v3/carpricecalculator?postcode=3000&modelname={name}` | GET | UA + Referer | Variants with pricing, colors, specs per model |

**Headers:**
```
User-Agent: Mozilla/5.0 (Macintosh; ...) Chrome/120.0.0.0
Accept: application/json, text/plain, */*
Referer: https://www.hyundai.com/au/en/shop/calculator
```

### What Data Comes From Where

| Data | Source |
|------|--------|
| Model list | Endpoint 1 (filtered by `priceEnabled`) |
| RRP + driveaway (VIC/3000) | Endpoint 2 `price` + `priceEstimate` |
| Variant name, grade, body type | Endpoint 2 |
| Transmission + drivetrain | Endpoint 2 `transmissionType` (combined, e.g. "7DCT FWD") |
| Engine type, fuel type | Endpoint 2 `engineType`, `fuelType` |
| Colors (name, code, price, images, swatches) | Endpoint 2 `colours[]` (relative paths, prepend `https://www.hyundai.com`) |
| Seats/doors | NOT available (null in API — known gap) |
| Color hex codes | Hardcoded `COLOR_HEX_MAP` in script (not from API) |

**Cache TTL:** 12 hours

---

## 6. Suzuki Australia

**Live module:** `src/sync/suzuki-sync.ts` (`executeSuzukiSync(supabase)` — runs in worker via `oem-data-sync` cron)
**One-shot script:** `scripts/seed-suzuki.mjs` (mirrors the worker module for manual runs with SERVICE_ROLE_KEY)
**Models:** 7 active (Swift Hybrid, Swift Sport, Ignis, Vitara Hybrid, S-CROSS, Jimny, Fronx Hybrid)
**Variants:** 15 total → 18 products (some variants have both auto + manual transmissions)

### Pipeline Flow

```
① Fetch single JSON (entire catalog in one call)
        ↓
② Walk models → variants → transmissions:
   – Parse features HTML into structured specs_json buckets
     (engine, transmission, performance, safety, multimedia, wheels, convenience)
   – Inherit specs from base trim → top trim within each model (Suzuki API only
     lists *deltas* on higher trims, so we accumulate as we walk)
   – Resolve transmission specs per-product (auto/manual differ when packed
     in one bullet, e.g. "5-speed manual or 4-speed automatic transmission")
   – Synthesise SVG data-URL swatches from each paint colour's hex
        ↓
③ Direct Supabase upsert into products / variant_colors / variant_pricing
   (query-then-update/insert by external_key, with title fallback so
   variant-ID drift across model years doesn't create duplicates)
```

### API Endpoint

| URL | Method | Auth | Returns |
|-----|--------|------|---------|
| `https://www.suzuki.com.au/suzuki-finance-calculator-data.json` | GET | None | Entire model catalog — all models, variants, colors, pricing, features in one response |

Registered in `discovered_apis` (reliability 0.95, status `verified`). This is the only data source needed for Suzuki — no browser rendering, no HTML scraping.

### What Data Comes From Where

Everything comes from the single JSON endpoint:

| Data | Source |
|------|--------|
| Model list | `models[]` (top-level array) |
| 8-state driveaway pricing per transmission | `modelVariants[].price.{NSW,VIC,QLD,WA,SA,TAS,ACT,NT}.{automatic,manual}.price` |
| Variant ID (used in `external_key` as `suzuki-{variantID}-{transmission}`) | `modelVariants[].variantID` |
| Colors (name, hex, two-tone secondHex, type, per-state price delta, hero + gallery images) | `modelVariants[].paintColours[]` |
| Hero image (636×346 webp) | `paintColours[].image.sizes.default.src` |
| Gallery image (932×507 webp) | `paintColours[].image.sizes['large-up'].src` |
| Features (parsed into structured specs) | `modelVariants[].features` (HTML `<ul><li>` string) |
| GFV finance schedules | `modelVariants[].price.{state}.{trans}.futureValue` |

**Known gaps:** Suzuki does not publish brochure PDFs publicly (only a "Request a Brochure" form), so `vehicle_models.brochure_url` is left null and the PDF spec extraction pipeline is skipped for Suzuki. Seats/doors/dimensions aren't in the API either — the dashboard shows whatever the parsed `features` cover (engine displacement, transmission gears, fuel economy L/100km, airbag count, touchscreen size, wheel diameter, safety/convenience booleans).

**Cache TTL:** 24 hours (driven by `oem-data-sync` cron schedule)

---

## 7. GWM Australia

**Key script:** `scripts/gwm/fetchGwmModelsApi.js`
**Models:** 9 active (Haval Jolion, H6, H6 GT, H7, Tank 300, Tank 500, Cannon, Cannon Alpha, Ora)

### Pipeline Flow

```
① Fetch all model stories (Storyblok CMS)
        ↓
② Fetch variant stories per model (Storyblok CMS)
   → output/gwm/{model}.json
        ↓
③ Legacy JSON → ④ R2 Sync → ⑤ Supabase Sync
```

### API Endpoints

| # | URL | Method | Auth | Returns |
|---|-----|--------|------|---------|
| 1 | `https://api.storyblok.com/v2/cdn/stories?by_slugs=car-configurator/models/*&language=au&content_type=AUModel&sort_by=content.driveaway_abn_price:asc:float&token=rII785g9nG3hemzhYNQvQwtt&version=published` | GET | Token in URL | All model stories (names, slugs) |
| 2 | `https://api.storyblok.com/v2/cdn/stories?language=au&starts_with=car-configurator/models/{modelSlug}/au&per_page=100&token=grBrbRuRX6NJLbQcyDGpcgtt&version=published` | GET | Token in URL | Variant stories per model |

**Storyblok tokens:**
- Models list: `rII785g9nG3hemzhYNQvQwtt`
- Variant details: `grBrbRuRX6NJLbQcyDGpcgtt`

### What Data Comes From Where

| Data | Source |
|------|--------|
| Model list + slugs | Endpoint 1 stories |
| Variant names, badge/trim | Endpoint 2 `content.variant_name` |
| Driveaway pricing (retail + ABN) | Endpoint 2 `content.driveaway_retail_price`, `content.driveaway_abn_price` |
| Colors (name, images) | Endpoint 2 `content.colours[]` with Storyblok asset URLs |
| Engine, transmission, drive | Parsed from `content.highlighted_features[]` free text via regex |
| Color hex codes | `config/gwm-colors.json` static mapping |
| Sub-brand (Haval/Tank/GWM/Ora) | Hardcoded `BRAND_MAP` in script |

**Cache TTL:** 24 hours

---

## 8. Isuzu Australia (Offers Only)

**Key script:** `scripts/isuzu/fetchIsuzuOffers.js`
**No full variant pipeline — offers page scrape only.**

### API Endpoint

| URL | Method | Auth | Returns |
|-----|--------|------|---------|
| `https://www.isuzuute.com.au/offers/current-offers` | GET | UA header | Offers HTML page (Cheerio scrape, no Puppeteer) |

### What Data Comes From Where

| Data | Source |
|------|--------|
| Vehicle name (model, grade, drive, body) | `.icd-figure__title` DOM element (parsed) |
| Driveaway price | `.icd-details__title` DOM element |
| Vehicle image | `.icd-figure__image img` |
| Key features | `.icd-details__feats li` |
| Offer end date | Parsed from disclaimer text |

**Output:** `output/isuzu/offers/latest-offers.json` only.

---

## 9. LDV Australia

**Data source:** Gatsby 5.14.6 `page-data.json` endpoints (i-Motor CMS backend)
**Models:** 13 | **Products:** 11 (with full `specs_json`) | **Colors:** 47 (with hero images) | **Pricing:** 9 rows
**CDN:** `cdn.cms-uploads.i-motor.me` (images)
**Framework field:** `framework: 'gatsby'` in OEM registry

### Pipeline Flow

```
1. Fetch /page-data/vehicles/page-data.json (all models index)
       |
2. Fetch /page-data/vehicles/{model-slug}/page-data.json (per-model specs, variants, colors)
       |
3. Upsert to vehicle_models, products, variant_colors, variant_pricing via orchestrator
```

No browser rendering needed — Gatsby pre-renders all data into static JSON endpoints.

### API Endpoints

| # | URL | Method | Auth | Returns |
|---|-----|--------|------|---------|
| 1 | `https://www.ldvautomotive.com.au/page-data/vehicles/page-data.json` | GET | None | All models with slugs, categories, variants, pricing, images |
| 2 | `https://www.ldvautomotive.com.au/page-data/vehicles/{model-slug}/page-data.json` | GET | None | Per-model full specs, variants, colors with price deltas, features |
| 3 | `https://www.ldvautomotive.com.au/page-data/special-offers/page-data.json` | GET | None | Structured offer data |
| 4 | `https://www.ldvautomotive.com.au/page-data/price/page-data.json` | GET | None | Price guide with driveaway pricing |

### What Data Comes From Where

| Data | Source |
|------|--------|
| Model list + slugs + categories | Endpoint 1 (vehicles index page-data) |
| Variant names, pricing ($36,990–$104,990) | Endpoint 2 (per-model page-data) |
| Engine specs, transmission, dimensions, towing | Endpoint 2 `specs_json` fields |
| Colors with hex, swatch, hero images, price deltas | Endpoint 2 `colors` array |
| Hero images | `cdn.cms-uploads.i-motor.me` CDN |
| Offers | Endpoint 3 (offers page-data) |
| Price guide / driveaway pricing | Endpoint 4 (price page-data) |

### Vehicle Lineup

T60 MAX (PRO/PLUS), Terron 9 (Origin/Evolve), eT60, D90 (2WD/4WD), MIFA 9, G10+, Deliver 7 (SWB/LWB), Deliver 9 (Van/Cab Chassis/Bus/Campervan), eDeliver 7, eDeliver 9

### Key Notes

- **Gatsby page-data pattern**: Any Gatsby site exposes `page-data.json` at every route — a rich structured data source that bypasses the need for browser rendering or API discovery.
- **i-Motor CMS**: Backend CMS that feeds the Gatsby build. CDN at `cdn.cms-uploads.i-motor.me`.
- **No auth required**: All endpoints are public static JSON files.
- **Framework field**: OEM registry now includes `framework: 'gatsby'` for LDV, `'aem'` for Ford/Kia/Nissan/Hyundai/GMSV, `'nextjs'` for GWM/GAC/Mazda, `'wordpress'` for Suzuki.

---

## Key Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/sync-all-oems.js` | Master orchestrator — runs all OEM pipelines in sequence |
| `scripts/shared/buildLegacyJson.js` | Transforms Carsales JSON → WordPress REST API schema |
| `scripts/shared/syncAssetsToR2.js` | Uploads images/swatches to Cloudflare R2 CDN |
| `scripts/shared/syncOemToSupabase.js` | Pushes variant data to Supabase database |
| `lib/transformers/carsales-transformer.js` | Normalizes all OEM data into standard Carsales output format |
| `scripts/kia/syncKiaPipeline.js` | Kia-specific pipeline orchestrator |
| `scripts/ford/syncFordPipeline.js` | Ford-specific pipeline orchestrator |

---

## Data File Locations

| Path | Contents |
|------|----------|
| `data/{oem}/` | Raw/intermediate cached API responses |
| `output/{oem}/` | Final Carsales-format JSON (one file per model) |
| `output/{oem}/legacy/` | Legacy WordPress REST API format |
| `output/{oem}/offers/` | Current offers (where applicable) |
| `config/` | Static config files (color maps, model lists) |
