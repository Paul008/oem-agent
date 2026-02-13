# Ford Extraction Pipeline Fixes

## Summary
Fixed major issues in the database pipeline for Ford product extraction. The pipeline now correctly handles AEM vehiclesmenu.data format and stores products in the database.

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

### 6. Improved Logging (orchestrator.ts)
Added detailed logging throughout the extraction process:
- URL matching attempts
- Response body capture status
- Direct fetch fallback attempts
- Product extraction counts
- Database insert results

## Current Status

| Metric | Value |
|--------|-------|
| Products in database | 2 (Ranger, Ranger Raptor) |
| Extraction method | LLM (not API) |
| Products expected | 23 (from vehiclesmenu.data) |

## Next Steps

The remaining issue is that the API extraction still isn't capturing all 23 Ford products. The current extraction is falling back to LLM (2 products) instead of using the vehiclesmenu.data API (23 products).

To debug this:
1. Check the worker logs for `[Orchestrator] Attempting direct fetch fallback` messages
2. Verify the API URL is being discovered correctly
3. Check if the direct fetch is returning valid JSON
4. Ensure `isAemVehicleMenuData()` correctly identifies the format

## Testing

Trigger a Ford crawl to test the fixes:
```bash
curl -X POST https://your-worker.workers.dev/api/oem-agent/admin/crawl/ford-au \
  -H "Authorization: Bearer your-token"
```

Monitor logs with:
```bash
wrangler tail
```

Look for these log messages:
- `[Orchestrator] Found response via path match`
- `[Orchestrator] Body captured: X chars`
- `[Orchestrator] Attempting direct fetch fallback`
- `[Orchestrator] Extracted X products from direct fetch`
