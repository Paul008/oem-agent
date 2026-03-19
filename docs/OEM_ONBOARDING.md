# New OEM Onboarding Guide

How to add a new Australian automotive OEM to the platform.

**Last updated**: 2026-03-17 (LDV AU full data population)

---

## Prerequisites

Before starting, gather this information about the new OEM:

| Field | Example (Foton) | Notes |
|-------|-----------------|-------|
| OEM ID | `foton-au` | Format: `{brand}-au` |
| Display name | `Foton Australia` | |
| Base URL | `https://www.fotonaustralia.com.au` | No trailing slash |
| Requires browser rendering? | No | Server-rendered = no, SPA/Next.js = yes |
| Sub-brands | None | e.g. GWM has haval, tank, cannon, ora, wey |
| Vehicle pages | `/ute/tunland/`, `/trucks/series/aumark-s/` | At least 2 |
| Category pages | `/vehicles/foton/`, `/trucks/series/` | Optional |
| Offers page | `/` (or dedicated URL) | |
| News page | `/about-us/news/` | Optional |
| Brand color(s) | `#D4002A` | Primary brand color hex |
| Any discovered APIs? | `POST /api/v1/custompricing/vehicles` | From network tab |

---

## Dashboard Wizard (Recommended)

The fastest way to onboard a new OEM is the **dashboard wizard** at `/dashboard/onboarding`. It automates steps 1-5 and generates the code snippets for steps that require a code deploy.

**What the wizard handles automatically:**
1. Site discovery (sitemap crawl, framework detection, brand color, page classification)
2. Source page selection and configuration
3. Database registration (OEM record + source pages + discovered APIs)
4. First crawl trigger
5. Code snippet generation for TypeScript files

**What still requires a code deploy:**
- Adding to `OemId` union in `types.ts`
- Adding `OemDefinition` to `registry.ts`
- Adding `OEM_BRAND_NOTES` entry in `agent.ts`
- Creating the Supabase migration file
- Updating OEM count references across the codebase

After the wizard completes, use the generated snippets directly or run the `/oem-onboard` Claude agent — if the wizard was used, it will skip discovery + DB steps and focus on applying the TypeScript code changes and updating counts.

---

## Manual Steps (if not using the wizard)

## Step 1 — Add to OemId union type

**File**: `src/oem/types.ts`

Add the new ID to the `OemId` type union, alphabetically by convention:

```typescript
export type OemId =
  | 'ford-au'
  | 'foton-au'    // <-- new
  | 'gmsv-au'
  // ...
```

---

## Step 2 — Add OEM definition to registry

**File**: `src/oem/registry.ts`

Add the definition object before the "Registry Collection" section, then add the entry to the `oemRegistry` object:

```typescript
export const fotonAu: OemDefinition = {
  id: 'foton-au',
  name: 'Foton Australia',
  baseUrl: 'https://www.fotonaustralia.com.au',
  config: {
    homepage: '/',
    vehicles_index: '/vehicles/foton/',
    offers: '/',
    news: '/about-us/news/',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href*="/ute/"], a[href*="/trucks/series/"]',
    heroSlides: '.hero, [class*="hero"]',
    offerTiles: '[class*="offer"], [class*="promo"]',
  },
  flags: {
    requiresBrowserRendering: false,
  },
};
```

Also update:
- The `oemRegistry` object: add `'foton-au': fotonAu`
- The file header comment count (e.g. "18 Australian OEMs")
- The `generateOemSeedData()` comment count

---

## Step 3 — Add brand notes to design agent

**File**: `src/design/agent.ts` → `OEM_BRAND_NOTES` object

```typescript
'foton-au': {
  colors: ['#D4002A'],
  notes: 'Server-rendered, postcode-gated pricing via API, ute + truck range',
},
```

---

## Step 4 — Create Supabase migration

**File**: `supabase/migrations/<YYYYMMDD>_<oem>_oem.sql` (NEW)

Use the next available date that doesn't conflict with existing migrations. Check `ls supabase/migrations/` first.

The migration inserts:
1. The OEM record into `oems`
2. Source pages into `source_pages`

Template:

