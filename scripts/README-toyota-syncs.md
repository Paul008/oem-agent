# Toyota (toyota-au) sync scripts

Three scripts keep the `toyota-au` OEM data current in Supabase (project
**OEM AGENT**, `nnihmdmsglkxpmilmjjc`). All three drive a **real local Chrome**
(`/Applications/Google Chrome.app/...`) to get past toyota.com.au bot
management — headless-HTTP fetches get blocked. Credentials come from `.env`
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

| Script | Writes to | Source |
| --- | --- | --- |
| `sync-toyota-full-discovery.ts` | `products`, `variant_colors` | `/all-vehicles` → model pages → variant/trim APIs |
| `sync-toyota-accessories.ts` | `accessories`, `accessory_models` | per-model `/{model}/accessories` pages |
| `sync-toyota-offers.ts` | `offers` | `/current-offers` + per-offer detail pages + disclaimers API |

Run any of them with `npx tsx scripts/<script>.ts`. A visible/near-visible
Chrome window is launched — don't run on a headless CI box without a display.

---

## 1. `sync-toyota-full-discovery.ts` — vehicles

Discovers every model page from `/all-vehicles`, scrapes the variant IDs
(`NMToyota…`, 25 chars) off each page, then calls the variant + trim JSON APIs
to build one `products` row per trim (plus `variant_colors`).

**Model linkage (the important part).** Each product is linked to its
`vehicle_models` row via `model_id`, resolved from **the model page slug the
variant was discovered on** (authoritative). Resolution order: explicit
`SITE_PATH_TO_SLUG` override → exact slug → `source_url` path. If a page can't
be resolved (e.g. `/bz4x-touring`, which has no `vehicle_models` row) it logs a
warning and leaves those products' `model_id` NULL rather than guessing. Every
upsert also bumps `last_seen_at` **and** `updated_at`, and never overwrites an
existing non-NULL `model_id` with NULL.

**Backfill sweep.** After the crawl (and on demand) it links any remaining
`toyota-au` products that have a NULL `model_id` by matching the product title
against model names — longest match wins, word-boundary only. Deliberately
conservative: a NULL is preferred over a wrong link. Known non-matches left NULL:
`bZ4X Touring` (separate unlisted model, explicitly skipped) and `LC Military`
variants (ambiguous — not confidently one consumer model).

**Commands**
```bash
npx tsx scripts/sync-toyota-full-discovery.ts                 # full crawl + backfill
npx tsx scripts/sync-toyota-full-discovery.ts --backfill-only # DB-only, no browser
npx tsx scripts/sync-toyota-full-discovery.ts --limit 2       # crawl first N model pages (smoke test)
```

**When to run.** After a new model launches, after a facelift/variant refresh,
or whenever `products.model_id` gaps appear. `--backfill-only` is a fast,
idempotent, browser-free cleanup you can run any time.

