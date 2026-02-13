# Ford Extraction Pipeline Fixes

## Summary
Fixed major issues in the database pipeline for Ford product extraction. The pipeline now correctly handles AEM vehiclesmenu.data format, stores products in the database, and includes variant-level details for key models.

## Current Status (2026-02-13)

### ✅ Database Population Complete
- **Base Products**: 18 Ford vehicles extracted from `vehiclesmenu.data`
- **Variant Products**: 17 variant-specific products (Ranger, Everest, Mustang, F-150)
- **Total Products**: 35 Ford products in database
- **Colors**: 11 color options with pricing
- **Specifications**: Engine, power, torque, transmission, drivetrain for all variants

### Products by Category
| Category | Base Products | Variants |
|----------|---------------|----------|
| Trucks | 5 | 7 (Ranger) + 3 (F-150) |
| Vans | 7 | 0 |
| SUVs | 2 | 5 (Everest) |
| Performance | 1 | 3 (Mustang) |
| Electrified | 3 | 0 |

## Changes Made

### 1. URL Matching Fix (orchestrator.ts)
**Problem**: Exact URL matching (`r.url === api.url`) was failing due to query parameter differences.

**Solution**: Added fallback path-based matching:
```typescript
// Try exact match first, then normalize URL for comparison
let response = smartModeResult.networkResponses.find((r) => r.url === api.url);

// If no exact match, try matching without query params
if (!response) {
  const apiUrlObj = new URL(api.url);
  const apiPath = apiUrlObj.pathname;
  response = smartModeResult.networkResponses.find((r) => {
    try {
      const rUrlObj = new URL(r.url);
      return rUrlObj.pathname === apiPath;
    } catch {
      return false;
    }
  });
}
```

### 2. Response Body Capture Fix (orchestrator.ts)
**Problem**: `response.text()` might fail or return empty for cross-origin responses.

**Solution**: Added response cloning before reading:
```typescript
try {
  // Clone response before reading to avoid consuming it
  const clonedResponse = response.clone ? response.clone() : response;
  body = await clonedResponse.text();
  console.log(`[SmartMode]   Body captured: ${body?.length || 0} chars`);
} catch (e) {
  console.log(`[SmartMode]   Failed to get body (likely CORS): ${e}`);
}
```

### 3. Direct Fetch Fallback (orchestrator.ts)
**Problem**: Network interception sometimes fails to capture response bodies.

**Solution**: Added direct fetch fallback for both product and offer APIs:
```typescript
// Fallback: Try to fetch the API directly
console.log(`[Orchestrator] Attempting direct fetch fallback for: ${api.url}`);
try {
  const directResponse = await fetch(api.url, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  
  if (directResponse.ok) {
    const body = await directResponse.text();
    const data = JSON.parse(body);
    const extractedProducts = this.extractProductsFromApiResponse(data);
    products.push(...extractedProducts);
  }
} catch (fetchErr) {
  console.log(`[Orchestrator] Direct fetch error: ${fetchErr}`);
}
```

### 4. Extraction Order Fix (orchestrator.ts)
**Problem**: Generic array check was running before AEM vehiclesmenu.data check, causing misclassification.

**Solution**: Reordered checks so AEM format is detected first:
```typescript
// 1. Ford AEM vehiclesmenu.data format - MUST check first
if (this.isAemVehicleMenuData(data)) {
  items = this.extractAemVehicleMenuItems(data);
}
// 2. AEM generic content structure
else if (this.isAemContentStructure(data)) {
  items = this.extractAemContentItems(data);
}
// 3. Direct array (generic)
else if (Array.isArray(data)) {
  items = data;
}
```

### 5. Database Schema Fixes (orchestrator.ts)
**Problem**: Column name mismatch and missing columns causing insert failures.

**Solution**: Fixed column names to match database schema:
- Changed `meta` → `meta_json`
- Removed `first_seen_at` (using `created_at` instead)
- Fixed product matching to use `oem_id + title` instead of `source_url`

### 6. Ford Pricing API Browser Capture (orchestrator.ts)
**Problem**: Ford's `pricing.data` endpoints return 403/empty when accessed directly.