```sql
-- ============================================================================
-- <OEM Name> — OEM + Source Pages
-- ============================================================================

INSERT INTO oems (id, name, base_url, config_json, is_active)
VALUES (
  '<oem-id>',
  '<OEM Name>',
  '<base-url>',
  '<config JSON matching registry definition>',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  config_json = EXCLUDED.config_json,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('<oem-id>', '<homepage-url>', 'homepage', 'active', now(), now()),
('<oem-id>', '<vehicle-url>', 'vehicle', 'active', now(), now()),
-- ... more pages
ON CONFLICT (oem_id, url) DO NOTHING;
```

**Page types**: `homepage`, `vehicle`, `category`, `offers`, `news`, `other`

---

## Step 5 — Add discovered APIs

**File**: `dashboard/scripts/seed-discovered-apis.mjs`

If you discovered any APIs (e.g. pricing, product data, configurator), add them to the `apis` array. Then either run the seed script or insert directly via Supabase client.

---

## Step 6 — Update OEM count references

This is the most tedious but critical step. Run:

```bash
grep -rn "N OEM\|N Australian" \
  --include="*.md" --include="*.ts" --include="*.mjs" \
  --include="*.json" --include="*.vue"
```

Replace `N` with the old count to find stale references. Files that typically need updating:

### Top-level
- `BRIEFING.md` — multiple count references + OEM table
- `AGENTS.md` — table counts + OEM ID list
- `package.json` — description field

### Workspace agent context
- `workspace/SOUL.md` — mission statement
- `workspace/MEMORY.md` — table counts, entity hierarchy, OEM ID list
- `workspace/AGENTS.md` — table counts, OEM ID list, template gallery
- `workspace-crawler/SOUL.md` — mission + OEM ID list
- `workspace-crawler/AGENTS.md` — workflow description
- `workspace-reporter/SOUL.md` — mission
- `workspace-reporter/AGENTS.md` — skill table
- `workspace-extractor/SOUL.md` — mission
- `workspace-designer/SOUL.md` — mission

### Skills
- `skills/oem-report/SKILL.md` — daily digest description
- `skills/oem-report/index.ts` — code comment
- `skills/oem-sales-rep/SKILL.md` — queryable data table
- `skills/oem-extract/SKILL.md` — coverage note
- `skills/oem-data-sync/SKILL.md` — portal references

### Docs
- `docs/DATABASE_SETUP.md` — migration descriptions + OEM table
- `docs/DATABASE_RESTRUCTURE.md` — current state + entity hierarchy
- `docs/IMPLEMENTATION_SUMMARY.md` — type/registry descriptions
- `docs/OEM_AGENT_ARCHITECTURE.md` — cost estimation
- `docs/crawl-config-v1.2.md` — cost estimation sections

### Dashboard
- `dashboard/src/pages/dashboard/page-builder-docs.vue` — overview text
- `dashboard/scripts/seed-oem-portals.mjs` — comment

---

## Step 7 — Deploy

```bash
# Push migration (may need --include-all for unsynced older migrations)
npx supabase db push

# If duplicate-timestamp migrations block the push:
# 1. Rename conflicting .sql files to .sql.bak
# 2. Push
# 3. Rename back

# Deploy worker
npm run deploy
```

---

## Step 8 — Verify

```bash
# TypeScript compiles
npx tsc --noEmit 2>&1 | grep -i '<oem>'
# Should return nothing (no new errors)
```

```sql
-- OEM record exists
SELECT id, name, base_url FROM oems WHERE id = '<oem-id>';

-- Source pages seeded
SELECT count(*) FROM source_pages WHERE oem_id = '<oem-id>';

-- Discovered APIs (if any)
SELECT url, method, data_type FROM discovered_apis WHERE oem_id = '<oem-id>';
```

---

## Step 9 — Trigger first crawl and verify pipeline

Trigger a manual crawl to validate the pipeline works end-to-end before relying on crons:

```bash
curl -s -X POST https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/crawl/<oem-id> | jq
```

Wait ~60 seconds, then check:

```sql
-- Import run was created and completed
SELECT id, status, started_at FROM import_runs WHERE oem_id = '<oem-id>' ORDER BY created_at DESC LIMIT 1;

-- Source pages were crawled (last_crawled_at should be populated)
SELECT url, page_type, last_crawled_at FROM source_pages WHERE oem_id = '<oem-id>';

-- Vehicle models discovered (may be 0 on first crawl if extraction needs tuning)
SELECT count(*) FROM vehicle_models WHERE oem_id = '<oem-id>';

-- Products extracted
SELECT count(*) FROM products WHERE oem_id = '<oem-id>';
```

