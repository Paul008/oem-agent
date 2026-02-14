# Ford Color-Specific Gallery Investigation

**Date:** 2026-02-14  
**Status:** Investigation Complete - Partial Solution Implemented

---

## Summary

Investigated the possibility of extracting color-specific vehicle images from Ford's Build & Price configurator. Found that while colors and gallery images exist in the database, color-specific image mappings are not readily extractable through automated means.

---

## Current Database Status

### What's Available

| Data | Count | Status |
|------|-------|--------|
| Ford Products | 60 | ✅ Complete |
| Color Options | 641 | ✅ Complete |
| Product Gallery Images | 361 | ✅ Available |
| Color-Specific Images | 0 | ❌ Not Available |

### Color Structure

Colors are stored in `meta_json.availableColors` with this structure:
```json
{
  "name": "Arctic White",
  "hex": "#F5F5F5",
  "type": "standard",
  "price": 0
}
```

### Gallery Image Structure

Gallery images are stored in `meta_json.galleryImages` with GPAS GUID-based URLs:
```json
{
  "type": "exterior",
  "url": "https://www.gpas-cache.ford.com/guid/77a66546-7213-334f-a981-0a0d49d5a833.png",
  "alt": "Ranger exterior view",
  "category": "gallery"
}
```

---

## Investigation Methods Attempted

### 1. Browser Automation (Puppeteer)

**Scripts Created:**
- `scripts/investigate-color-images.mjs`
- `scripts/investigate-deep-color.mjs`
- `scripts/investigate-config-api.mjs`
- `scripts/investigate-ford-data.mjs`

**Approach:**
- Navigate to Ford Build & Price configurator (`/price/{vehicle}`)
- Capture all network requests
- Search for color-related data structures
- Attempt to interact with color selectors
- Look for embedded JSON/state data

**Results:**
- ✅ Found 110+ unique GPAS GUIDs on the page
- ❌ No direct color-to-image API endpoint accessible
- ❌ No `__NEXT_DATA__` or embedded state with color mappings
- ❌ Color selectors not easily identifiable via CSS selectors
- ❌ Configurator uses client-side rendering with protected APIs

### 2. Direct API Endpoint Testing

**Endpoints Tested:**
```
❌ /content/ford/au/en_au/nameplate-data/vehiclesmenu.data.json (404)
❌ /content/ford/au/en_au/configuration.data.json (404)
❌ /api/vehicleconfigurator/ (404)
❌ /api/vehicles (301 redirect)
❌ www.gpas-cache.ford.com/api/v1/images (401 - requires auth)
```

### 3. HTML/JavaScript Analysis

**Findings:**
- Ford configurator uses Next.js with code-splitting
- Data is likely loaded via authenticated API calls
- GPAS GUIDs found in page but without color context
- No embedded `window.__INITIAL_STATE__` or similar

---

## Key Findings

### 1. GPAS GUID System - UUID v3 (MD5-Based)

Ford uses a Global Product Asset System (GPAS) with GUID-based image URLs:
```
https://www.gpas-cache.ford.com/guid/{GUID}.png?catalogId={CATALOGID}
```

**Example URL:**
```
https://www.gpas-cache.ford.com/guid/77a66546-7213-334f-a981-0a0d49d5a833.png?catalogId=WAPAB-TEK-2025
```

**URL Structure:**
- **Base:** `https://www.gpas-cache.ford.com/guid/`
- **GUID:** UUID v3 (MD5-based, deterministic)
- **Extension:** `.png`
- **Query:** `catalogId={REGION}-{MODEL}-{YEAR}`

**Catalog ID Pattern:**
- `WAPAB` = Region code (WA = Western Australia, PAB = Pacific Australia Business?)
- `TEK` = Model code (TEK = Ranger Next-Gen)
- `2025` = Model year

### 2. UUID Analysis - Deterministic GUIDs

**Discovery:** All GUIDs are **UUID v3 (MD5-based)**, not random!

