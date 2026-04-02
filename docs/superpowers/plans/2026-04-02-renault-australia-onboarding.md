# Renault Australia Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onboard Renault Australia (`renault-au`) as the 19th OEM on the platform with full data pipeline — models, variants, colors, pricing, offers, banners, brochures, and all cron/agent integrations.

**Architecture:** Renault AU runs on Gatsby 5.14.6 + i-motor CMS (same as LDV). All data comes from Gatsby `page-data.json` endpoints — no browser rendering needed. Hero banners are in SSR HTML using the same `classHhCarouselWrapper` carousel as LDV. Images on `cdn.cms-uploads.i-motor.me`.

**Tech Stack:** TypeScript (Cloudflare Worker), Supabase (Postgres), Gatsby page-data.json, cheerio (HTML extraction), Node.js seed scripts.

**Spec:** `docs/superpowers/specs/2026-04-02-renault-australia-onboarding-design.md`

---

### Task 1: Core TypeScript — types, registry, brand notes

**Files:**
- Modify: `src/oem/types.ts:11-30`
- Modify: `src/oem/registry.ts:4,590-615,695`
- Modify: `src/design/agent.ts:801+`

- [ ] **Step 1: Add `renault-au` to BuiltInOemId union**

In `src/oem/types.ts`, add `'renault-au'` alphabetically between `'nissan-au'` and `'subaru-au'`:

```typescript
  | 'nissan-au'
  | 'renault-au'
  | 'subaru-au'
```

Update the comment on line 12 from `17 pre-configured` to `19 pre-configured`.

- [ ] **Step 2: Add renaultAu definition to registry**

In `src/oem/registry.ts`, add before the "Registry Collection" section (before line 592):

```typescript
// ============================================================================
// 1.19 Renault Australia
// ============================================================================
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
    requiresBrowserRendering: false, // Gatsby SSR (i-motor) — same platform as LDV, all data in page-data.json
    isGatsby: true,
    framework: 'gatsby',
  },
};
```

Add to `oemRegistry` object (alphabetically, after `'nissan-au': nissanAu,`):

```typescript
  'renault-au': renaultAu,
```

Update header comment (line 4) from `18 Australian` to `19 Australian`.

- [ ] **Step 3: Add brand notes**

In `src/design/agent.ts`, add to `OEM_BRAND_NOTES`:

```typescript
'renault-au': {
  colors: ['#EFDF00', '#000000', '#E91630'],
  notes: 'Renault Australia — Gatsby 5.14.6 + i-motor CMS (same platform as LDV). Structured data via page-data.json endpoints. Renault Yellow primary, black secondary, red accent. Custom Renault font family.',
},
```

- [ ] **Step 4: Type check**

Run: `npx vue-tsc --noEmit --pretty 2>&1 | grep "types.ts\|registry.ts\|agent.ts"`
Expected: No new errors in these files.

- [ ] **Step 5: Commit**

```bash
git add src/oem/types.ts src/oem/registry.ts src/design/agent.ts
git commit -m "feat: add renault-au to OEM types, registry, and brand notes"
```

---

### Task 2: Cron and sync integration

**Files:**
- Modify: `src/scheduled.ts:160`
- Modify: `src/sync/all-oem-sync.ts:895-899`
- Modify: `config/openclaw/cron-jobs.json:33-34,117,164,224,251`

- [ ] **Step 1: Add to design drift allOems array**

In `src/scheduled.ts` line 160, add `'renault-au'` to the end of the `allOems` array:

```typescript
const allOems = ['kia-au','nissan-au','ford-au','volkswagen-au','mitsubishi-au','ldv-au','isuzu-au','mazda-au','kgm-au','gwm-au','suzuki-au','hyundai-au','toyota-au','subaru-au','gmsv-au','foton-au','gac-au','chery-au','renault-au'];
```

- [ ] **Step 2: Add to genericOems for pricing refresh**

In `src/sync/all-oem-sync.ts`, find the `genericOems` array inside `syncGenericPricing` and add `'renault-au'`.

- [ ] **Step 3: Update OpenClaw cron config**

In `config/openclaw/cron-jobs.json`:

Add `"renault-au"` to the `oem_ids` array in the `oem-extract-daily` job (line ~33).

Find-and-replace all `"18 OEMs"` → `"19 OEMs"` in description strings (jobs: `oem-data-sync-daily`, `oem-orchestrator`, `design-drift-weekly`, `token-refresh`).

- [ ] **Step 4: Commit**

```bash
git add src/scheduled.ts src/sync/all-oem-sync.ts config/openclaw/cron-jobs.json
git commit -m "feat: wire renault-au into cron schedules and data sync pipeline"
```

---

### Task 3: Database migration

**Files:**
- Create: `supabase/migrations/20260403_renault_oem.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20260403_renault_oem.sql`:

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

