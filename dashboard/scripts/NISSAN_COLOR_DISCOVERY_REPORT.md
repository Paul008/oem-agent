# Nissan Australia Vehicle Color Data Discovery Report

## Executive Summary

Nissan Australia uses a complex multi-API architecture for their vehicle configurator with client-side color data loading. Color information is available but requires either browser automation (Playwright) or reverse-engineering the configurator's API calls.

## Database Status

- **Products in DB**: 45 Nissan products
- **Color Records**: 0 (needs seeding)
- **Discovered APIs**: 0 in table

## Website Architecture

### Primary URLs

```
Base: https://www.nissan.com.au/
Model Pages: /vehicles/browse-range/{model}.html
Configurators: /vehicles/browse-range/{model}/build.html
Version Explorer: /vehicles/browse-range/{model}/version-explorer/
```

### Configurator Patterns

```
Format 1: /configurator/cfg.shtml/{BASE64_CODE1}/{BASE64_CODE2}/exterior-colour
Format 2: /configurator-v3/cfg.shtml/{BASE64_CODE1}/{BASE64_CODE2}/exterior-colour
Format 3: /ve.shtml/gradeSpec:{MODEL_CODE}-{VARIANT}
```

## API Infrastructure

### 1. PACE API Gateway (Public Access)

```
Token Endpoint: https://apigateway-apn-prod.nissanpace.com/apn1nisprod/public-access-token
Parameters:
  - brand: NISSAN
  - dataSourceType: live
  - market: AU
  - client: pacepublisher

Response: {
  "idToken": "eyJraWQi..." (Cognito JWT)
}

Auth Type: Cognito JWT
Groups: ["configurator"]
Custom Claims: market=au, brand=nissan
```

### 2. Apigee Gateway

```
Base URL: https://ap.nissan-api.net/
Known Endpoints:
  - /v2/models (requires apiKey + clientKey + publicAccessToken)

Headers:
  apiKey: BbNYLp9yyK3SWNxM9ZHVSUzKyJT9b63a
  clientKey: 305e64c10be2e8fc0b7452a55f64e3b0
  publicAccessToken: e9c8b8c74e7f485f9c3b7ad8697b8da9
```

### 3. CDN Resources

```
Base: https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/

Color Swatches:
  Pattern: Images/vehicles/shared-content/colors/{MY_YEAR}-{MODEL}/thumbs/{COLOR_CODE}.png
  Example: Images/vehicles/shared-content/colors/MY24-JUKE/thumbs/NBV.png

Side Profiles:
  Pattern: Images/vehicles/{MODEL}/side-profiles/{VARIANT_COLOR}.png
  Example: Images/vehicles/JUKE/side-profiles/JK2PDTIY24_FRNARWLF16UMARHMCH_1.png
```

## Color Data Discovered

### Juke (MY24)

```
Color Codes: NBV, RCF, QAB, KAD, GAT
Swatch Images: ✅ Available
Format: 3-letter codes
```

### Pathfinder

```
Color Codes: KAD (shared with Juke)
Swatch Images: ✅ Available
```

### Other Models

```
Status: Color swatches not found in initial HTML extraction
Note: May require JavaScript execution or different URL patterns
```

## Color Code Patterns

### Code Format

- 3-letter uppercase codes (e.g., NBV, GAT, KAD)
- Appears to be Nissan's internal color coding system
- Some codes shared across models (e.g., KAD appears on Juke and Pathfinder)

### CDN Structure

```
Color Swatch Path Template:
/content/dam/Nissan/AU/Images/vehicles/shared-content/colors/{MY_YEAR}-{MODEL_UPPER}/thumbs/{CODE}.png

Example:
MY24-JUKE → Model year 2024 Juke
NBV → Color code
```

## Data Extraction Challenges

### 1. Client-Side Rendering

- Configurator pages load color data dynamically via JavaScript
- No static JSON files containing complete color catalogs
- Requires browser execution to extract full data

### 2. API Authentication

- PACE API requires Cognito JWT token
- Token obtained easily but correct API endpoints not documented
- Configurator uses internal AWS ELB endpoints (not publicly accessible)

### 3. Variant Mapping

- Color availability varies by variant/grade
- gradeSpec codes required to map colors to specific products
- Example: `30128-ST`, `29299-SL_DUAL_CAB`

## Recommended Extraction Approaches

### Option A: Playwright Browser Automation ⭐ RECOMMENDED

```javascript
1. Load configurator page in headless browser
2. Wait for color selector UI to render
3. Extract color data from DOM:
   - Color codes from data attributes
   - Color names from labels
   - Hex values from swatches (image analysis)
4. Screenshot color selectors for reference
5. Map colors to variants via gradeSpec
```

**Pros**: Most reliable, gets actual rendered data
**Cons**: Slower, requires browser infrastructure
**Estimated Effort**: 2-4 hours

### Option B: Reverse Engineer API Calls

```javascript
1. Inspect Network tab during color selection
2. Capture XHR/fetch requests with payloads
3. Extract required headers and auth
4. Build API client
5. Iterate through all models/variants
```

**Pros**: Faster once working, reusable
**Cons**: May break if API changes, requires maintenance
**Estimated Effort**: 4-8 hours (trial and error)

### Option C: CDN Swatch Enumeration