**What this means:**
- UUID v3 = `MD5(namespace + name)`
- Same input always produces same GUID
- Ford generates GUIDs from structured names

**Evidence:**
- GUID `0d8b1615-497c-3777-8148-ac08db299348` appears in **55 vehicles** (likely a placeholder/default)
- GUID `815b0630-6245-38...` appears in **5 vehicles**
- Pattern suggests namespace-based generation

**Implication:** If we knew Ford's namespace and naming convention (e.g., `ranger-arctic-white-front`), we could theoretically generate the GUIDs without API access!

### 2. Ford's Architecture

```
┌─────────────────────────────────────────┐
│  Ford Build & Price Configurator        │
│  (Next.js SPA)                          │
└────────────┬────────────────────────────┘
             │
             ▼ API calls (authenticated)
┌─────────────────────────────────────────┐
│  Ford Configurator API                  │
│  (Protected, server-side)               │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  GPAS Image Service                     │
│  (Requires authentication)              │
└─────────────────────────────────────────┘
```

### 3. Why Extraction Failed

1. **No Public API:** Ford's configurator API requires authentication/session tokens
2. **GUIDs Don't Encode Color:** The GUIDs are hashes, not human-readable color codes
3. **Client-Side Rendering:** Data loaded dynamically via JavaScript after page load
4. **Bot Protection:** Some endpoints return 403 when accessed programmatically
5. **No Direct Color-GUID API:** The color→GUID mapping is likely internal to Ford's configurator

### 4. How Ford's Configurator Actually Works

Based on network analysis, here's the likely architecture:

```
User Selects Color
       │
       ▼
Ford Configurator (Next.js SPA)
       │
       ▼ POST /api/configurator/v1/build (Authenticated)
       │   Body: { vehicle: "ranger", variant: "XLT", color: "arctic-white" }
       │
       ▼ Response: { exteriorImages: [{ guid: "...", angle: "front" }] }
       │
       ▼ Ford renders: https://www.gpas-cache.ford.com/guid/{GUID}.png
```

**Key Insight:** The GUIDs are likely pre-computed and stored in Ford's database. When you select a color, the API returns the corresponding GUIDs - there's no URL construction based on IDs.

---

## Solution Options

### Option 1: Manual Color-GUID Mapping (Recommended)

**Approach:**
1. Open Ford configurator for each vehicle
2. Select a model variant (XL, XLT, Sport, etc.)
3. Select each color
4. Use browser DevTools Network tab to capture the GUIDs from API responses
5. Store color→GUID mappings in database

**Example Capture Process:**
```javascript
// In browser console while on Ford configurator
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('gpas-cache'))
  .map(r => r.name)
```

**Pros:**
- Accurate color-specific images
- Full control over image selection
- No dependency on Ford's API access

**Cons:**
- Time-intensive: ~641 colors × 3-5 images = ~2,000-3,000 GUIDs
- Manual work for each new vehicle/color

**Estimated Time:** 2-3 days for current 60 products

**Tools Needed:**
- Browser with DevTools
- Script to organize captured GUIDs
- Database update script

### Option 2: Ford GPAS API Access

**Approach:**
1. Contact Ford for official GPAS API access
2. Use API to query images by color code

**Pros:**
- Automated
- Official source
- Most reliable long-term

**Cons:**
- Requires Ford partnership/approval
- Unknown if such API is available to third parties
- May require legal agreements

**Contact:** Ford Australia Developer Relations or Fleet API team

### Option 3: Image Recognition/AI

**Approach:**
1. Download all gallery images
2. Use image recognition to classify by color
3. Map classified images to color options

**Pros:**
- Automated
- Works with existing data

**Cons:**
- May be inaccurate
- Requires ML model training
- Complexity overhead

### Option 4: Generic Gallery (Current)

**Approach:**
- Use the same gallery images for all colors
- Images show vehicle but not in specific color

**Pros:**
- Already implemented
- No additional work

**Cons:**
- Users can't see vehicle in their selected color
- Not true color visualization

---

### Option 5: UUID Namespace Reverse Engineering (Speculative)

