# Renault Australia OEM Onboarding

**Date**: 2026-04-02
**OEM ID**: `renault-au`
**Status**: Design approved, ready for implementation

## OEM Profile

| Field | Value |
|-------|-------|
| OEM ID | `renault-au` |
| Display Name | Renault Australia |
| Base URL | `https://www.renault.com.au` |
| Framework | Gatsby 5.14.6 + i-motor CMS (same platform as LDV) |
| Browser Rendering | `false` — all data in SSR HTML + Gatsby page-data.json |
| Image CDN | `cdn.cms-uploads.i-motor.me` (shared with LDV) |
| Brand Color | `#EFDF00` (Renault Yellow) |
| Secondary Color | `#000000` (Black) |
| Accent Color | `#E91630` (Red) |
| Fonts | Renault Regular, Renault Semibold, Renault Bold, Renault Variable |
| Models | 9 active + 1 coming soon (Renault 5 Turbo 3E) + 1 umbrella (Renault Vans) |
| Offers | 13 specials (driveaway pricing + accessory bundles) |
| Analytics | GTM `GTM-K7WXQH5`, GA `UA-25811098-1` |

## Vehicle Models

| Model | Slug | Category | Build & Buy | Brochure |
|-------|------|----------|-------------|----------|
| Scenic E-Tech | `/scenic-e-tech/` | SUV / Electric | Yes | Yes |
| Koleos | `/koleos/` | SUV | Yes | Yes |
| Duster | `/duster/` | SUV | Yes | Yes |
| Megane E-Tech | `/megane-e-tech/` | Electric | Yes | Yes |
| Arkana | `/arkana/` | SUV | Yes | Yes |
| Master Van | `/master-van/` | Commercial | Yes | Yes |
| Kangoo | `/kangoo/` | Commercial | Yes | Yes |
| Kangoo E-Tech | `/kangoo-e-tech/` | Commercial / Electric | Yes | Yes |
| Trafic | `/trafic/` | Commercial | Yes | Yes |
| Renault 5 Turbo 3E | `/renault-5-turbo-3-e/` | Future | No | No |
| Renault Vans | `/renault-vans/` | Hub page | No | No |

## Data Sources

All structured data comes from Gatsby `page-data.json` endpoints — no HTML scraping needed for data extraction.

### Gatsby page-data.json Endpoints

| Endpoint | Data | Priority |
|----------|------|----------|
| `/page-data/vehicles/page-data.json` | All 11 models: names, categories, brochure URLs, showroom images | High |
| `/page-data/vehicles/{slug}/page-data.json` | Per-model: variants, trims, driveaway prices, specs, colors (with pricing), accessories | High |
| `/page-data/special-offers/page-data.json` | 13 specials: heading, price, content, disclaimers | High |
| `/page-data/news/page-data.json` | 58 news articles: title, date, slug, content | Medium |
| `/page-data/build-and-price/page-data.json` | Configurator config, model list, pricing disclaimers | Low |
| `/page-data/fleet/page-data.json` | Fleet page content | Low |

### Hero Banners

Extracted from SSR HTML (no browser rendering needed). Carousel uses identical i-motor classes as LDV:
- Container: `[class*="HhCarouselWrapper"]`
- Slides: `[class*="EmbCarouselItemWrapper"]`
- Heading: `[class*="HhCarouselHeading"]`
- Subheading: `[class*="HhCarouselSubHeading"]`
- CTA: `[class*="HomeHeroBannerCta"]`

Current hero slides (9):
1. Scenic E-Tech
2. Duster
3. Koleos
4. Master Van
5. Trafic
6. Arkana
7. New Power (EV range)
8. Turbo 3E
9. Kangoo E-Tech

Image sizes: desktop 1920x720, mobile 600x450.

### Color Data

Available per-model in page-data at trim level. Example (Duster):
- 7 exterior colors per trim
- Solid White = $0 (standard), all others = $850 (premium)
- Each color has: name, hex code, swatch image, vehicle render

