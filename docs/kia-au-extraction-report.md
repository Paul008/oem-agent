# Kia Australia — Full Extraction Report

**Date:** 2026-02-18
**Source:** https://www.kia.com/au/shopping-tools/build-and-price.html
**Method:** AEM HTML parsing (no browser rendering required for data extraction)

## Summary

- **24 model entries** in the configurator (some are MY variants of the same model)
- **~130 unique trim/variant combinations** across all models
- **42 unique exterior color codes** mapped to names
- **Extraction method:** Static HTML + AEM `jcr:content.json` — no JS rendering needed

---

## API & Data Endpoints

### Discovered Endpoints

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/api/kia_australia/common/trimPrice.selectPriceByTrim` | GET | Params: `regionCode`, `modelCode`, `trimCode`. Returns pricing when postcode is set. |
| `/au/shopping-tools/build-and-price/jcr:content.json` | GET | AEM content node — returns page metadata |
| `/au/shopping-tools/build-and-price.trim.{model}.html` | GET | Trim/variant data embedded in HTML |
| `/au/shopping-tools/build-and-price.color.{model}.{trimCode}.html` | GET | Color data embedded in HTML |
| `/au/shopping-tools/build-and-price.complete.{model}.{trimCode}.{extColor}.{intColor}.html` | GET | Complete config summary |

### Extraction Approach: **Static HTML Parsing (No Browser Needed)**

The AEM pages embed all variant and color data directly in the HTML:
- **Trims:** `<label path="{trimCode}">{trimName}</label>` inside `.trim_list`
- **Colors:** `<li class="color_l" path="{colorCode}" color="{colorCode}">` with `<img alt="{colorName}">` inside `.color_list`
- **Interior:** `<label path="{intCode}">` with `<img alt="{interiorName}">` inside `.option_list`

This means we can extract everything with simple HTTP GET + regex — **no CDP/Puppeteer/browser rendering required**.

---

## Color Code Master Table

| Code | Color Name | Type |
|------|-----------|------|
| 4SS | Silky Silver | Metallic |
| A2G | Adventurous Green | Metallic |
| ABP | Aurora Black Pearl | Pearl |
| ACW | Honeydew | Solid |
| ACX | Yacht Blue | Metallic |
| AG3 | Matcha Green | Metallic |
| AG9 | Interstellar Grey | Metallic |
| AGT | Interstellar Grey | Metallic |
| B3A | Neptune Blue | Metallic |
| B4U | Gravity Blue | Metallic |
| BEG | Signal Red | Solid |
| BN4 | Volcanic Sand Brown | Metallic |
| C4S | Ceramic Grey | Metallic |
| C7R | Flare Red | Metallic |
| CGE | Cityscape Green | Metallic |
| CR5 | Runway Red | Metallic |
| D2U | Astra Blue | Metallic |
| DFG | Pebble Grey | Matte |
| DM4 | Honeydew | Solid |
| DU3 | Yacht Blue | Metallic |
| EBB | Frost Blue | Metallic |
| EBD | Shale Grey | Metallic |
| FSB | Fusion Black | Metallic |
| GLB | Glacier | Matte |
| IEG | Iceberg Green | Metallic |
| ISG | Ivory Silver | Metallic |
| KCS | Sparkling Silver | Metallic |
| KDG | Gravity Grey | Metallic |
| KLG | Steel Grey | Metallic |
| M3R | Mars Orange | Metallic |
| M4B | Mineral Blue | Metallic |
| M7G | Astro Grey | Metallic |
| M9Y | Milky Beige | Metallic |
| NNB | Starry Night Black | Pearl |
| OVR | Magma Red | Metallic |
| P2M | Panthera Metal | Metallic |
| PLU | Pluton Blue | Metallic |
| R4R | Fiery Red | Metallic |
| SPB | Sporty Blue | Metallic |
| SWP | Snow White Pearl | Pearl |
| TCT | Terracotta | Metallic |
| UD | Clear White | Solid |
| WVB | Wave Blue | Metallic |

---

## Models & Variants

### 1. Carnival

| Trim Code | Trim Name | Fuel |
|-----------|-----------|------|
| KA4PESP | S | Petrol |
| KA4PESPP | Sport | Petrol |
| KA4PESPPP | Sport+ | Petrol |
| KA4PEGTLLP | GT-Line Lite | Petrol |
| KA4PEGTLP | GT-Line | Petrol |
| KA4PESD | S | Diesel |
| KA4PESPD | Sport | Diesel |
| KA4PESPPD | Sport+ | Diesel |
| KA4PEGTLLD | GT-Line Lite | Diesel |
| KA4PEGTLD | GT-Line | Diesel |

**Colors:** C4S (Ceramic Grey), D2U (Astra Blue), C7R (Flare Red), P2M (Panthera Metal), SWP (Snow White Pearl)

### 2. Carnival Hybrid

| Trim Code | Trim Name |
|-----------|-----------|
| SHEV | S Hybrid |
| SPPHEV | Sport+ Hybrid |
| GTLHEV | GT-Line Hybrid |

**Colors:** C4S, D2U, C7R, P2M, SWP (same as Carnival)
**Interior:** Black & Taupe (Cloth)

### 3. EV3

| Trim Code | Trim Name |
|-----------|-----------|
| AIR-SR | Air - Standard Range |
| AIR-LR | Air - Long Range |
| EAR-LR | Earth |
| GTL-LR | GT-Line |

**Colors:** UD (Clear White), SWP (Snow White Pearl), ISG (Ivory Silver), ABP (Aurora Black Pearl), EBD (Shale Grey), EBB (Frost Blue), AG3 (Matcha Green), TCT (Terracotta)

### 4. EV4 Sedan

| Trim Code | Trim Name |
|-----------|-----------|
| AIR | Air |
| EARTH | Earth |
| GT-Line | GT-Line |

**Colors:** UD (Clear White), SWP (Snow White Pearl), ISG (Ivory Silver), ABP (Aurora Black Pearl), EBD (Shale Grey), ACX (Yacht Blue), ACW (Honeydew), OVR (Magma Red)

### 5. EV5

| Trim Code | Trim Name |
|-----------|-----------|
| AIR-SR | Air - Standard Range |
| AIR-LR | Air - Long Range |
| EARTH-LR | Earth |
| GTLINE-LR | GT-Line |
| GTLINE-LRT | GT-Line Two-Tone |

**Colors:** UD (Clear White), SWP (Snow White Pearl), EBB (Frost Blue), EBD (Shale Grey), NNB (Starry Night Black)

### 6. EV6 (New)

| Trim Code | Trim Name |
|-----------|-----------|
| AIR-SR | Air |
| GTL-RWD | GT-Line RWD |
| GTL-AWD | GT-Line AWD |
| GT-AWD | GT |

**Colors:** CR5 (Runway Red), SWP (Snow White Pearl), ABP (Aurora Black Pearl), AGT (Interstellar Grey), DU3 (Yacht Blue), GLB (Glacier)
**Interior:** Black Artificial Leather

### 7. EV6 MY24

| Trim Code | Trim Name |
|-----------|-----------|
| AIR | Air |
| GTLINERWD | GT-Line RWD |
| GTLINEAWD | GT-Line AWD |
| GTLINERWDK | GT-Line RWD Matte Paint |
| GTLINEAWDK | GT-Line AWD Matte Paint |
| GTAWD | GT AWD |
| GTAWDKLM | GT AWD Matte Paint |

**Colors:** CR5 (Runway Red), GLB (Glacier), KLG (Steel Grey), DU3 (Yacht Blue), SWP (Snow White Pearl), ABP (Aurora Black Pearl)
**Interior:** Black with Light Grey Cloth Headliner

### 8. EV9

| Trim Code | Trim Name |
|-----------|-----------|
| AIR | Air |
| EARTH | Earth |
| GTLINE | GT-Line |

**Colors:** C7R (Flare Red), SWP (Snow White Pearl), P2M (Panthera Metal), ABP (Aurora Black Pearl), DFG (Pebble Grey), IEG (Iceberg Green)
**Interior:** Black artificial leather

### 9. K4 Hatch

| Trim Code | Trim Name |
|-----------|-----------|
| S | S |
| SSP | S with Safety Pack |
| SP | Sport |
| SPP | Sport+ |
| GTL | GT-Line |

**Colors:** UD (Clear White), SWP (Snow White Pearl), KLG (Steel Grey), ABP (Aurora Black Pearl), AG9 (Interstellar Grey), DM4 (Honeydew), WVB (Wave Blue), R4R (Fiery Red)

### 10. K4 Sedan

| Trim Code | Trim Name |
|-----------|-----------|
| S | S |
| S-SP | S with Safety Pack |
| SP | Sport |
| SPP | Sport+ |
| GTL | GT-Line |

**Colors:** UD, SWP, KLG, ABP, AG9, DM4, WVB, R4R (same as K4 Hatch)

### 11. Niro EV

| Trim Code | Trim Name |
|-----------|-----------|
| SG2-EV-S | S |
| SG2-EV-GTL | GT-Line |

**Colors:** UD (Clear White), M4B (Mineral Blue), CGE (Cityscape Green), KLG (Steel Grey), ABP (Aurora Black Pearl), SWP (Snow White Pearl), AGT (Interstellar Grey), CR5 (Runway Red)

### 12. Niro Hybrid

| Trim Code | Trim Name |
|-----------|-----------|
| SG2-HEV-S | S |
| SG2HEVGTL | GT-Line |

**Colors:** UD, M4B, CGE, KLG, ABP, SWP, AGT, CR5 (same as Niro EV)

### 13. Picanto

| Trim Code | Trim Name |
|-----------|-----------|
| SP-M | Sport Manual |
| SP-A | Sport Automatic |
| GTL-M | GT-Line Manual |
| GTL-A | GT-Line Automatic |

**Colors:** UD (Clear White), KCS (Sparkling Silver), M7G (Astro Grey), ABP (Aurora Black Pearl), BEG (Signal Red), A2G (Adventurous Green), M9Y (Milky Beige)

### 14. Seltos

| Trim Code | Trim Name |
|-----------|-----------|
| S-CVT | S |
| SP-CVT | Sport |
| SPP-CVT | Sport+ FWD |
| GTL-FWD | GT-Line FWD |
| SPP-AWD | Sport+ AWD |
| GTL-AWD | GT-Line AWD |

**Colors:** M3R (Mars Orange), PLU (Pluton Blue), SWP (Snow White Pearl), KLG (Steel Grey), KDG (Gravity Grey), FSB (Fusion Black), B3A (Neptune Blue)

### 15. Sorento

| Trim Code | Trim Name | Fuel |
|-----------|-----------|------|
| S-P | S | Petrol Auto |
| SP-P | Sport | Petrol Auto |
| SPP-P | Sport+ | Petrol Auto |
| GTL-P | GT-Line | Petrol Auto |
| S-D | S | Diesel DCT |
| SP-D | Sport | Diesel DCT |
| SPP-D | Sport+ | Diesel DCT |
| GTL-D | GT-Line | Diesel DCT |

**Colors:** UD (Clear White), 4SS (Silky Silver), KLG (Steel Grey), M4B (Mineral Blue), ABP (Aurora Black Pearl), B4U (Gravity Blue), SWP (Snow White Pearl), BN4 (Volcanic Sand Brown), CGE (Cityscape Green)

### 16. Sorento Hybrid

| Trim Code | Trim Name |
|-----------|-----------|
| MQ4PEHFS | S Hybrid FWD |
| MQ4PEHFSP | Sport Hybrid FWD |
| MQ4PEHFSPP | Sport+ Hybrid FWD |
| MQ4PE-HEVF | GT-Line Hybrid FWD |
| MQ4PEHAS | S Hybrid AWD |
| MQ4PEHASP | Sport Hybrid AWD |
| MQ4PEHASPP | Sport+ Hybrid AWD |
| MQ4PE-HEVA | GT-Line Hybrid AWD |

**Colors:** Same as Sorento

### 17. Sorento Plug-in Hybrid

| Trim Code | Trim Name |
|-----------|-----------|
| PHEV-A-S | S Plug-in Hybrid |
| PHEV-A-SP | Sport Plug-in Hybrid |
| PHEV-A-SPP | Sport+ Plug-in Hybrid |
| GTL-PHEV | GT-Line Plug-in Hybrid |

**Colors:** Same as Sorento

### 18. Sportage

| Trim Code | Trim Name | Fuel |
|-----------|-----------|------|
| S-P | S | Petrol |
| SX-P | SX | Petrol |
| SXPF-P | SX+ FWD | Petrol |
| SXPA-P | SX+ AWD | Petrol |
| GTL-P | GT-Line | Petrol |
| S-D | S | Diesel |
| SX-D | SX | Diesel |
| SXP-D | SX+ | Diesel |
| GTL-D | GT-Line | Diesel |

**Colors:** UD (Clear White), KLG (Steel Grey), KDG (Gravity Grey), FSB (Fusion Black), BB2 (Vesta Blue), HRB (Heritage Blue), C7A (Wolf Grey)
**Interior:** Black with Light Grey Cloth Headliner

### 19. Sportage Hybrid

| Trim Code | Trim Name |
|-----------|-----------|
| S-HF | S Hybrid FWD |
| S-HA | S Hybrid AWD |
| SX-HF | SX Hybrid FWD |
| SX-HA | SX Hybrid AWD |
| GTL-HF | GT-Line Hybrid FWD |
| GTL-HA | GT-Line Hybrid AWD |

**Colors:** Same as Sportage

### 20. Stonic (Current)

| Trim Code | Trim Name |
|-----------|-----------|
| S | S |
| Sport | Sport |
| GT-Line | GT-Line |

**Colors:** UD (Clear White), KCS (Sparkling Silver), M7G (Astro Grey), ABP (Aurora Black Pearl), BEG (Signal Red), DU3 (Yacht Blue), A2G (Adventurous Green), SWP (Snow White Pearl)
**Interior:** Black cloth trim

### 21. Stonic MY25

| Trim Code | Trim Name |
|-----------|-----------|
| S | S |
| SP | Sport |
| GT-Line | GT-Line |

**Colors:** UD (Clear White), SWP (Snow White Pearl), KCS (Sparkling Silver), M7G (Astro Grey), ABP (Aurora Black Pearl), BEG (Signal Red), SPB (Sporty Blue)

### 22. Tasman (Dual Cab Pick-up)

| Trim Code | Trim Name |
|-----------|-----------|
| DCPUS4x2 | S 4x2 |
| DCPUS4x4 | S 4x4 |
| DCPUSX | SX |
| DCPUSXP | SX+ |
| DCPUXLN | X-Line |
| DCPUXPRO | X-Pro |

**Colors:** UD (Clear White), KLG (Steel Grey), AGT (Interstellar Grey), ABP (Aurora Black Pearl)
**Interior:** Onyx Black with Black Cloth Headliner

### 23. Tasman Dual Cab Chassis

| Trim Code | Trim Name |
|-----------|-----------|
| DCCS-GPAT | S - General Purpose Alloy Tray |
| DCCS-HDAT | S - Heavy Duty Alloy Tray |
| DCCS-HDSR | S - Heavy Duty Steel Tray |
| DCCS-HDST | S - Painted Heavy Duty Steel Tray |
| DCCSX-GPAT | SX - General Purpose Alloy Tray |
| DCCSX-HDAT | SX - Heavy Duty Alloy Tray |
| DCCSX-HDSR | SX - Heavy Duty Steel Tray |
| DCCSX-HDST | SX - Painted Heavy Duty Steel Tray |

**Colors:** UD (Clear White), KLG (Steel Grey), AGT (Interstellar Grey), ABP (Aurora Black Pearl)
**Interior:** Onyx Black Cloth Seats

### 24. Tasman Single Cab Chassis

| Trim Code | Trim Name |
|-----------|-----------|
| S4X2-GPAT | S 4x2 - General Purpose Alloy Tray |
| S4X4-GPAT | S 4x4 - General Purpose Alloy Tray |
| SX-GPAT | SX - General Purpose Alloy Tray |

**Colors:** UD (Clear White), KLG (Steel Grey), AGT (Interstellar Grey), ABP (Aurora Black Pearl)
**Interior:** Onyx Black & Medium Grey Cloth Seats

---

## Extraction DOM Selectors

```
Trim list:       ul.trim_list > li.trim_l
Trim code:       label[path] → path attribute
Trim name:       label[path] → text content
Trim image:      input[name="trimFilePath"] → value attribute