**Verify**
```sql
select count(*) filter (where model_id is null) as null_model_id,
       count(*) filter (where model_id is not null) as linked
from products where oem_id='toyota-au' and external_key is not null;

select max(last_seen_at) from products where oem_id='toyota-au';
```
Expected: NULL `model_id` only on `bZ4X Touring` / `LC Military` rows (and the
old `external_key IS NULL` skeleton rows, which these scripts don't touch).

**Caveats**
- `--limit N` slices the first N model URLs in discovery order — you can't pick
  which models.
- Cross-model "related vehicles" links could in theory pull a foreign variant
  ID onto a page; first-seen page wins, matching how the site presents it.
- `NMToyota…` codes of length 25 are treated as variants; 32-char codes are
  trim+paint combos and are ignored by discovery.

---

## 2. `sync-toyota-accessories.ts` — accessories

Crawls each active model's `/{model}/accessories` page and upserts the Toyota
Genuine Accessories catalog into `accessories` + `accessory_models`.

**Catalog-only, no pricing.** Toyota AU publishes no public accessory pricing
("Contact your local Dealer") — `price` is always NULL. Rows carry name,
description, image, a `popular` flag, and per-model linkage.

**Commands**
```bash
npx tsx scripts/sync-toyota-accessories.ts            # all active models
npx tsx scripts/sync-toyota-accessories.ts --limit    # first 2 models (smoke test)
```

**When to run.** Alongside a vehicle sync, or when accessory ranges change.

**Verify**
```sql
select count(*) from accessories where oem_id='toyota-au';
select count(*) from accessory_models am
  join accessories a on a.id=am.accessory_id where a.oem_id='toyota-au';
```

**Caveats**
- `PATH_OVERRIDES` maps DB slugs to site paths where they differ
  (`bz4x`→`bz4x-ev`, `supra`→`gr-supra`, `corolla-hatch`→`corolla`, …). Add new
  models here if a page 404s.
- Camry/Yaris/Fortuner render accessories only inside the 360° "personalise"
  configurator — the script detects this and logs a clean `[skip-personalise]`
  rather than writing empty rows.
- Images lazy-load: the script scrolls stepwise and expands accordions before
  extracting, and backfills images via an `alt`-text map.

---

## 3. `sync-toyota-offers.ts` — current offers

Crawls `/current-offers`, visits each per-offer detail page, resolves footnote
disclaimers (`[E1]`, `[F31]`, …) from the site's disclaimers API
(`/main/api/v1/toyota/currentoffers/disclaimers/all`), and upserts one `offers`
row per retail offer.

**meta_json is the contract.** The consuming theme reads offers **entirely**
from `offers.meta_json` via `normalizeToyotaOffer` (it ignores most top-level
columns and filters out rows whose `meta_json` is empty, ordering by
`updated_at desc`). So `meta_json` is shaped to match the legacy WordPress feed
rows (`external_key` `wp-%`). Required fields, and where each comes from:

| meta_json field | Source |
| --- | --- |
| `id` | stable hash of the slug |
| `title.rendered` | offer title (footnote markers kept, e.g. `[E1]`) |
| `slug` | slugified title, footnote markers stripped |
| `model` | matched `vehicle_models` name (also sets top-level `model_id`) |
| `thumb` | offer card image (CDN jpg) |
| `disclaimer` | disclaimers API text per footnote code → `<p>[CODE] …</p>` |
| `end_date` | best-effort date parsed from subtitle/disclaimer (`YYYY-MM-DD`) |
| `offer_sub` | detail page offer title (e.g. "For New bZ4X owners") |
| `variant_sub` | offer card subtitle (e.g. "Offer Period ends 31 December 2026…") |

New rows use `external_key` `tau-<slug>`.

**Command**
```bash
npx tsx scripts/sync-toyota-offers.ts
```

**When to run.** Weekly, or whenever Toyota rotates retail offers (EOFY, plate
clearance, finance campaigns).

**Verify**
```sql
select external_key, meta_json->>'model' as model,
       meta_json->>'end_date' as end_date, updated_at
from offers where oem_id='toyota-au' and external_key like 'tau-%'
order by updated_at desc;
```
Expected: one row per live offer, `meta_json` populated, fresh `updated_at`.

**Safety / caveats**
- **Never deletes `wp-%` rows** — the legacy feed stays intact.
- Upsert is a manual select-then-update/insert keyed on `(oem_id, external_key)`
  because `offers` has **no unique index** on that pair (only `id` is unique).
  This makes re-runs idempotent (no duplicate rows).
- If `/current-offers` yields **zero** cards after 3 genuine attempts, the
  script writes nothing and exits non-zero — junk "Special Offer" skeleton rows
  are exactly what it replaces, so it fails loudly instead of shipping empties.
- Pre-existing junk rows from the old crawler (`external_key IS NULL`, empty
  `meta_json`) are left in place but are already invisible to the theme, which
  filters out empty-`meta_json` rows. Delete them manually if desired.
- `end_date` parsing is heuristic (handles "ends 31 December 2026" and
  `dd/mm/yyyy`); dates are built from calendar components to avoid a UTC
  off-by-one. Spot-check after big campaign changes.
- Offer card selectors (`.ty-offer-card*`) and detail selectors
  (`.ty-co-details*`) are Toyota's current class names — if extraction returns 0
  cards after a site redesign, re-probe the DOM and update the selectors.
- `page.evaluate` is always passed **string** scripts, not functions: tsx/esbuild
  injects a `__name` helper into serialized functions that doesn't exist in the
  page context. Keep new in-page logic as strings.