### Brochure PDFs

Available via model page-data `brochure.url` field. Hosted on `cdn.cms-uploads.i-motor.me`. 9 of 11 models have brochures.

## Implementation Touchpoints

### Required (code/config — deploy needed)

| # | File | Change |
|---|------|--------|
| 1 | `src/oem/types.ts` | Add `'renault-au'` to `BuiltInOemId` union, fix comment count → 19 |
| 2 | `src/oem/registry.ts` | New `renaultAu: OemDefinition` constant + add to `oemRegistry`. Hero selector: `[class*="HhCarouselWrapper"] [class*="EmbCarouselItemWrapper"]`. `requiresBrowserRendering: false`, `isGatsby: true` |
| 3 | `src/design/agent.ts` | Add `'renault-au'` to `OEM_BRAND_NOTES`: colors `['#EFDF00']`, notes about Gatsby/i-motor, shared platform with LDV |
| 4 | `src/scheduled.ts` | Add `'renault-au'` to `allOems` array (line 160, design drift) |
| 5 | `src/sync/all-oem-sync.ts` | Add `'renault-au'` to `genericOems` array for pricing refresh |
| 6 | `config/openclaw/cron-jobs.json` | Add `'renault-au'` to `oem-extract-daily` `oem_ids`; update all "18 OEMs" description strings → "19 OEMs" |
| 7 | `supabase/migrations/20260403_renault_oem.sql` | New migration: INSERT into `oems` + 12 `source_pages` (homepage, 9 vehicle pages, offers, news) |
| 8 | `src/routes/media.ts` | Add `'renault-au'` to `OEM_HEADERS` (Origin/Referer for `cdn.cms-uploads.i-motor.me`); add CDN host to `ALLOWED_HOSTS` if not already present for LDV |

### Seed Scripts

| # | File | Change |
|---|------|--------|
| 9 | `dashboard/scripts/seed-discovered-apis.mjs` | Add 6 page-data.json endpoints as discovered APIs |
| 10 | `dashboard/scripts/seed-banners.mjs` | Add Renault homepage + offers to `OEM_PAGES` array |
| 11 | New: `dashboard/scripts/seed-renault-products.mjs` | Seed script: fetch page-data.json for each model → upsert vehicle_models + products + variant_colors + variant_pricing |

### Documentation & Skills (update "18 OEMs" → "19 OEMs" + add `renault-au`)

| # | File | Change |
|---|------|--------|
| 12 | `skills/oem-report/SKILL.md` + `index.ts` | Count 18 → 19 |
| 13 | `skills/oem-sales-rep/SKILL.md` | Add `renault-au` to OEM list, count 18 → 19 |
| 14 | `skills/oem-extract/SKILL.md` | Count 18 → 19 |
| 15 | `skills/oem-data-sync/SKILL.md` | Count 18 → 19, add to OEM list |
| 16 | `skills/oem-orchestrator/SKILL.md` | Count 18 → 19 |
| 17 | `BRIEFING.md` | Update OEM table + count |
| 18 | `AGENTS.md` | Update OEM list + count |
| 19 | `workspace/MEMORY.md` | Update OEM list + count |
| 20 | `workspace/AGENTS.md` | Update OEM list + count |
| 21 | `workspace-crawler/SOUL.md` | Update OEM list |
| 22 | `workspace-extractor/SOUL.md` | Count 18 → 19 |
| 23 | `workspace-reporter/SOUL.md` | Count 18 → 19 |
| 24 | `docs/DATABASE_SETUP.md` | Add Renault to OEM table, count 18 → 19 |
| 25 | `docs/DATABASE_RESTRUCTURE.md` | Count 18 → 19 |
| 26 | `docs/IMPLEMENTATION_SUMMARY.md` | Count 18 → 19 |
| 27 | `docs/OEM_AGENT_ARCHITECTURE.md` | Count 18 → 19, update cost estimation |
| 28 | `docs/crawl-config-v1.2.md` | Add Renault section (1.19), update cost estimation |
| 29 | `docs/OEM_ONBOARDING.md` | Add onboarding log entry |