Color list:      ul.color_list > li.color_l
Color code:      li.color_l → path attribute (also color attribute, same value)
Color name:      li.color_l img → alt attribute
Color swatch:    li.color_l img → src attribute

Interior list:   ul.option_list > li.option_l
Interior code:   label[path] → path attribute
Interior name:   img → alt attribute

Image base:      /content/dam/kwcms/au/en/images/shopping-tools/byo/{model}/{trim}/
```

## URL Patterns

```
Model index:     /au/shopping-tools/build-and-price.html
Trim selection:  /au/shopping-tools/build-and-price.trim.{model-slug}.html
Color selection: /au/shopping-tools/build-and-price.color.{model-slug}.{trimCode}.html
Complete:        /au/shopping-tools/build-and-price.complete.{model-slug}.{trimCode}.{extColor}.{intColor}.html
Price API:       /api/kia_australia/common/trimPrice.selectPriceByTrim?regionCode={state}&modelCode={code}&trimCode={code}
```

## Pricing

Prices require a postcode/region to be set (stored in cookie `regionCode`). The price API returns data only when a valid region code is provided. Drive away prices are 2025 build only; 2026 pricing requires dealer contact.

## Recommended Implementation

1. **No browser rendering needed** — all data is in static HTML
2. Use `fetch()` to GET each trim page, parse with regex or DOM parser
3. For each trim, GET the color page to map color codes to names
4. For pricing, call the trimPrice API with regionCode=NSW (or configurable)
5. Store results in Supabase `products` table with `variants` JSONB column
6. Image URLs follow predictable pattern — can construct swatch/hero URLs from codes

## Notes

- Some models have both current and MY24/MY25 entries (EV6, Stonic)
- Color codes are shared across models (e.g., ABP = Aurora Black Pearl everywhere)
- Some color codes map to the same name but are different codes (AG9 vs AGT both = Interstellar Grey; DM4 vs ACW both = Honeydew)
- The HTML uses Korean comments (AEM content authored in Korea)
- Grade list in HTML is commented out (`<!--#63706 ...-->`) — use trim_list instead
