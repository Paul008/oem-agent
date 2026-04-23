# Ford Australia data pipeline — reference

**Last updated:** 2026-04-23. This doc is the source of truth for how Ford data flows into Supabase. If something here is stale, fix it rather than writing a second doc.

## What this produces

For `oem_id='ford-au'` in Supabase:

| Table / column | Rows populated | Source |
|---|---|---|
| `products` core (title, variant_name, variant_code, key_features, power_kw, torque_nm) | 47 / 50 (rest are legacy Tourneo Custom — inactive model) | Brochure PDF → Groq LLM extraction |
| `products.specs_json` — up to **37 authoritative fields per variant** (engine_capacity, max_power/torque, kerbweight, GVM/GCM, towing braked/unbraked, fuel_tank_capacity, co2_emission, fuel consumption, axle_ratio, drive_type, etc.) | 37 / 50 | `/price/<Name>?_rsc=x` — `powerTrain.techSpecs` merged into brochure-derived specs |
| `products.price_amount`, `price_type`, `price_raw_string`, `price_currency` | 40 / 50 (37 RSC + 3 legacy Tourneo) | `/price/<Name>?_rsc=x` RSC |
| `products.meta_json.rsc_body_gallery_urls` — 9 GPAS angle URLs per body style | 37 / 50 | RSC `bodyStyle.images.exterior[]` |
| `products.meta_json.rsc_series_code / rsc_power_train_code / rsc_body_style_code` | 37 / 50 | RSC wrapper identifiers (reproducible lookups) |
| `variant_pricing` (driveaway_*, rrp, effective_date) | 37 rows | RSC |
| `offers` (title, description, validity_start/end, eligibility) | 11 rows | RSC, `entity` blocks |
| `accessories` (name, price, category, part_number, image_url, description_html) | 35 rows across 9 nameplates (incl. 2 free extras) | `/price/<Name>/summary?_rsc=x` — `featureOptions[]` |
| `accessory_models` (many-to-many: accessory_id ↔ model_id) | 35 joins | sibling-slug propagation from same endpoint |
| `variant_colors` hero, swatch, gallery_urls | 301 / 301 (100%) | Static seed + targeted RSC enrichment (Super Duty bumped 2 → 25 images/colour) |
| `variant_colors.price_delta`, `is_standard` | 157 premium / 144 standard | RSC `/summary` — paint entries via colourchip detection |

**Limit** (not a bug): the 10 products without `price_amount` are nameplates Ford genuinely does not publish a Build & Price endpoint for — E-Transit, E-Transit Custom, Transit Van, Transit Bus, Transit Cab Chassis, plus the retired Ranger XLS trim. Their `/price/<Name>` returns a 153KB template-only payload. F-150, Mustang Mach-E, and Tourneo ARE priced (featureOptions has been verified empty via balanced-JSON parse) but publish zero factory-fit accessories. Closing these gaps requires either a Playwright-driven Build & Price flow or an alternate data source (RedBook, CarSales, dealer feeds).

## Canonical command

```bash
cd /Users/paulgiurin/Documents/Projects/oem-agent
pnpm tsx scripts/populate-ford-from-brochures.ts --apply
```

Runs the full chain. Idempotent — re-running produces the same row counts. Typical runtime 5–7 min (brochure LLM extraction dominates; the RSC scripts add ~1 min combined).