**Approach:**
1. Analyze existing GUIDs to find pattern
2. Determine Ford's UUID namespace
3. Discover their naming convention
4. Generate GUIDs for un-captured colors

**What we know:**
- GUIDs are UUID v3 (MD5-based)
- Generated from `MD5(namespace + name)`
- Example: `ranger-arctic-white-front` → GUID

**Pros:**
- Could generate unlimited color-specific GUIDs
- No API access needed
- Fully automated once cracked

**Cons:**
- Very difficult to reverse engineer
- Ford's namespace is unknown
- Naming convention is internal

**Status:** Attempted - could not determine namespace with available data

---

## Recommendation

### Immediate (Current State)
✅ **Keep the generic gallery approach.** 

The database has:
- 60 Ford products
- 641 color options
- 361 gallery images (but not color-specific)

This is sufficient for a functional product catalog.

### Short-Term (If Color Visualization Needed)
📋 **Implement Option 1 - Manual Mapping** for top 5 vehicles:
- Ranger (~15 colors × 5 images = 75 images)
- Everest (~15 colors × 5 images = 75 images)
- Mustang (~15 colors × 5 images = 75 images)
- F-150 (~15 colors × 5 images = 75 images)
- Transit Custom (~11 colors × 5 images = 55 images)

**Total:** ~355 images to capture
**Time:** 1-2 days

### Long-Term
🤝 **Reach out to Ford Australia** for:
1. Official GPAS API access
2. Bulk color-to-GUID mapping export
3. Partnership for automated data feed

---

## Conclusion

**Ford achieves color selection through:**
1. **Authenticated API** - Their configurator makes authenticated API calls
2. **Pre-computed GUIDs** - Color→GUID mappings stored in their database
3. **UUID v3 Generation** - Deterministic GUIDs (possibly from namespace + color name)

**Not URL construction** - The GUIDs are not dynamically generated from color codes in the URL. They're looked up from a database mapping.

**Bottom Line:** Ford's system requires either:
- Manual capture of GUIDs (Option 1)
- Official API access (Option 2)
- Or accepting generic galleries (Option 4)

---

## Files Created During Investigation

| File | Purpose |
|------|---------|
| `scripts/investigate-color-galleries.mjs` | Initial investigation script |
| `scripts/analyze-ford-builder.mjs` | Analyzed Ford's configurator implementation |
| `scripts/extract-api-from-js.mjs` | Extracted API patterns from JS bundles |
| `scripts/capture-color-api.mjs` | Captured live API calls using CDP |
| `scripts/analyze-guid-patterns.mjs` | Analyzed GPAS GUID patterns |
| `scripts/reverse-engineer-uuid.mjs` | Attempted UUID namespace reverse engineering |
| `docs/FORD_COLOR_GALLERY_INVESTIGATION.md` | This investigation report |

---

## Database Structure for Future Color Images

When color-specific images are available, they should be stored as:

```json
{
  "availableColors": [
    {
      "name": "Arctic White",
      "hex": "#F5F5F5",
      "type": "standard",
      "price": 0,
      "galleryImages": [
        {
          "type": "exterior",
          "angle": "front",
          "url": "https://www.gpas-cache.ford.com/guid/{GUID-FOR-WHITE-FRONT}.png"
        },
        {
          "type": "exterior",
          "angle": "side",
          "url": "https://www.gpas-cache.ford.com/guid/{GUID-FOR-WHITE-SIDE}.png"
        },
        {
          "type": "interior",
          "url": "https://www.gpas-cache.ford.com/guid/{GUID-FOR-INTERIOR}.png"
        }
      ]
    }
  ]
}
```

---

## Next Steps

1. **Decision Required:** Choose which option to pursue for color-specific images
2. **If Option 1:** Create a tool/script to help with manual GUID capture
3. **If Option 2:** Draft outreach to Ford Australia
4. **If Option 3:** Research image recognition libraries
5. **If Option 4:** No action needed - current implementation is sufficient
