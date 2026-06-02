# Toyota Australia API Discovery

## Overview

Toyota Australia uses a structured internal API for vehicle data that returns
rich product information including specs, colours, pricing, and images.

**Base URL:** `https://www.toyota.com.au/main/api/v1/toyotavehicles`

**Authentication:** Session cookies + Cloudflare clearance (`__cf_bm`, `ASP.NET_SessionId`)

**Public model discovery URL:** `https://app.toyotainventory.com.au/api/NavCategory?dealerid={dealerId}`

> ⚠️ **Critical:** These APIs are protected by Cloudflare and require an active
> browser session. Direct `curl` or server-side fetch will receive a 403
> challenge page. The APIs must be called from within the browser context
> (Puppeteer/Playwright) or via the orchestrator's smart-mode rendering.
>
> Exception: the Toyota TDP `NavCategory` endpoint is public and should be used
> to discover current model/grade URLs before falling back to browser scraping.

---

## API Hierarchy

```
https://app.toyotainventory.com.au/api/NavCategory?dealerid={dealerId}
  → Returns current model navigation, model groups, grades, and rotorint images

/range/grades/variants/{variantID}
  → Returns variant details + array of available trims

/range/grades/variants/trims/{trimID}?postcode={postcode}
  → Returns trim details + paint options + pricing + images
```

### NavCategory Discovery

Werribee Toyota uses Toyota's TDP navigation endpoint with dealer ID `36948`.
The response is grouped into categories such as Cars, SUVs & 4WDs, and Utes &
Vans. Vehicle URLs use the TDP path shape `/new-vehicles/{model}`; these are
mapped back to Toyota model paths (`/{model}`) before visiting toyota.com.au in
the browser session to extract `NMToyota...` variant IDs.

The worker accepts optional `TOYOTA_DEALER_ID`; if unset it defaults to
Werribee Toyota `36948`.

### Variant ID Format

`NMToyota{MODEL}{VARIANT_CODE}`

Examples:
- `NMToyotaHLX42U241103TJTJT` — Hilux 4x4 SR5
- `NMToyotaCORH4E2512039C0C1` — Corolla Hatch Hybrid
- `NMToyotaCHRH0M508803WB0B0` — C-HR 2WD Hybrid

### Trim ID Format

`NMToyota{MODEL}{VARIANT_CODE}{TRIM_CODE}`

Examples:
- `NMToyotaHLX42U241103TJTJTLA20` — Hilux SR5 + Black Leather Accented
- `NMToyotaHLX22U2417037J9J9FA20` — Hilux WorkMate + Black Fabric

---

## Endpoint 1: Variant Details

```
GET /main/api/v1/toyotavehicles/range/grades/variants/{variantID}
```

### Response Structure

```json
{
  "variant": {
    "ID": "NMToyotaHLX42U241103TJTJT",
    "Name": "Hilux 4x4 A 2.8L 48V Double Cab SR5 + Premium Interior",
    "BodyType": "Double cab pick-up",
    "Drivetrain": "4x4",
    "EngineLitres": "2.8",
    "EngineType": "Diesel",
    "FuelConsumption": "7.2",
    "MaxPowerKW": "150",
    "TransmissionType": "Automatic",
    "LengthMM": "5320",
    "WidthMM": "1855",
    "HeightMM": "1865",
    "HasEnhancementPack": true,
    "HasSpecialOffers": false,
    "VariantOrder": 2,
    "TrimOrdering": "[\"Black Leather Accented\"]",
    "IsDataValid": true
  },
  "trims": [
    {
      "ID": "NMToyotaHLX42U241103TJTJTLA20",
      "Name": "LA20 Black Leather Accented",
      "TrimImage": "//cdn.rotorint.com/trims/swatches/circular/40x40/LA20.png",
      "SSN": "2U",
      "TrimDescription": "Black Leather Accented",
      "TrimOrder": 1,
      "TrimCode": "LA20",
      "IsDataValid": true
    }
  ],
  "success": true
}
```

### Mapping to Product Schema

| API Field | Product Column |
|-----------|---------------|
| `variant.Name` | `title` |
| `variant.BodyType` | `body_type` |
| `variant.Drivetrain` | `drive` / `drivetrain` |
| `variant.EngineType` | `fuel_type` |
| `variant.EngineLitres` | `engine_size` |
| `variant.TransmissionType` | `transmission` |
| `variant.LengthMM` | `specs_json.dimensions.length_mm` |
| `variant.WidthMM` | `specs_json.dimensions.width_mm` |
| `variant.HeightMM` | `specs_json.dimensions.height_mm` |
| `variant.FuelConsumption` | `specs_json.performance.fuel_combined_l100km` |
| `variant.MaxPowerKW` | `specs_json.performance.power_kw` |
| `variant.ID` | `external_key` |