## Chain flow (what `populate-ford-from-brochures.ts --apply` does)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Brochure extraction (PDF → Groq Llama 3.3 70B → variants)        │
│    - Fetch brochure_url for each active ford-au vehicle_model       │
│    - pdf-parse → chunkByPages(40_000) → per-chunk LLM extraction    │
│    - Retry on 429/5xx/network with exp. backoff; loud warnings on   │
│      all-chunks-failed so transient failures never silently drop a  │
│      nameplate. (fix in extractFromChunk / extractVariants)         │
│    - Merge chunks, filter per-model (Ranger vs Raptor etc.)         │
│    - Non-destructive upsert to products (stable IDs, FKs survive)   │
│                                                                      │
│ 2. Color re-seed (dashboard/scripts/seed-ford-colors.mjs)           │
│    - Delete + re-insert all Ford variant_colors from static ref     │
│      files at ~/Downloads/OEM-variants-main/data/ford/               │
│    - Populates hero_image_url, swatch_url, gallery_urls              │
│                                                                      │
│ 3. populate-ford-pricing-rsc.ts (RSC /price endpoint)                │
│    - Grandparent-walk every "basePrice":{ block to its full           │
│      {series, powerTrain, bodyStyle, price, keyFeatures} wrapper     │
│    - Match products by series.name (word-boundary), body, trans     │
│    - variant_pricing driveaway_* + rrp                                │
│    - products.price_amount + price_type + price_raw_string            │
│    - products.specs_json merged with Ford's authoritative             │
│      powerTrain.techSpecs (kerbweight, GVM/GCM, towing, CO2,          │
│      fuel consumption, engine cc, axle ratio, and ~30 more fields)    │
│    - products.meta_json.rsc_body_gallery_urls: 9 angle frames         │
│      per body style from bodyStyle.images.exterior[]                  │
│    - offers via secondary entity pass                                 │
│                                                                      │
│ 4. populate-ford-accessories-rsc.ts (RSC /summary endpoint)          │
│    - Walk every "id":"..." block, keep state=A + price>=0 + non-     │
│      config category (free extras like $0 Snorkel Removal included)  │
│    - external_key scoped per model_slug so sibling nameplates that   │
│      reuse Ford part codes each get their own row                    │
│    - Upsert accessories (oem_id, external_key) + accessory_models    │
│      join rows propagated across all applicable sibling slugs        │
│                                                                      │
│ 5. populate-ford-colour-pricing-rsc.ts (RSC /summary endpoint)       │
│    - Find paint entries by /colourchip/ image path                   │
│    - Update variant_colors.price_delta + is_standard by color_name   │
│                                                                      │
│ 6. populate-ford-galleries-rsc.ts (RSC /summary endpoint)            │
│    - Extract GPAS gallery URLs (tagged imageURL-N + bare GUID)       │
│    - Append (dedup by underlying URL) to variant_colors.gallery_urls │
│    - THRESHOLD-GUARDED: only touches rows with fewer than 8 images   │
│      already (protects rich existing galleries)                      │
└─────────────────────────────────────────────────────────────────────┘
```

All 4 RSC scripts can also be run standalone with `--apply` and `--slug=<x>`.

## URL resolution — data-driven, not hardcoded

Ford's `/price/<Name>` URLs don't follow an obvious rule:
- `/price/RangerHybrid` (no internal dash) but `/price/F-150` and `/price/Mach-E` keep dashes
- Several nameplates **share** endpoints — `Ranger-Raptor` → `/Ranger`, `Transit-Custom-Trail` → `/TransitCustom`, `Transit-Custom-PHEV` → `/TransitCustom`

The mapping comes from Ford's own nameplate menu JSON (`scripts/ford-vehiclesmenu.json` → each entry's `additionalCTA` field). All four RSC scripts import `modelToUrlName` and `siblingSlugsFor` from `scripts/ford-url-map.ts`, which parses the menu at load. When Ford ships a new nameplate:

```bash
pnpm tsx scripts/fetch-ford-json.ts          # refresh the menu file
pnpm tsx scripts/populate-ford-from-brochures.ts --apply   # run the chain
```

No code change needed.

## How the RSC builds are parsed

Each Ford `/price/<Name>?_rsc=x` payload embeds build data inside a grandparent wrapper shaped like:

```jsonc
{
  "series":     { "name": "Wildtrak",   "code": "ABML1_SE#R1", "image": "..." },
  "powerTrain": { "name": "2.0L Bi-Turbo Diesel 10AT Part-Time 4x4", "code": "DGACX_DR--G_EN-YN_TR-EU" },
  "bodyStyle":  { "name": "Double Cab Pick-up", "code": "CA#BC" },
  "price":      { "basePrice": { "polkVehicleDriveAwayPrice": 75886.6, "grossRetail": 69890, ... } },
  "keyFeatures":{ "features": [{ "code": "EN-YN", "descKf": "2.0L Bi-Turbo Diesel Engine" }, ...] }
}
```

`extractBuilds` walks up two `{` levels from every `"basePrice":{` and parses that wrapper. An optional second pass scans `entity.code` blocks to pair offers (tagLine / specialInformation) with their series-matched builds. The grandparent shape is present on every build regardless of whether an offer is attached — this is why Mustang (no entity blocks at all) now extracts cleanly.

Product matching:
1. Word-boundary match of `series.name` against product title (so "Ranger XLS" doesn't false-match series "XL")
2. Tie-break scored against `bodyStyleName` + `powerTrainName` only — NOT keyFeatures (Android Auto would false-positive the "auto" token)
3. Final tie-break: cheapest driveaway

## Coverage by nameplate (2026-04-23)

| Nameplate | Products | Priced | Accessories | Paint premiums | Gallery avg |
|---|---|---|---|---|---|
| Ranger | 6 | 5 (XLS retired, not in series map) | 6 | Yes | 13 |
| Ranger Raptor | 1 | 1 (cross-model from /Ranger) | 3 | — | 13 |
| Ranger Hybrid | 4 | 4 | 6 | — | 13 |
| Ranger Super Duty | 3 | 3 | 5 | — | 25 (enriched) |
| Everest | 5 | 5 | 3 | Yes | 13 |
| F-150 | 3 | 3 | 0 | — | 13 |
| Mustang | 4 | 4 | 1 | Yes | 9 |
| Mustang Mach-E | 3 | 3 | 0 | — | 9 |
| Tourneo | 2 | 2 | 0 | Yes | 9 |
| Tourneo Custom (inactive) | 3 | 3 (legacy data) | — | — | 9 |
| Transit Custom | 4 | 4 | 2 | — | 12 |
| Transit Custom PHEV | 2 | 2 | (via parent) | — | 12 |
| Transit Custom Trail | 1 | 1 | (via parent) | — | 12 |
| E-Transit | 2 | 0 | 0 | — | 12 |
| E-Transit Custom | 2 | 0 | 0 | — | 12 |
| Transit Van / Bus / Cab Chassis | 5 | 0 | 0 | — | 12 |

## Key files

| Path | Role |
|---|---|
| `scripts/populate-ford-from-brochures.ts` | Orchestrator — run this |
| `scripts/ford-url-map.ts` | Shared URL helpers, reads ford-vehiclesmenu.json |
| `scripts/populate-ford-pricing-rsc.ts` | variant_pricing + offers + products.price_amount |
| `scripts/populate-ford-accessories-rsc.ts` | accessories table |
| `scripts/populate-ford-colour-pricing-rsc.ts` | variant_colors.price_delta + is_standard |
| `scripts/populate-ford-galleries-rsc.ts` | variant_colors.gallery_urls (threshold-guarded enrichment) |
| `scripts/fetch-ford-json.ts` | Refreshes ford-vehiclesmenu.json |
| `scripts/ford-vehiclesmenu.json` | Source of truth for canonical Build & Price URLs |
| `scripts/sync-ford-models.ts` | Lineup sync (manual, when Ford adds a nameplate) |
| `dashboard/scripts/seed-ford-colors.mjs` | Static-file color seed (hero/swatch/gallery) |

## Known gotchas

- **Groq transient failures**: The brochure extraction retries 429/5xx/network up to 3 times with exp. backoff. If all chunks for a nameplate still fail, you'll see `✗ all N chunks failed — <nameplate> extraction empty`. Re-run to recover.
- **LLM title drift**: Groq occasionally renames variants across runs (`Trail` ↔ `Trail AWD`). The populate script handles this via soft-discontinue + auto color re-seed. No action required.
- **GPAS reference files** for `seed-ford-colors.mjs` live at `/Users/paulgiurin/Downloads/OEM-variants-main/data/ford/` — NOT in the repo. Re-download to `scripts/ford-reference/` if the machine changes.
- **`primary_image_r2_key` is always null** for Ford. The dashboard hero image comes from `variant_colors.hero_image_url` joined by `product_id`.
- **Offers table has no unique constraint** on `external_key` — the pricing script does manual SELECT-then-UPDATE/INSERT. Do the same in any future offer writer.
- **Manual deactivations** (`vehicle_models.meta_json.deactivated_reason`) are respected by `sync-ford-models.ts` — they won't be un-deactivated on sync.

## Extending to new nameplates / URL changes

1. Ford adds a new nameplate on ford.com.au → their menu JSON gets a new entry with `additionalCTA`
2. Run `pnpm tsx scripts/fetch-ford-json.ts` to refresh `ford-vehiclesmenu.json`
3. Run `pnpm tsx scripts/sync-ford-models.ts --apply` to create the vehicle_model row with the right `brochure_url`
4. Run `pnpm tsx scripts/populate-ford-from-brochures.ts --apply`

All four RSC scripts will auto-discover the new nameplate's URL via `ford-url-map.ts` — no hand-editing required.

## Closing the 10-product gap

If public RSC ever stops being enough (currently 40/50 priced), the two viable routes are:

- **Playwright-driven Build & Price flow** — walk each missing nameplate's interactive configurator, capture the internal Polk/Nukleus API calls, extract per-variant pricing. Requires maintenance as Ford evolves the SPA.
- **Alternate data source** — RedBook API, CarSales partner feed, dealer network. Quality/freshness/legal constraints vary.

Neither is needed for the 40/50 today — flag only if missing nameplates become material to the product.

---

## Next session — open threads

Three pieces of follow-up work identified at the end of the 2026-04-23 session. All are independent and can be picked up in any order.

### 1. Per-state driveaway pricing (data bug, real impact)

**Problem:** `populate-ford-pricing-rsc.ts` fetches `/price/<Name>?postalCode=3000&usageType=P&_rsc=x` once per nameplate and copies the single `polkVehicleDriveAwayPrice` into all 8 `variant_pricing.driveaway_*` columns. Postcode 3000 is Melbourne, so every state column actually holds VIC pricing.

Ford's RSC is postcode-sensitive — stamp duty, CTP, and rego differ per state. Verified spread for Ranger Sport 2.0L BiT:
```
VIC 3000: $72,289   QLD 4000: $72,309   NT 0800: $72,356
SA 5000:  $72,509   TAS 7000: $72,981   NSW 2000: $73,443
ACT 2601: $73,524   WA 6000:  $75,176   ← +$2.9k vs VIC
```

**Fix:** in `processModel`, swap the single fetch for 8 parallel fetches (one per capital-city postcode) and populate each `driveaway_<state>` column from its matching payload. RRP / offers / techSpecs / accessories / colour pricing are NOT postcode-sensitive — keep single-fetch for those. Expected scale: ~104 fetches per run (13 priced nameplates × 8 states), all parallel, under a minute.

Postcode map:
```ts
const STATE_POSTCODES: Record<string, string> = {
  nsw: '2000', vic: '3000', qld: '4000', wa: '6000',
  sa:  '5000', tas: '7000', act: '2601', nt: '0800',
};
```

`products.price_amount` (single headline figure) should keep the VIC value as the default display price, since most dashboard users are eastern-seaboard.

### 2. Automated Ford refresh (cron)

Currently everything runs manually via `pnpm tsx scripts/populate-ford-from-brochures.ts --apply`. No cron. Other OEMs in this repo refresh daily via `src/orchestrator.ts`. Options:

- **Simplest**: add a Cloudflare Worker cron trigger (weekly is enough — Ford prices don't change daily). Existing Cloudflare infra is already deployed for the dashboard.
- **Run cadence**: weekly for the brochure + colour seed (expensive LLM extraction); daily for the 4 RSC scripts (cheap, idempotent, refreshes offers / paint premiums / Ford tweaks).
- **Watch list**: brochure URLs in `vehicle_models.brochure_url` can go stale if Ford publishes a new MY — detect 404s and fall back to the previous successful run.

### 3. Dealer accessory catalog (Playwright)

Current `accessories` coverage is 35 rows from Ford's `/summary` `featureOptions` — factory-fit options only. Ford's full dealer catalog at `https://www.ford.com.au/accessories/<model>/` is 403-blocked on plain fetch (Akamai). Every other accessory-rich OEM uses Playwright via `dashboard/scripts/seed-<oem>-accessories.mjs` (KGM: 225, Mitsubishi: 223, Mazda: 266). New `seed-ford-accessories.mjs` following the same template should unlock 100-300 more accessories per nameplate. See `docs/ACCESSORIES_DISCOVERY.md` for the shared pattern.

**Note:** the existing 35 `accessories` + 35 `accessory_models` join rows should stay — they're the factory-fit-at-order-time options, which are distinct from dealer-installed. Use `meta_json.source` to distinguish: `'rsc_summary'` (current) vs `'dealer_catalog'` (new).

---

## Session state at handoff (2026-04-23 04:23 UTC)

- DB fresh: all 37 Ford priced products + 35 accessories + 301 variant_colors
- Code state: 13 commits ahead on origin/main, all pushed
- Deployment: oem-dashboard.pages.dev redeployed with ABN price display + meta_json in fetchProducts
- Open PRs: none
- Blocked on: nothing — the three threads above are standalone new work