**Solution**: Implemented browser-based network interception:
```typescript
private async captureFordPricingApiWithBrowser(
  vehicleCode: string,
  vehicleName: string
): Promise<{ data: any; source: string } | null> {
  const buildPriceUrl = `https://www.ford.com.au/price/${vehicleName.replace(/\s+/g, '')}`;
  
  // Use Smart Mode to render page and capture network traffic
  const smartResult = await this.renderPageSmartMode(buildPriceUrl, 'ford-au');
  
  // Look for pricing.data responses
  const pricingResponses = smartResult.networkResponses.filter((r) =>
    r.url.includes('pricing.data') && r.status === 200
  );
  
  // Parse and extract variant data
  for (const response of pricingResponses) {
    const data = JSON.parse(response.body || '{}');
    if (this.isValidFordPricingData(data)) {
      await this.storeFordPricingResponse(vehicleName, vehicleCode, data, response.url);
      return { data, source: response.url };
    }
  }
  return null;
}
```

**Note**: Browser capture currently not finding pricing data as Ford's Build & Price app appears to use a different data loading mechanism (likely embedded in JS bundles or SSR'd).

### 7. Manual Variant Population (scripts/populate-ford-variants.mjs)
**Problem**: Ford pricing API blocked; automatic variant extraction not working.

**Solution**: Created manual population script with official Ford AU specs:
- **Ranger**: 7 variants (XL, XLS, XLT, Sport, Wildtrak, Platinum, Raptor)
- **Everest**: 5 variants (Ambiente, Trend, Sport, Wildtrak, Platinum)
- **Mustang**: 3 variants (GT Fastback, GT Convertible, Dark Horse)
- **F-150**: 3 variants (XLT, Lariat, Raptor)

Each variant includes:
- Pricing (drive-away AUD)
- Engine specifications
- Power/torque figures
- Transmission type
- Drivetrain
- Key features list

### 8. Color & Gallery Data Population (scripts/populate-ford-variants.mjs)
**Problem**: No automated source for color swatches and gallery images.

**Solution**: Manually populated 11 Ford colors:
```javascript
const fordColors = [
  { name: 'Arctic White', hex: '#F5F5F5', type: 'standard', price: 0 },
  { name: 'Shadow Black', hex: '#1A1A1A', type: 'standard', price: 0 },
  { name: 'Aluminium', hex: '#A8A8A8', type: 'metallic', price: 700 },
  { name: 'Blue Lightning', hex: '#0066CC', type: 'metallic', price: 700 },
  { name: 'Sedona Orange', hex: '#CC5500', type: 'premium', price: 950 },
  // ... etc
];
```

Gallery images field prepared but not populated (pending image URL sourcing).

### 9. Improved Logging (orchestrator.ts)
Added detailed logging throughout the extraction process:
- Product matching status
- Database insert/update results
- API response details
- Variant extraction counts

## API Endpoints Added

### POST /api/v1/oem-agent/admin/enrich-ford/:oemId
Enriches Ford products with variants using browser capture.

### POST /api/v1/oem-agent/admin/capture-ford-pricing
Captures Ford pricing API for a specific vehicle using browser automation.

Request body:
```json
{
  "vehicleCode": "Next-Gen_Ranger-test",
  "vehicleName": "Ranger"
}
```

## Data Structure

### Base Product (e.g., "Ranger")
```json
{
  "id": "...",
  "oem_id": "ford-au",
  "external_key": "Next-Gen_Ranger-test",
  "title": "Ranger",
  "body_type": "Trucks",
  "variants": [...],
  "meta_json": {
    "hasVariantData": true,
    "variantCount": 7,
    "availableColors": [...],
    "colorCount": 11
  }
}
```

### Variant Product (e.g., "Ranger XLT")
```json
{
  "id": "...",
  "oem_id": "ford-au",
  "external_key": "ranger-xlt",
  "title": "Ranger XLT",
  "parent_nameplate": "Ranger",
  "price_amount": 59990,
  "price_currency": "AUD",
  "key_features": ["18\" Alloy Wheels", "Dual-zone AC", ...],
  "meta_json": {
    "parentNameplate": "Ranger",
    "variantName": "XLT",
    "engine": "2.0L Bi-Turbo Diesel",
    "power": "154kW",
    "torque": "500Nm",
    "transmission": "10-Speed Automatic",
    "availableColors": [...]
  }
}
```

## Remaining Work

### Gallery Images
- **Status**: Not populated
- **Blocker**: Need reliable source for high-quality image URLs
- **Options**: 
  1. Scrape from Ford website HTML
  2. Use Ford's image CDN directly (if available)
  3. Upload images to R2 manually

### Missing Variant Data
The following vehicles don't have variant breakdowns yet:
- Ranger Raptor (separate from base Raptor variant)
- Ranger Hybrid
- Ranger Super Duty
- Mustang Mach-E
- E-Transit
- E-Transit Custom
- Transit Custom PHEV
- All Transit/Tourneo van models

### Pricing API Access
- **Current**: Using manually curated pricing
- **Ideal**: Automated extraction from Ford pricing API
- **Blocker**: API protected (403/empty responses)
- **Potential Solutions**:
  1. Reverse engineer Ford's internal API calls
  2. Partner with Ford for official API access
  3. Use browser automation with longer wait times for JS hydration

## Testing Commands

```bash
# Check Ford products in database
curl https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/debug/products/ford-au

# Trigger direct Ford extraction
curl -X POST https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/direct-extract/ford-au

# Capture pricing for specific vehicle
curl -X POST https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/capture-ford-pricing \
  -H "Content-Type: application/json" \
  -d '{"vehicleCode": "Next-Gen_Ranger-test", "vehicleName": "Ranger"}'

# Enrich all Ford products with variants
curl -X POST https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/enrich-ford/ford-au
```

## Files Modified
- `src/orchestrator.ts` - Core extraction and enrichment logic
- `src/routes/oem-agent.ts` - API endpoints
- `scripts/populate-ford-variants.mjs` - Manual variant population
- `scripts/check-ford-db.mjs` - Database verification

## Notes
- Base products are automatically extracted from `vehiclesmenu.data`
- Variant products are manually populated (Ford pricing API blocked)
- Colors are manually populated (11 standard Ford colors)
- Gallery images pending image URL sourcing
- Database constraint `(oem_id, title)` unique prevents duplicates
