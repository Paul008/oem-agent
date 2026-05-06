# Suzuki Australia Vehicle Color Data Discovery Report

**Date:** 2026-02-20
**OEM:** Suzuki Australia
**Status:** ✅ Complete - Comprehensive color data discovered

---

## Executive Summary

Successfully discovered **comprehensive vehicle color data** for all Suzuki Australia variants via the finance calculator JSON endpoint. All 15 variants have complete color specifications including:

- ✅ Color names
- ✅ Hex codes
- ✅ Color types (Solid, Metallic, Pearl, Two-Tone)
- ✅ Two-tone configuration
- ✅ Per-state extra costs
- ✅ High-quality product images (WebP format)
- ✅ Image metadata (alt text, dimensions, responsive sizes)

---

## Data Source

### Primary Endpoint

```
https://www.suzuki.com.au/suzuki-finance-calculator-data.json
```

**Authentication:** None required
**Format:** JSON
**Caching:** Static S3/CloudFront hosting
**Update Frequency:** Unknown (likely monthly with model updates)

### Data Structure

```
models[]
  ├─ model: string (e.g., "Swift Hybrid")
  ├─ modelID: number (e.g., 10475)
  └─ modelVariants[]
      ├─ variant: string (e.g., "Swift Hybrid GL")
      ├─ variantID: number (e.g., 10651)
      ├─ price: { ACT, NSW, VIC, QLD, WA, SA, TAS, NT }
      └─ paintColours[]
          ├─ name: string
          ├─ hex: string (CSS hex color)
          ├─ twoToned: boolean
          ├─ secondHex: string (for two-tone colors)
          ├─ type: string ("Solid" | "Premium/Metallic" | "Two-Tone Metallic")
          ├─ extraCost: { ACT, NSW, VIC, QLD, WA, SA, TAS, NT }
          └─ image: { alt, title, sizes: { default, large-up } }
```

---

## Statistics

### Coverage

- **Total models:** 7
- **Total variants:** 15
- **Total colors:** 95
- **Coverage:** 100% (all variants have color data)

### Color Distribution

- **Solid colors:** 15 (15.8%)
- **Metallic/Pearl colors:** 58 (61.1%)
- **Two-tone colors:** 22 (23.2%)

### Pricing

- **Extra cost range:** $645 - $1,345 AUD
- **Free colors:** 15 (15.8%)
- **Premium colors:** 80 (84.2%)

### Image Assets

- **Format:** WebP (optimized for web)
- **Resolutions:** 2 sizes per color
  - Default: 636×346px
  - Large: 932×507px
- **Quality:** High-resolution hero images
- **View:** Front 3/4 angle consistent across all models

---

## Database Schema Mapping

### Target Table: `variant_colors`

| Database Column   | Source Field                          | Example Value                                                      |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------ |
| `product_id`      | JOIN via `variantID`                  | `(SELECT id FROM products WHERE external_key = 'suzuki-au-10651')` |
| `name`            | `paintColour.name`                    | `"Pure White Pearl"`                                               |
| `hex_code`        | `paintColour.hex`                     | `"#f7f7f8"`                                                        |
| `type`            | `paintColour.type`                    | `"Solid"`                                                          |
| `is_two_tone`     | `paintColour.twoToned`                | `false`                                                            |
| `second_hex_code` | `paintColour.secondHex`               | `null` or `"#000000"`                                              |
| `extra_cost_nsw`  | `paintColour.extraCost.NSW`           | `0`                                                                |
| `extra_cost_vic`  | `paintColour.extraCost.VIC`           | `0`                                                                |
| `extra_cost_qld`  | `paintColour.extraCost.QLD`           | `0`                                                                |
| `extra_cost_wa`   | `paintColour.extraCost.WA`            | `0`                                                                |
| `extra_cost_sa`   | `paintColour.extraCost.SA`            | `0`                                                                |
| `extra_cost_tas`  | `paintColour.extraCost.TAS`           | `0`                                                                |
| `extra_cost_act`  | `paintColour.extraCost.ACT`           | `0`                                                                |
| `extra_cost_nt`   | `paintColour.extraCost.NT`            | `0`                                                                |
| `image_url`       | `paintColour.image.sizes.default.src` | `"https://www.suzuki.com.au/..."`                                  |
| `meta_json`       | Full image object                     | `{ image, offer, disclaimer }`                                     |

### Key Mapping Considerations

1. **Product Matching**
   - Source uses `variantID` (numeric)
   - DB uses `external_key` (string pattern: `suzuki-au-{variantID}`)
   - JOIN required: `SELECT id FROM products WHERE external_key = 'suzuki-au-' || variantID`

2. **Color Type Normalization**
   - Source: `"Solid"`, `"Premium/Metallic"`, `"Two-Tone Metallic"`
   - Recommend standardizing to: `"Solid"`, `"Metallic"`, `"Pearl"`, `"Two-Tone"`

3. **Two-Tone Handling**
   - Two-tone colors have `twoToned: true` AND populated `secondHex`
   - Store both `hex` (primary) and `secondHex` (roof/accent)
   - Type should be `"Two-Tone Metallic"` or similar

