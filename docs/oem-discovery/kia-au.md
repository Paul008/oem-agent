# OEM Discovery: Kia Australia

**OEM ID:** `kia-au`
**Discovered:** 2026-02-13
**Status:** 🟡 In Progress

## Build & Price Entry Points

| Page Type | URL | Notes |
|-----------|-----|-------|
| Configurator Index | https://www.kia.com/au/shopping-tools/build-and-price.html | Main entry |
| Variant Selection | https://www.kia.com/au/shopping-tools/build-and-price.trim.{model}.html | e.g., k4-hatch |
| Color Selection | https://www.kia.com/au/shopping-tools/build-and-price.color.{model}.{variant}.html | e.g., S |
| Options/Accessories | | TBD |
| Summary/Complete | https://www.kia.com/au/shopping-tools/build-and-price.complete.{model}.{variant}.{interior}.{color}.html | e.g., UD.WK |

## URL Patterns

```
Variant Selection: /shopping-tools/build-and-price.trim.{model}.html
Color Selection:   /shopping-tools/build-and-price.color.{model}.{variant}.html
Complete:          /shopping-tools/build-and-price.complete.{model}.{variant}.{interior}.{color}.html
```

**Example Flow (K4 Hatch):**
1. `build-and-price.trim.k4-hatch.html` - Select variant (S, GT-Line, etc.)
2. `build-and-price.color.k4-hatch.S.html` - Select color for S variant
3. `build-and-price.complete.k4-hatch.S.UD.WK.html` - Complete config (UD=interior, WK=color code)

## API Endpoints Discovered

### TODO: Investigate Network Tab
- [ ] Check for `/api/` calls during page load
- [ ] Look for Next.js `/_next/data/` routes
- [ ] Check for GraphQL endpoints

## DOM Selectors

### Variant Selection Page
| Element | Selector | Notes |
|---------|----------|-------|
| Variant Cards | TBD | |
| Variant Name | TBD | |
| Variant Price | TBD | |
| Variant Engine | TBD | |
| Select Button | TBD | |

### Color Selection Page
| Element | Selector | Notes |
|---------|----------|-------|
| Color Swatches | TBD | |
| Color Name | TBD | |
| Color Code | TBD | Encoded in URL (e.g., WK) |
| Price Delta | TBD | Some colors are +$695 |
| Swatch Image | TBD | |

### Common Elements
| Element | Selector | Notes |
|---------|----------|-------|
| Total Price | TBD | |
| Price Type Label | TBD | Driveaway/RRP |
| Disclaimer | TBD | Legal text at bottom |
| Features List | TBD | Standard features list |

## Extraction Strategy

- [ ] **Primary Method:** API / DOM / Hybrid
- [x] **Requires JS Render:** Yes (React SPA)
- [ ] **Requires Interaction:** TBD

### Interaction Steps (if required)
1. Navigate to variant selection
2. Click on variant card to see colors
3. Color prices may only show on hover/selection

## Data Mapping

| Our Field | Source Location | Transform |
|-----------|-----------------|-----------|
| variant.name | URL segment or DOM | e.g., "S" → "Kia K4 S" |
| variant.price_amount | DOM price element | Parse currency |
| variant.drivetrain | TBD | |
| variant.engine | TBD | |
| color.name | DOM or API | e.g., "Aurora Black Pearl" |
| color.code | URL segment | e.g., "WK" |
| color.price_delta | DOM price delta | 0 for standard, 695 for metallic |
| color.is_standard | Price delta check | price_delta === 0 |
| disclaimer_text | DOM disclaimer | |
| key_features | Features list | |

## Notes & Observations

- URL structure uses dot notation: `build-and-price.{step}.{params}.html`
- Color codes are 2-letter codes (WK, UD, etc.)
- Interior code appears in complete URL (UD = interior option)
- React-based SPA, requires full render

## Screenshots

- [ ] Variant selection page
- [ ] Color selection page
- [ ] Summary page with disclaimer

## Verification Checklist

- [ ] All variant prices extracted correctly
- [ ] All color options captured
- [ ] Color price deltas accurate
- [ ] Disclaimer text complete
- [ ] Key features list populated

---

## Raw Discovery Data

```json
{
  "oem_id": "kia-au",
  "entry_url": "https://www.kia.com/au/shopping-tools/build-and-price.html",
  "url_patterns": {
    "variant_selection": {
      "pattern": "/shopping-tools/build-and-price.trim.{model}.html",
      "example": "/shopping-tools/build-and-price.trim.k4-hatch.html"
    },
    "color_selection": {
      "pattern": "/shopping-tools/build-and-price.color.{model}.{variant}.html",
      "example": "/shopping-tools/build-and-price.color.k4-hatch.S.html"
    },
    "complete": {
      "pattern": "/shopping-tools/build-and-price.complete.{model}.{variant}.{interior}.{color}.html",
      "example": "/shopping-tools/build-and-price.complete.k4-hatch.S.UD.WK.html"
    }
  }
}
```