If the import run shows `status = 'failed'` or no vehicle models are found, investigate logs and fix extraction before leaving the OEM to run on crons unattended.

---

## Step 10 — Update auto memory

Update `~/.claude/projects/.../memory/MEMORY.md` with:
- OEM name and ID
- Migration file name
- Key details (sub-brands, rendering, APIs)
- Number of files updated

---

## Common Gotchas

| Issue | Solution |
|-------|----------|
| `db push` fails with "Found local migration files to be inserted before the last migration" | Use `--include-all`, or rename conflicting files to `.sql.bak`, push, rename back |
| Same-date migrations conflict on `version` PK | Use a different date for the new migration |
| OEM count grep misses files | Search for the old count number (e.g. `16 OEM`) not just the word "OEM" |
| Forgot to add to OEM ID lists | Check `workspace/MEMORY.md`, `workspace/AGENTS.md`, `workspace-crawler/SOUL.md` |

### Gatsby-Based OEM Example (LDV)

For Gatsby-based OEMs (framework: `gatsby`), structured data is available via `page-data.json` endpoints at every route. This eliminates the need for browser rendering or API key discovery:

1. Vehicles index: `https://{base}/page-data/vehicles/page-data.json` — all models
2. Per-model: `https://{base}/page-data/vehicles/{slug}/page-data.json` — full specs, variants, colors, pricing
3. Offers: `https://{base}/page-data/special-offers/page-data.json`
4. Price guide: `https://{base}/page-data/price/page-data.json`

Add `framework: 'gatsby'` to the OEM definition in `registry.ts`. LDV AU was fully populated this way (13 models, 11 products with specs, 47 colors, 9 pricing rows) with zero browser rendering.

---

## Step 11 — Seed variant colors (if available)

> **Note**: Basic `variant_colors` rows and `specs_json` are now automatically populated during every product upsert by the orchestrator (`syncVariantColors()` and `buildSpecsJson()`). Individual spec columns (`engine_size`, `cylinders`, `transmission`, `drive`, `drivetrain`) are also auto-populated from `meta_json`. A dedicated seed script is only needed if the OEM provides richer color data (hero images, gallery renders, swatch URLs) beyond what the crawl extracts.

If the OEM's website exposes color data (color names, swatches, vehicle renders per color), create a seed script:

1. Create `dashboard/scripts/seed-{oem}-colors.mjs`
2. Add it to `skills/oem-data-sync/SKILL.md` Colors table and `sync-manifest.json`
3. Add any fragile points to the Known Fragile Points table

**Common patterns:**
- **HTML scraping**: Color chips/dots with data attributes or inline styles (Foton, GMSV trucks)
- **JSON API**: Colorizer/configurator endpoints returning structured color data (GMSV Corvettes, Subaru, Hyundai)
- **React/Next.js hydration**: Inline JSON in SSR pages (Mazda)
- **JSON-LD**: Structured data in `<script type="application/ld+json">` blocks (Kia)

**Key gotchas:**
- GM AEM sites put chip texture close-ups and actual vehicle jelly renders in the same `colorizer/` directory — filter chips by filename pattern (`\d+ch-\w+-?\d+x\d+`)
- Some OEMs have multiple drivetrain variants mapping to the same product — deduplicate by `product_id + color_name` and merge extra hero images into `gallery_urls`
- Premium/metallic colors may have a price delta (e.g., Foton +$690) — check for pricing indicators

---

## History

| Date | OEM | Count | Notes |
|------|-----|-------|-------|
| 2026-03-19 | Chery Australia (`chery-au`) | 18 | Drupal CMS, 9 models (Tiggo+C5/E5), 17 products, 85 colors, 211 accessories, 7 banners, Omoda sub-brand absorbed |
| 2026-03-18 | GAC Australia (`gac-au`) | 17 | All 17 OEMs complete. 796 products, 302 offers, 176 banners |
| 2026-03-17 | LDV Australia (`ldv-au`) full data | 16 | Gatsby page-data.json, 13 models, 11 products, 47 colors, 9 pricing |
| 2026-02-24 | Foton Australia (`foton-au`) | 16 | Server-rendered, pricing API, ute+truck, 16 colors |
| 2026-02-24 | GMSV Australia (`gmsv-au`) | 15 | Multi-sub-brand (Chevrolet, Corvette, GMC), 55 colors dual-source |
| 2026-02-18 | Subaru Australia (`subaru-au`) | 14 | Retailer API v1 |