```javascript
1. Discover color code patterns from HTML
2. Build CDN URL templates
3. Enumerate possible color codes (AAA-ZZZ)
4. Test each URL, collect 200 responses
5. Extract color names from image metadata
```

**Pros**: Simple, no authentication
**Cons**: Incomplete data, no color names, lots of 404s
**Estimated Effort**: 1-2 hours

### Option D: Manual Data Entry

```javascript
1. Visit each model configurator page
2. Screenshot color selectors
3. Manually transcribe color names and codes
4. Download swatch images
5. Seed database manually
```

**Pros**: 100% accurate, complete data
**Cons**: Time-consuming, not scalable
**Estimated Effort**: 30 min per model = 3-4 hours

## Image Resources Available

### Color Swatches

```
✅ Small thumbnails (~50x50px)
✅ PNG format with transparency
✅ Organized by model year
✅ Publicly accessible (no auth)

URL Pattern:
https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/vehicles/shared-content/colors/{MY_YEAR}-{MODEL}/thumbs/{CODE}.png
```

### Side Profile Renders

```
✅ Full vehicle renders with color
✅ PNG format, high resolution
✅ Multiple variants per model
⚠️  Filename encoding unclear

URL Pattern:
https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/vehicles/{MODEL}/side-profiles/{ENCODED_VARIANT_COLOR}.png
```

## Next Steps

### Immediate Actions

1. ✅ Document current findings (this report)
2. ⬜ Choose extraction approach (recommend Option A: Playwright)
3. ⬜ Set up Playwright environment
4. ⬜ Create color extraction script
5. ⬜ Test on 2-3 models first
6. ⬜ Build mapping to existing products
7. ⬜ Seed variant_colors table

### Database Schema Preparation

```sql
-- Check variant_colors schema
-- Required fields:
--   product_id (FK to products)
--   color_code (e.g., 'NBV')
--   color_name (e.g., 'Pearl Black')
--   hex_code (optional, from swatch analysis)
--   swatch_image_url
--   hero_image_url (optional)
```

### Quality Validation

1. Verify color count matches website
2. Cross-check color names with official Nissan materials
3. Validate swatch images load correctly
4. Ensure unique constraint on product_id + color_code

## API Endpoints to Add to discovered_apis

```json
[
  {
    "oem_id": "nissan-au",
    "url": "https://apigateway-apn-prod.nissanpace.com/apn1nisprod/public-access-token",
    "method": "GET",
    "auth_type": "none",
    "params": {
      "brand": "NISSAN",
      "dataSourceType": "live",
      "market": "AU",
      "client": "pacepublisher"
    },
    "response_type": "json",
    "purpose": "Obtain Cognito JWT for PACE API access"
  },
  {
    "oem_id": "nissan-au",
    "url": "https://ap.nissan-api.net/v2/models",
    "method": "GET",
    "auth_type": "header",
    "headers": {
      "apiKey": "BbNYLp9yyK3SWNxM9ZHVSUzKyJT9b63a",
      "clientKey": "305e64c10be2e8fc0b7452a55f64e3b0",
      "publicAccessToken": "e9c8b8c74e7f485f9c3b7ad8697b8da9"
    },
    "purpose": "Apigee models endpoint (session auth required)"
  },
  {
    "oem_id": "nissan-au",
    "url": "https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/vehicles/shared-content/colors/{MY_YEAR}-{MODEL}/thumbs/{CODE}.png",
    "method": "GET",
    "auth_type": "none",
    "purpose": "Color swatch images"
  }
]
```

## Known Color Codes

### Discovered Codes

```
NBV - (Unknown name) - Juke
RCF - (Unknown name) - Juke
QAB - (Unknown name) - Juke, Qashqai
KAD - (Unknown name) - Juke, Pathfinder
GAT - (Unknown name) - Juke
```

### Sample URLs

```
https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/vehicles/shared-content/colors/MY24-JUKE/thumbs/NBV.png
https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/vehicles/shared-content/colors/MY24-JUKE/thumbs/RCF.png
https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/vehicles/shared-content/colors/MY24-JUKE/thumbs/QAB.png
https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/vehicles/shared-content/colors/MY24-JUKE/thumbs/KAD.png
https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/vehicles/shared-content/colors/MY24-JUKE/thumbs/GAT.png
```

## Technical Notes

### Configurator Architecture

- Built on AWS infrastructure (Cognito, ELB, API Gateway)
- Uses React/Vue SPA framework
- Color data loaded asynchronously after page render
- gradeSpec codes used for variant identification

### Authentication Flow

```
1. Client requests public access token
2. API Gateway returns Cognito JWT
3. JWT used for subsequent API calls
4. Token includes user groups and custom claims
5. Token likely expires (check exp claim)
```

### Model Year Patterns

```
MY24 = Model Year 2024
MY25 = Model Year 2025

Note: Some models may have MY25 variants available
Check both MY24 and MY25 paths for complete coverage
```

## Conclusion

Nissan Australia vehicle color data is available but requires active extraction due to client-side rendering architecture. The recommended approach is Playwright browser automation to reliably extract color codes, names, and swatch images from the interactive configurator pages.

**Estimated Total Effort**: 4-6 hours for complete extraction across all 7 models

**Data Quality**: High - direct from official configurator
**Maintenance**: Medium - may need updates when new models/colors released
**Scalability**: Good - script can be reused for future updates