- [ ] **Step 2: Push migration to Supabase**

Run: `npx supabase db push`
Expected: Migration applied successfully.

If conflict: `npx supabase migration repair --status reverted 20260403_renault_oem && npx supabase db push --include-all`

- [ ] **Step 3: Verify OEM exists in DB**

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://nnihmdmsglkxpmilmjjc.supabase.co', '<service_role_key>');
(async () => {
  const { data } = await sb.from('oems').select('id, name, is_active').eq('id', 'renault-au');
  console.log(data);
  const { count } = await sb.from('source_pages').select('id', { count: 'exact', head: true }).eq('oem_id', 'renault-au');
  console.log('Source pages:', count);
})();
"
```
Expected: `[{ id: 'renault-au', name: 'Renault Australia', is_active: true }]`, Source pages: 12

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260403_renault_oem.sql
git commit -m "feat: add renault-au database migration (oems + 12 source pages)"
```

---

### Task 4: Media proxy and discovered APIs

**Files:**
- Modify: `src/routes/media.ts:21-93`
- Modify: `dashboard/scripts/seed-discovered-apis.mjs`
- Modify: `dashboard/scripts/seed-banners.mjs:20-77`

- [ ] **Step 1: Add Renault to media proxy**

In `src/routes/media.ts`, add to `OEM_HEADERS` (after the `suzuki-au` entry):

```typescript
'renault-au': {
  Origin: 'https://www.renault.com.au',
  Referer: 'https://www.renault.com.au/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
},
```

Check if `cdn.cms-uploads.i-motor.me` is already in `ALLOWED_HOSTS` (it should be from LDV). If not, add it.

- [ ] **Step 2: Add discovered APIs**

In `dashboard/scripts/seed-discovered-apis.mjs`, add to the `apis` array:

```javascript
{ oem_id: 'renault-au', url: 'https://www.renault.com.au/page-data/vehicles/page-data.json', method: 'GET', data_type: 'products', reliability_score: 0.9, status: 'verified' },
{ oem_id: 'renault-au', url: 'https://www.renault.com.au/page-data/special-offers/page-data.json', method: 'GET', data_type: 'offers', reliability_score: 0.9, status: 'verified' },
{ oem_id: 'renault-au', url: 'https://www.renault.com.au/page-data/news/page-data.json', method: 'GET', data_type: 'news', reliability_score: 0.9, status: 'verified' },
{ oem_id: 'renault-au', url: 'https://www.renault.com.au/page-data/build-and-price/page-data.json', method: 'GET', data_type: 'configurator', reliability_score: 0.8, status: 'verified' },
```

- [ ] **Step 3: Add to banner seed script**

In `dashboard/scripts/seed-banners.mjs`, add to `OEM_PAGES`:

```javascript
{ oem: 'renault-au', type: 'homepage', url: 'https://www.renault.com.au/', extract: 'html' },
{ oem: 'renault-au', type: 'offers', url: 'https://www.renault.com.au/special-offers/', extract: 'html' },
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/media.ts dashboard/scripts/seed-discovered-apis.mjs dashboard/scripts/seed-banners.mjs
git commit -m "feat: add renault-au to media proxy, discovered APIs, and banner seed"
```

---

### Task 5: Seed script — products, colors, pricing, offers

**Files:**
- Create: `dashboard/scripts/seed-renault-products.mjs`

- [ ] **Step 1: Create the seed script**

Create `dashboard/scripts/seed-renault-products.mjs`. This fetches Gatsby page-data.json for each model, extracts variants/trims/colors/pricing, and upserts to Supabase.

Reference `dashboard/scripts/seed-kgm-products.mjs` for the pattern (CMS JSON API → Supabase upsert).

The script should:
1. Fetch `/page-data/vehicles/page-data.json` → extract `allCmsVehicleModelLean.nodes` → upsert `vehicle_models`
2. For each model with `displayInNavigation: true` and `!comingSoonModel`:
   - Fetch `/page-data/vehicles/{slug}/page-data.json`
   - Extract `modelsVariants` → for each variant/trim: upsert `products` with price, body_type, specs_json
   - Extract `modelsColours` → for each color per product: upsert `variant_colors` with name, hex, swatch_url, hero_image_url, price_delta
   - Extract brochure URL → store in product `cta_links`
3. Fetch `/page-data/special-offers/page-data.json` → extract `allCmsSpecial.nodes` → upsert `offers`

Note: The exact shape of `modelsVariants` and `modelsColours` in the page-data.json will need to be inspected at runtime. Start by fetching one model (e.g., Duster) and logging the full data structure before writing the parsing logic.

- [ ] **Step 2: Run the seed script**

```bash
cd dashboard/scripts && node seed-renault-products.mjs
```

