# OEM Discovery: {OEM_NAME}

**OEM ID:** `{oem_id}`
**Discovered:** {date}
**Status:** 🔴 Not Started | 🟡 In Progress | 🟢 Complete

## Build & Price Entry Points

| Page Type | URL | Notes |
|-----------|-----|-------|
| Configurator Index | | |
| Model Selection | | |
| Variant Selection | | |
| Color Selection | | |
| Options/Accessories | | |
| Summary/Complete | | |

## URL Patterns

```
Variant Selection: /path/to/{model}/{variant}
Color Selection:   /path/to/{model}/{variant}/{color}
Complete:          /path/to/{model}/{variant}/{color}/{options}
```

## API Endpoints Discovered

### Variants API
- **URL:**
- **Method:** GET
- **Provides:** variants, prices
- **Sample Response:**
```json
{
}
```

### Colors API
- **URL:**
- **Method:** GET
- **Provides:** colors, price_deltas
- **Sample Response:**
```json
{
}
```

## DOM Selectors

### Variant Selection Page
| Element | Selector | Notes |
|---------|----------|-------|
| Variant Cards | | |
| Variant Name | | |
| Variant Price | | |
| Variant Engine | | |
| Select Button | | |

### Color Selection Page
| Element | Selector | Notes |
|---------|----------|-------|
| Color Swatches | | |
| Color Name | | |
| Color Code | | |
| Price Delta | | |
| Swatch Image | | |

### Common Elements
| Element | Selector | Notes |
|---------|----------|-------|
| Total Price | | |
| Price Type Label | | |
| Disclaimer | | |
| Features List | | |

## Extraction Strategy

- [ ] **Primary Method:** API / DOM / Hybrid
- [ ] **Requires JS Render:** Yes / No
- [ ] **Requires Interaction:** Yes / No

### Interaction Steps (if required)
1.
2.
3.

## Data Mapping

| Our Field | Source Location | Transform |
|-----------|-----------------|-----------|
| variant.name | | |
| variant.price_amount | | |
| variant.drivetrain | | |
| variant.engine | | |
| color.name | | |
| color.code | | |
| color.price_delta | | |
| color.is_standard | | |
| disclaimer_text | | |
| key_features | | |

## Notes & Observations

-
-

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