### No Changes Needed

- `src/extract/engine.ts` — uses registry dynamically, no OEM-specific logic needed
- `src/index.ts` (CORS) — wildcard origin handler, no domain allowlist
- Dashboard Vue pages — all database-driven, auto-discover new OEMs
- Test files — no OEM enumeration in tests

## Registry Definition

```typescript
export const renaultAu: OemDefinition = {
  id: 'renault-au',
  name: 'Renault Australia',
  baseUrl: 'https://www.renault.com.au',
  config: {
    homepage: '/',
    vehicles_index: '/vehicles/',
    offers: '/special-offers/',
    news: '/news/',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href*="/vehicles/"]',
    heroSlides: '[class*="HhCarouselWrapper"] [class*="EmbCarouselItemWrapper"]',
    offerTiles: '[class*="special"], [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: false,
    isGatsby: true,
  },
};
```

## Migration SQL

```sql
-- Renault Australia OEM record
INSERT INTO oems (id, name, base_url, config_json, is_active)
VALUES (
  'renault-au',
  'Renault Australia',
  'https://www.renault.com.au',
  '{
    "homepage": "/",
    "vehicles_index": "/vehicles/",
    "offers": "/special-offers/",
    "news": "/news/",
    "brand_colors": ["#EFDF00", "#000000"],
    "framework": "gatsby",
    "platform": "imotor",
    "notes": "Gatsby 5.14.6 + i-motor CMS (same platform as LDV). All data via page-data.json."
  }'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  config_json = EXCLUDED.config_json,
  is_active = EXCLUDED.is_active;

-- Source pages for crawling
INSERT INTO source_pages (oem_id, url, page_type, is_active) VALUES
  ('renault-au', 'https://www.renault.com.au/', 'homepage', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/scenic-e-tech/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/koleos/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/duster/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/megane-e-tech/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/arkana/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/master-van/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/kangoo/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/kangoo-e-tech/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/trafic/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/special-offers/', 'offers', true),
  ('renault-au', 'https://www.renault.com.au/news/', 'news', true)
ON CONFLICT DO NOTHING;
```

## Seed Script Strategy

The `seed-renault-products.mjs` script will:

1. Fetch `/page-data/vehicles/page-data.json` → extract 11 models → upsert `vehicle_models`
2. For each active model, fetch `/page-data/vehicles/{slug}/page-data.json`:
   - Extract variants/trims → upsert `products` with prices
   - Extract colors per trim → upsert `variant_colors` with hero images + swatches + premium pricing
   - Extract specs → populate `specs_json`
   - Extract brochure URL → store in `cta_links`
3. Fetch `/page-data/special-offers/page-data.json` → upsert `offers`

This follows the same pattern as `seed-kgm-products.mjs` (also uses a CMS JSON API).

## Estimated Data Volume

| Table | Estimated rows |
|-------|---------------|
| vehicle_models | 10 (excl. umbrella page) |
| products | ~25-35 (variants across 9 models) |
| variant_colors | ~100-150 (5-8 colors per variant) |
| variant_pricing | ~25-35 (one per product) |
| offers | 13 |
| banners | 9-12 (hero slides + offers) |
| source_pages | 12 |

## Risk Assessment

**Low risk** — Renault shares the i-motor/Gatsby platform with LDV (already integrated). The page-data.json pattern is stable and well-understood. No browser rendering needed. No authentication required. CDN is shared with LDV (already in ALLOWED_HOSTS).

Only risk: i-motor platform version updates could change the page-data.json schema. Mitigated by the existing crawl doctor staleness detection + banner triage agent.