Expected output: Models, products, colors, pricing, and offers inserted with counts.

- [ ] **Step 3: Verify data in DB**

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://nnihmdmsglkxpmilmjjc.supabase.co', '<service_role_key>');
(async () => {
  const models = await sb.from('vehicle_models').select('id', { count: 'exact', head: true }).eq('oem_id', 'renault-au');
  const products = await sb.from('products').select('id', { count: 'exact', head: true }).eq('oem_id', 'renault-au');
  const colors = await sb.from('variant_colors').select('id', { count: 'exact', head: true });
  const offers = await sb.from('offers').select('id', { count: 'exact', head: true }).eq('oem_id', 'renault-au');
  console.log('Models:', models.count, 'Products:', products.count, 'Offers:', offers.count);
})();
"
```

Expected: ~10 models, ~25-35 products, ~13 offers.

- [ ] **Step 4: Commit**

```bash
git add dashboard/scripts/seed-renault-products.mjs
git commit -m "feat: seed-renault-products.mjs — models, variants, colors, pricing, offers from page-data.json"
```

---

### Task 6: Documentation and skills update (18 → 19 OEMs)

**Files:** 17 documentation/skill files (see spec for full list)

This task is mechanical: find-and-replace `18 OEM` → `19 OEM` and add `renault-au` to any OEM ID lists.

- [ ] **Step 1: Update skills**

Update these files, replacing "18 OEMs" with "19 OEMs" and adding `renault-au` to OEM ID lists where present:

- `skills/oem-report/SKILL.md`
- `skills/oem-report/index.ts`
- `skills/oem-sales-rep/SKILL.md`
- `skills/oem-extract/SKILL.md`
- `skills/oem-data-sync/SKILL.md`
- `skills/oem-orchestrator/SKILL.md`

- [ ] **Step 2: Update workspace docs**

- `workspace/MEMORY.md` — add `renault-au` to OEM list, update counts
- `workspace/AGENTS.md` — add `renault-au` to OEM list, update counts
- `workspace-crawler/SOUL.md` — add `renault-au` to OEM list
- `workspace-extractor/SOUL.md` — update count
- `workspace-reporter/SOUL.md` — update count

- [ ] **Step 3: Update project docs**

- `BRIEFING.md` — add Renault to OEM table, update counts
- `AGENTS.md` — add to OEM list, update counts
- `docs/DATABASE_SETUP.md` — add Renault row to OEM table
- `docs/DATABASE_RESTRUCTURE.md` — update count
- `docs/IMPLEMENTATION_SUMMARY.md` — update count
- `docs/OEM_AGENT_ARCHITECTURE.md` — update count
- `docs/crawl-config-v1.2.md` — add section 1.19 for Renault with platform details
- `docs/OEM_ONBOARDING.md` — add onboarding log entry: `| 2026-04-02 | Renault Australia (renault-au) | 19 | Gatsby/i-motor (same as LDV), page-data.json APIs, 10 models, 13 offers |`

- [ ] **Step 4: Commit**

```bash
git add skills/ workspace/ workspace-crawler/ workspace-extractor/ workspace-reporter/ BRIEFING.md AGENTS.md docs/
git commit -m "docs: update all references from 18 to 19 OEMs for renault-au onboarding"
```

---

### Task 7: Deploy and verify

**Files:** None (deployment)

- [ ] **Step 1: Type check**

Run: `npx vue-tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No new errors from Renault changes.

- [ ] **Step 2: Build dashboard**

Run: `cd dashboard && npx vite build`
Expected: Build succeeds.

- [ ] **Step 3: Push to remote**

```bash
git push origin <branch>
```

- [ ] **Step 4: Deploy dashboard to CF Pages**

```bash
cd dashboard && npx wrangler pages deploy dist --project-name oem-dashboard
```

- [ ] **Step 5: Deploy worker**

```bash
npx wrangler deploy
```

Expected: Worker deploys with 8 cron schedules (was 7, now includes banner health check).

- [ ] **Step 6: Run seed scripts**

```bash
cd dashboard/scripts
node seed-discovered-apis.mjs
node seed-renault-products.mjs
```

- [ ] **Step 7: Verify on dashboard**

Open `https://oem-dashboard.pages.dev/dashboard/` and check:
- Renault appears in OEM dropdown filters
- Products page shows Renault models and variants
- Colors page shows Renault variant colors
- Banners page shows Renault hero slides (after next homepage crawl)

- [ ] **Step 8: Update memory**

Update `~/.claude/projects/.../memory/MEMORY.md`:
- Add `renault-au` to the OEM list
- Update platform overview count to 19 OEMs
- Update approximate product/color/offer counts

- [ ] **Step 9: Final commit**

```bash
git commit -m "chore: update memory for renault-au onboarding completion"
```
