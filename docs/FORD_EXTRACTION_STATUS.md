# Ford AU Product Extraction - Status Document

## Overview

This document explains the current state of the Ford AU product extraction pipeline and what needs to be fixed.

## Architecture

```
Ford Homepage → Headless Browser (Smart Mode) → Network Interception → API Discovery → Extraction → Database
     ↓                    ↓                           ↓                    ↓              ↓
https://ford.com.au   Puppeteer CDP            vehiclesmenu.data    23 Products    products table
```

## Current State

### What's Working

1. **Smart Mode Rendering** ✅
   - Headless browser launches successfully
   - Pages are rendered with JavaScript execution
   - Network requests are being intercepted

2. **API Discovery** ✅
   - `vehiclesmenu.data` is discovered with 100% confidence
   - Data type correctly classified as "products"
   - APIs stored in `discovered_apis` table

3. **Local Extraction** ✅
   - Test script (`scripts/test-ford-extraction.ts`) extracts 23 products correctly
   - `isAemVehicleMenuData()` correctly detects Ford's format
   - `extractAemVehicleMenuItems()` extracts all nameplates

4. **LLM Fallback** ✅
   - LLM extraction working (finds 2 products from HTML)
   - Extraction result returned with method="llm"

### What's NOT Working

1. **API Extraction in Worker** ❌
   - Products come from LLM (2 products) instead of API (23 products)
   - `networkResponses` array may not contain vehiclesmenu.data body
   - OR URL matching between `apiCandidates` and `networkResponses` failing

2. **Product Database Insert** ❌
   - Products extracted but not saved to database
   - Despite extraction showing 2 products, `products` table has 0
   - Possible database schema mismatch (fixed `meta` → `meta_json`)

## Technical Details

### Ford's vehiclesmenu.data Structure

```json
[
  {
    "category": "Trucks",
    "nameplates": [
      {
        "code": "Next-Gen_Ranger-test",
        "name": "Ranger",
        "image": "/content/dam/Ford/au/nameplate/ranger/...",
        "path": "/au/en_au/home/trucks-and-vans/ranger.html",
        "pricing": { "min": { "price": 0 } },
        "bodyType": ["Pickup"],
        "vehicleType": ["Truck"]
      }
    ]
  },
  // ... 5 more categories (SUV, Commercial, Electric, etc.)
]
```

### Key Files

| File | Purpose |
|------|---------|
| [orchestrator.ts](src/orchestrator.ts) | Main extraction logic |
| [orchestrator.ts:471](src/orchestrator.ts#L471) | AEM check runs FIRST (fixed) |
| [orchestrator.ts:535](src/orchestrator.ts#L535) | `isAemVehicleMenuData()` |
| [orchestrator.ts:572](src/orchestrator.ts#L572) | `extractAemVehicleMenuItems()` |
| [orchestrator.ts:372](src/orchestrator.ts#L372) | `extractFromDiscoveredApis()` |
| [orchestrator.ts:1662](src/orchestrator.ts#L1662) | `upsertProduct()` |

### Extraction Flow

```
1. crawlPage()
2. fetchHtml() - cheap check
3. shouldRender() → true for Ford (requiresBrowserRendering flag)
4. renderPageSmartMode() - launches Puppeteer
   - Captures network responses including vehiclesmenu.data
   - Analyzes API candidates
5. extractFromDiscoveredApis() ← ISSUE HERE
   - Looks for vehiclesmenu.data in networkResponses
   - Should parse JSON and extract 23 products
6. processChanges()
   - Calls upsertProduct() for each product
7. Database insert ← ALSO FAILING
```

## Issues to Fix

### Issue 1: API Extraction Not Working

**Symptom**: `productsMethod: "llm"` instead of `"api"`

**Investigation Needed**:
1. Check if `networkResponses` contains vehiclesmenu.data response
2. Check if response body is being captured
3. Check URL matching between candidates and responses

**Debug Logging Added** (line 388-410):
```javascript
console.log(`[Orchestrator] Total networkResponses: ${smartModeResult.networkResponses.length}`);
console.log(`[Orchestrator] Found response: ${response ? 'yes' : 'no'}, body length: ${response?.body?.length || 0}`);
```

### Issue 2: Products Not Saved to Database

**Symptom**: Extraction shows 2 products, database has 0

**Investigation Needed**:
1. Check if `upsertProduct()` is being called
2. Check for database errors during insert
3. Verify column names match schema

**Fix Applied**:
- Changed `meta` → `meta_json` in upsertProduct

## Debug Endpoints

```bash
# Trigger debug crawl with extraction result
curl -X POST "https://oem-agent.adme-dev.workers.dev/api/oem-agent/admin/debug-crawl/ford-au" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.ford.com.au/"}'

# Check products
curl "https://oem-agent.adme-dev.workers.dev/api/oem-agent/admin/products/ford-au"

# Check discovered APIs
curl "https://oem-agent.adme-dev.workers.dev/api/oem-agent/admin/discovered-apis/ford-au"

# Monitor logs
npx wrangler tail --format pretty
```

## Expected Outcome

When fully working:
- **Products Count**: 23 (not 2)
- **Products Method**: "api" (not "llm")
- **Database**: 23 products in `products` table

## Next Steps

1. **Enable detailed logging** to see what's in networkResponses
2. **Fix response body capture** for vehiclesmenu.data
3. **Debug database insert** to find why products aren't saving
4. **Verify end-to-end** with scheduled crawl

## Commits

- `a46e91b` - Initial extraction fix (AEM check order)
- `8e419262` - Added extraction result to debug endpoint
- `6e7bea8b` - Added error logging to processChanges
- `a146c644` - Fixed meta_json column name

---
Last Updated: 2026-02-13
