# KGM Offers Discovery Report

**Date**: February 20, 2026  
**OEM**: KGM Australia  
**API**: Payload CMS (payloadb.therefinerydesign.com)

## Summary

KGM stores offer/discount data directly in their existing `models` and `grades` collections in Payload CMS. No separate offers collection exists.

## Offer Fields Discovered

### 1. `models.abn_discount` (Model-Level ABN Discount)
- **Type**: Integer (negative number representing discount)
- **Scope**: Per vehicle model
- **Data**: 8/8 models have ABN discounts

**Current Values**:
| Model | ABN Discount |
|-------|-------------|
| Musso EV MY26 | -$800 |
| Musso MY26 | -$1,000 |
| Rexton MY26 | -$1,000 |
| Actyon | -$800 |
| Rexton MY24 | -$1,000 |
| Musso MY24 | -$1,000 |
| Torres | -$800 |
| Korando | -$1,000 |

**Pattern**: 
- MY26 models: $800-$1,000 discount
- MY24 models: $1,000 discount
- Typically $1,000 for trucks/SUVs, $800 for smaller vehicles

### 2. `models.pricing_offers` (Structured Offers)
- **Type**: Array (currently empty for all models)
- **Status**: Field exists but no active pricing offers
- **Potential**: Likely for promotional campaigns, finance offers, etc.

### 3. `grades.year_discount` (Grade-Level End-of-Year Discount)
- **Type**: Integer (discount amount)
- **Scope**: Per grade/variant
- **Data**: 0/26 grades currently have year-end discounts
- **Potential**: Seasonal discount field (likely activated near year-end)

## Collections Tested

**Existing (200 OK)**:
- ✅ `models` - Contains `abn_discount` and `pricing_offers`
- ✅ `grades` - Contains `year_discount`
- ✅ `pages` - Empty collection

**Non-Existent (404)**:
- ❌ `offers`
- ❌ `promotions`
- ❌ `specials`
- ❌ `deals`
- ❌ `banners`
- ❌ `campaigns`

## API Details

**Base URL**: `https://payloadb.therefinerydesign.com/api`  
**Auth**: None required (just Origin/Referer headers)

**Query for Offers**:
```javascript
// Get all models with ABN discounts
GET /api/models?depth=2&limit=100

// Get all grades with year discounts
GET /api/grades?depth=2&limit=100
```

**Response Structure**:
```json
{
  "docs": [
    {
      "id": 10,
      "name": "Musso EV MY26",
      "price": 60000,
      "abn_discount": -800,
      "pricing_offers": [],
      "grades": [...]
    }
  ]
}
```

## Database Storage Recommendations

### Option 1: Store in `offers` table
Map ABN discounts to our existing `offers` table:
- `offer_type`: "abn_discount"
- `title`: "ABN Holder Discount"
- `description`: Auto-generated per model
- `discount_amount`: Absolute value of `abn_discount`
- `valid_from` / `valid_to`: Current year bounds
- Scope: Link via `vehicle_models` (one-to-many)

### Option 2: Store in `variant_pricing` meta
Add `abn_discount` to `variant_pricing.meta_json`:
```json
{
  "abn_discount": 800,
  "year_discount": 0
}
```

### Recommendation: **Option 1** (offers table)
- Better UI visibility
- Separates pricing from offers
- Allows future expansion (finance offers, trade-in bonuses, etc.)
- Matches how other OEMs structure offers

## Seeding Strategy

1. Fetch all models with `depth=2` to get ABN discounts
2. For each model with `abn_discount`:
   - Create offer record in `offers` table
   - Link to all grades/variants of that model via `vehicle_models.id`
3. Monitor `pricing_offers` array for future promotional data
4. Check `year_discount` field quarterly for seasonal offers

## Notes

- **Negative Values**: `abn_discount` stored as negative integers (-800, -1000)
- **Empty Arrays**: `pricing_offers` field exists but currently unused
- **Seasonal**: `year_discount` likely activated in Q4 for year-end sales
- **Website**: Offers page exists (`/offers`) but has minimal client-side content
- **No Separate API**: Unlike other OEMs, KGM doesn't have dedicated offers endpoint

## Next Steps

1. ✅ Discovery complete
2. ⏳ Create seed script (`seed-kgm-offers.mjs`)
3. ⏳ Map to `offers` table schema
4. ⏳ Update dashboard UI to display ABN discounts

---

**Files Created**:
- `_probe-kgm-offers.mjs` - Initial collection probe
- `_probe-kgm-offers-html.mjs` - Website HTML analysis
- `_probe-kgm-offers-v2.mjs` - Field discovery in existing collections
- `_probe-kgm-offers-v3.mjs` - Detailed extraction and analysis