---

## Endpoint 2: Trim Details (Colours + Pricing + Images)

```
GET /main/api/v1/toyotavehicles/range/grades/variants/trims/{trimID}?postcode=3000
```

For the scheduled importer, VIC pricing is fetched with Werribee postcode
`3030`, matching the dealer reference app's `get-dprice-by-mcode` function.

### Response Structure

```json
{
  "trim": {
    "ID": "NMToyotaHLX22U2417037J9J9FA20",
    "Name": "FA20 Black Fabric",
    "TrimImage": "//cdn.rotorint.com/trims/swatches/circular/40x40/FA20.png",
    "SSN": "2U",
    "TrimDescription": "Black Fabric",
    "TrimOrder": 1,
    "TrimCode": "FA20",
    "VariantID": "NMToyotaHLX22U2417037J9J9",
    "PaintOrdering": "[\"Glacier White\",\"Stunning Silver\",\"Ash Slate\",\"Eclipse Black\"]"
  },
  "paints": [
    {
      "ID": "NMToyotaHLX22U2417037J9J9FA20040",
      "Name": "040 Glacier White",
      "BodyPaintDescription": "Glacier White",
      "BodyPaintCode": "040",
      "BodyPaintSwatchImage": "//cdn.rotorint.com/colours/swatches/gradient/40x40/040.png",
      "BodyPaintSwatchHex": "#ffffff",
      "MaterialCode": "2U24170J9FA20040",
      "PricingOptions": {
        "Driveaway_Price": "41445",
        "Driveaway_Price_Disclaimer": null,
        "IsValid": true
      },
      "Images": [
        {
          "URL": "//cdn.rotorint.com/HiLux/2025_08_Aug_v2/e/hero/png/lo/907x510/HLX_SPN_010040FA202U24170J9_compcrop_004.png",
          "ResolutionString": "907x510",
          "FileType": "png"
        }
      ]
    }
  ],
  "success": true
}
```

### Mapping to Product Schema

| API Field | Product Column |
|-----------|---------------|
| `trim.Name` | `variant_name` |
| `trim.TrimCode` | `variant_code` |
| `trim.TrimImage` | `primary_image_r2_key` (after upload) |
| `paints[].Name` | `variant_colors` reference |
| `paints[].BodyPaintDescription` | Colour name |
| `paints[].BodyPaintCode` | Colour code |
| `paints[].BodyPaintSwatchImage` | Swatch URL |
| `paints[].PricingOptions.Driveaway_Price` | `price_amount` |
| `paints[].Images[].URL` | Hero image URL |
| `paints[].MaterialCode` | Unique material code per colour/trim combo |

---

## Integration Strategy

### Option A: Browser-Based API Discovery (Recommended)

1. Render `/hilux/prices` with Puppeteer/Cloudflare Browser
2. Inject a script to call `fetch()` against the API endpoints
3. Capture JSON responses via `page.evaluate()`
4. Extract and upsert products

### Option B: Network Interception

1. Render the model page with network interception enabled
2. Wait for the API call to fire (usually on `/prices` or `/range` tab click)
3. Capture the response from the network layer
4. Parse and upsert

### Option C: Direct API with Session Refresh

1. Navigate to the model page to establish cookies
2. Read cookies from the browser context
3. Pass cookies to a `fetch()` call
4. Parse and upsert

> **Note:** Option C is fragile because Cloudflare rotates cookies frequently.
> Option A is the most reliable because the API call happens inside the same
> browser context that established the session.

---

## Known Issues

1. **Cloudflare blocking** — Direct curl/server fetch returns 403. Browser context required.
2. **Session expiry** — Cookies expire after ~30 minutes. Must navigate to a Toyota page before each API batch.
3. **Missing range endpoint** — `/range` returns 404. No known endpoint to list all models/variants.
4. **Variant ID source** — NavCategory provides model and grade URLs but not
   `NMToyota...` IDs. Variant IDs still come from Toyota model page HTML inside
   the browser session.

---

## Files

- `scripts/toyota-api-discovery.ts` — Discovery scripts used to map this API
- `scripts/toyota-api-responses.json` — Sample API responses
- `scripts/toyota-api-hierarchy.json` — API hierarchy exploration results