4. **Image Storage**
   - Store `default` size URL in `image_url` column
   - Store full `image` object in `meta_json` for responsive rendering
   - Include `alt`, `title`, and `webp` URLs for accessibility

---

## Sample Data

### Example 1: Solid Color (No Extra Cost)

```json
{
  "name": "Pure White Pearl",
  "twoToned": false,
  "hex": "#f7f7f8",
  "secondHex": "",
  "extraCost": {
    "ACT": 0,
    "NSW": 0,
    "VIC": 0,
    "QLD": 0,
    "WA": 0,
    "SA": 0,
    "TAS": 0,
    "NT": 0
  },
  "type": "Solid",
  "image": {
    "alt": "Front Suzuki Swift Hybrid in a \"Pure White Pearl\" colour",
    "title": "Front Suzuki Swift Hybrid in a \"Pure White Pearl\" colour",
    "sizes": {
      "default": {
        "src": "https://www.suzuki.com.au/wp-content/uploads/2024/06/SUZ713-SwiftHybrid-WebsiteSpinners-3160x1720-2024-PureWhite-F34-copy-636x346.webp",
        "width": 636,
        "height": 346
      }
    }
  }
}
```

### Example 2: Premium Metallic Color (With Extra Cost)

```json
{
  "name": "Premium Silver Metallic",
  "twoToned": false,
  "hex": "#a4a5ab",
  "secondHex": "",
  "extraCost": {
    "ACT": 645,
    "NSW": 645,
    "VIC": 645,
    "QLD": 645,
    "WA": 645,
    "SA": 645,
    "TAS": 645,
    "NT": 645
  },
  "type": "Premium/Metallic"
}
```

### Example 3: Two-Tone Color

```json
{
  "name": "Frontier Blue Pearl Metallic with Black Roof",
  "twoToned": true,
  "hex": "#0a2b4d",
  "secondHex": "#000000",
  "extraCost": {
    "ACT": 1345,
    "NSW": 1345,
    "VIC": 1345,
    "QLD": 1345,
    "WA": 1345,
    "SA": 1345,
    "TAS": 1345,
    "NT": 1345
  },
  "type": "Two-Tone Metallic"
}
```

---

## Implementation Notes

### Variant ID Matching

Current DB products use `external_key` pattern but actual keys need verification:

```sql
-- Check current Suzuki product external_keys
SELECT external_key, name
FROM products
WHERE external_key LIKE 'suzuki-au-%'
ORDER BY external_key;
```

If keys don't match `suzuki-au-{variantID}` pattern, will need to:

1. Query existing keys
2. Build mapping from variant names to product IDs
3. Update seed script to use name-based matching

### Color Uniqueness

- **Per-product uniqueness:** Each variant can have different color options
- **Constraint:** `UNIQUE(product_id, name)` recommended
- **Duplicates:** Same color name may appear across variants with different images

### State-Based Pricing

- All 8 Australian states/territories represented
- Extra costs are **consistent** across all states for each color
- No regional color availability restrictions observed

### Image Optimization

- WebP format already optimized (modern, compressed)
- Consider caching/mirroring to own CDN for reliability
- Alt text provided for accessibility compliance

---

## Next Steps

1. **Create seed script:** `seed-suzuki-colors.mjs`
2. **Verify product mapping:** Confirm `external_key` format matches `variantID`
3. **Test mapping logic:** Ensure all 15 variants map to existing products
4. **Execute seed:** Insert 95 color records into `variant_colors` table
5. **Validate results:** Query to confirm 100% coverage

### Seed Script Requirements

- Fetch finance data from JSON endpoint
- Map `variantID` to `product_id` via `external_key`
- Transform color objects to DB schema
- Handle two-tone colors properly
- Store complete image metadata in `meta_json`
- Insert with conflict handling (ON CONFLICT DO UPDATE)

---

## Probe Scripts Created

1. **probe-suzuki-vehicle-colors.mjs**
   - Initial discovery script
   - Checked model pages and CDN patterns
   - Identified 301 redirects (expected with static S3 hosting)

2. **probe-suzuki-vehicle-colors-v2.mjs**
   - Enhanced with redirect following
   - Deep JSON object search
   - Successfully discovered `paintColours` arrays

3. **inspect-suzuki-colors.mjs / v2**
   - Detailed structure inspection
   - Confirmed 100% coverage
   - Analyzed color properties

4. **suzuki-color-mapping.mjs**
   - Database schema mapping analysis
   - Sample SQL generation
   - Statistics and recommendations

---

## Conclusion

✅ **Discovery Status:** Complete
✅ **Data Quality:** Excellent (complete, structured, with images)
✅ **Coverage:** 100% of variants
✅ **Ready for Implementation:** Yes

Suzuki Australia provides **comprehensive, well-structured color data** via a single JSON endpoint. All required fields for the `variant_colors` table are available with high-quality image assets and per-state pricing.

**Recommendation:** Proceed with seed script implementation.
