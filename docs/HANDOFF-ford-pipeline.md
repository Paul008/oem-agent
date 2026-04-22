# Ford pipeline — session handoff

**Date:** 2026-04-22
**Context at handoff:** brochure variants + pricing + offers + accessories complete. Per-variant gallery enrichment deliberately deferred (see Session 3 note).

**Session 2 status (2026-04-22):** ✅ Shipped. `scripts/populate-ford-pricing-rsc.ts` parses `/price/<Name>?_rsc=x` payloads, writes 8 `variant_pricing` rows + 8 `offers` rows across Ranger / Everest / F-150 (the three nameplates Ford exposes pricing for via RSC). The other 14 nameplates return a 153k template-only payload — documented limitation, not a parser bug. Chained into `populate-ford-from-brochures.ts` after the color seed.

**Accessories (2026-04-22):** ✅ Shipped. `scripts/populate-ford-accessories-rsc.ts` parses `/price/<Name>/summary?_rsc=x`, extracts priced factory-fit options (state=A, price>0, non-config category), and upserts into the `accessories` table. 10 rows written covering Ranger (6), Everest (3), Mustang (1) — categories: Utility, Styling & Appearance, Option Packs, Comfort and Convenience. Image URLs proxied via the existing CF worker. Chained after the pricing step.

---

## Current state (working today)

### Database
- **17 active Ford nameplates** in `vehicle_models`, all with correct showroom URLs
- **50 active products** in `products`, all with:
  - Rich `specs_json` (avg 7.5 categories — engine, transmission, capacity, dimensions, towing, performance, safety, wheels)
  - Brochure-sourced variant lineup, key features, power/torque
  - `meta_json.source = 'brochure'` with extraction model + timestamp
- **301 variant_colors** rows, 100% hero+gallery+swatch coverage
- **3 Tourneo Custom products** preserved (inactive vehicle_model, historical data)

### Scripts (canonical path)
```
pnpm tsx scripts/populate-ford-from-brochures.ts --apply
```
What it does end-to-end:
1. For each active `ford-au` vehicle_model with `brochure_url`:
   - Fetch PDF (plain `fetch()` — Ford CDN not bot-protected)
   - Parse via `pdf-parse` (`PDFParse` class)
   - Chunk by page markers (`-- N of M --`)
   - LLM-extract each chunk via Groq Llama 3.3 70B with strict JSON schema
   - Merge chunks by variant name (later chunks fill null fields)
   - Per-model variant filter (Ranger vs Raptor, Transit Van vs Bus vs Cab Chassis)
   - Title dedupe (handles `"Transit Custom Trail" + "Trail AWD"` → `"Transit Custom Trail AWD"`)
2. **Non-destructive upsert** — UPDATE by title match, INSERT new, soft-discontinue missing. Product IDs stable → `variant_colors` / `variant_pricing` FKs survive.
3. Auto-chains `dashboard/scripts/seed-ford-colors.mjs` — re-attaches colors to any newly-titled products.

### Key files touched this session
- `scripts/populate-ford-from-brochures.ts` — canonical refresh script
- `scripts/sync-ford-models.ts` — lineup sync from `ford-vehiclesmenu.json`
- `scripts/fix-ford-urls.ts` — one-shot URL repair (already applied)
- `scripts/backfill-ford-model-ids.ts` — one-shot orphan fix (already applied)
- `scripts/seed-ford-discovered-apis.ts` — 6 Ford APIs registered in `discovered_apis`
- `scripts/fetch-ford-json.ts` — refreshes `scripts/ford-vehiclesmenu.json`
- `scripts/populate-ford-variants.mjs` — **DEPRECATED** (hardcoded Feb data — kept for price overlay reference)
- `scripts/populate-ford-db.mjs` — **DEPRECATED** (superseded by sync-ford-models)
- `scripts/populate-ford-db.ts` — **DEPRECATED** (pricing.data endpoint dead)
- `src/orchestrator.ts:2585` — `enrichFordProductsWithVariants()` is now a no-op with context-preserving comment
- `supabase/migrations/20260422_fix_ford_model_urls.sql` — URL repair migration
- `docs/KNOWN_ISSUES_RUNBOOK.md` — new section 10b on Ford trim refresh
- `docs/OEM_DATA_PIPELINES.md` — Ford row corrected to reflect brochure-based reality

---

## SESSION 2 — `populate-ford-pricing-rsc.ts` (pricing + offers)

### Discovery (already done)
`GET https://www.ford.com.au/price/<Name>?postalCode=3000&usageType=P&_rsc=<token>`
- Returns 349KB RSC payload (`Content-Type: text/x-component`)
- Plain `fetch()` works with `User-Agent: Mozilla/5.0` and `RSC: 1` header — **no Akamai block**
- `_rsc=<token>` value is arbitrary; any short string works (Ford just needs the param present to route to the RSC handler)

### What to extract

**Structure of each build block** (keyed like `ABML1_CA#BC_DGACX_DR--G_EN-YN_SE#F7_TR-EU`):
```jsonc
{
  "basePrice": {
    "polkVehicleDriveAwayPrice": 72289.4,    // → variant_pricing.driveaway_*
    "grossRetail": 66390,                     // → variant_pricing.rrp
    "netRetail": 60354.55,                    // → meta_json
    "dealerDelivery": 2995,                   // → meta_json
    "reservationFee": 250,                    // → meta_json
    "vatRate": 0, "vatAmount": 6035.45
  },
  "keyFeatures": { "features": [{ "code": "EN-YN", "descKf": "2.0L Bi-Turbo Diesel Engine" }, ...] },
  // Offer block:
  "tagLine": "$4K Fuel Card Offer",
  "specialInformation": "<u><b>$4K fuel card* with select Ranger Bi-Turbo models</b></u>...Offer available from 1 April 2026 until last unit sold..."
}
```

### Implementation notes

**RSC format** — it's Next.js 14 streaming serialization. Lines start with a number prefix (e.g. `0:`, `1:`, `2:`). Component trees use `$` refs. Inline JSON chunks are under lines like `b:{...}` or `10:{...}`. Strategy:
1. Split response on `\n` boundaries — each line is either a component ref or a JSON blob
2. For each line starting with `<hex>:{`, try `JSON.parse` on the tail
3. Recursively walk the parsed object looking for keys matching `/^[A-Z0-9_]+#[A-Z0-9]+/` (build tuples) OR objects containing `basePrice.polkVehicleDriveAwayPrice`
4. Extract the build tuple → price + features + offer mapping

**Mapping to our products**:
Build tuple format: `<SERIES>_<BODYSTYLE>_<POWERTRAIN>_...` where each segment is already stored in `vehicle_models.meta_json.nukleus_codes` (or inferrable from `series_code` on our existing products). Match on series code first (`ABML1_SE#F7`), then body style, then powertrain.

**Schema for variant_pricing write**:
```
{
  product_id: <existing product UUID>,
  price_type: 'driveaway',
  rrp: grossRetail,
  driveaway_nsw: polkVehicleDriveAwayPrice,   // Ford Polk is national — same value all states
  driveaway_vic: polkVehicleDriveAwayPrice,
  driveaway_qld: polkVehicleDriveAwayPrice,
  driveaway_wa: polkVehicleDriveAwayPrice,
  driveaway_sa: polkVehicleDriveAwayPrice,
  driveaway_tas: polkVehicleDriveAwayPrice,
  driveaway_act: polkVehicleDriveAwayPrice,
  driveaway_nt: polkVehicleDriveAwayPrice,
  fetched_at: new Date().toISOString(),
}
```

**Schema for offers write**:
```
{
  oem_id: 'ford-au',
  model_id: <vehicle_models.id>,
  product_id: <products.id if single-variant offer, else null>,
  title: tagLine,                              // "$4K Fuel Card Offer"
  description: specialInformation,             // HTML allowed
  validity_start: parse from text,             // "from 1 April 2026" → Date
  validity_end: parse from text,               // "until last unit sold" → null (rolling)
  source_url: `https://www.ford.com.au/price/${Name}`,
  meta_json: { build_tuple: <key> },
}
```

### Probe-first approach
Before coding: run a probe against `/price/Ranger?_rsc=x` and write the decoded payload to `/tmp/ford-rsc-ranger.json` — it'll clarify the line-prefixed serialization. `dashboard/scripts/` has OEM examples of Next.js-style parsing to crib from.

### Target LOC: ~200
### Chain after brochure populate:
```ts
// scripts/populate-ford-from-brochures.ts — inside the final "chain" block,
// insert before the seed-ford-colors.mjs execSync call:
const pricingScript = path.resolve(__dirname, 'populate-ford-pricing-rsc.ts');
if (fs.existsSync(pricingScript)) {
  console.log('\n=== Chaining Ford pricing+offers RSC extract ===');
  execSync(`npx tsx "${pricingScript}" --apply`, { stdio: 'inherit' });
}
```

---

## SESSION 3 — `populate-ford-galleries-rsc.ts` (per-variant image galleries) — DEFERRED

**Status (2026-04-22):** Deliberately deferred after probing. Rationale:
- Existing Ford `variant_colors` (seeded by `dashboard/scripts/seed-ford-colors.mjs`) already averages **10.8 gallery URLs per row across all 301 rows, with min=2 and zero empty rows**. The "coverage is light" framing in the original plan is outdated.
- The `/summary` RSC payload contains 33 unique GPAS URLs but they're keyed as `imageURL-27`, `imageURL-28`, etc. — **angle indices, not color names**. Ford doesn't expose a clean color→image mapping in the streaming payload; those 33 URLs are the default-color 3D rotator frames, not per-color multi-angle sets.
- Marginal upside (10.8 → maybe 15 per row) doesn't justify the complexity of inferring color assignment from image GUIDs.

If revisited, the likely winning approach is either (a) scraping the interactive `/build` flow with Playwright to capture color-swap image state, or (b) intercepting the browser's image requests on page load per color — both out of scope for an RSC-only parser.

### Original plan (preserved for reference)
`GET https://www.ford.com.au/price/<Name>/summary?series=<code>&powerTrain=<code>&bodyStyle=<code>&postalCode=3000&usageType=P&_rsc=<token>`
- Returns 225KB RSC
- Contains **33 GPAS CDN images per configured build** — `https://www.gpas-cache.ford.com/guid/...`
- Proxied via the existing Worker proxy: `https://oem-agent.adme-dev.workers.dev/media/ford-au/<base64 url>`

### What to extract
For each active product (or build tuple), fetch the summary page with the tuple codes, parse gallery images per color. Already-seeded `variant_colors` has `hero_image_url` but `gallery_urls` coverage is light — this would richen it.

### Implementation notes

**Per-variant loop**:
1. Query `products` where `oem_id='ford-au'` and extract series/bodyStyle/powertrain from `meta_json` (stored in Session 2 write)
2. For each: `fetch(/price/${nameplate}/summary?series=${s}&powerTrain=${p}&bodyStyle=${b}&_rsc=x)`
3. Find color blocks in the RSC — each has multiple angle URLs (exterior, interior, detail)
4. UPDATE `variant_colors.gallery_urls` in place by matching `color_name` on the existing row → product_id

### Proxy URL construction (already established in `seed-ford-colors.mjs`)
```js
function encodeUrl(url) {
  return Buffer.from(url).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function proxyUrl(url) { return `https://oem-agent.adme-dev.workers.dev/media/ford-au/${encodeUrl(url)}`; }
```

### Target LOC: ~150
### Chain after pricing script.

---

## Gotchas / context for next session

- **GPAS reference files** are at `/Users/paulgiurin/Downloads/OEM-variants-main/data/ford/` — NOT in the repo. If the machine changes, re-download or put them in `scripts/ford-reference/`. Only used by `seed-ford-colors.mjs`.
- **LLM title inconsistency**: Groq Llama 3.3 occasionally renames variants across runs (`Trail` ↔ `Trail AWD`, `E-Transit 420L` ↔ `E-Transit 420L High-Roof`). The populate script handles this via soft-discontinue + auto color re-seed chain. No action required.
- **`primary_image_r2_key` is always null** for Ford products. The dashboard image comes from `variant_colors.hero_image_url` joined by `product_id`. Do not try to set `primary_image_r2_key` directly.
- **Supabase client**: use `process.env.SUPABASE_URL` + `process.env.SUPABASE_SERVICE_ROLE_KEY` from `.env`. All new scripts should `import 'dotenv/config'` first.
- **Groq key**: `process.env.GROQ_API_KEY` (same one the orchestrator uses).
- **Ford lineup sync lives separately**: `scripts/sync-ford-models.ts --apply` runs against `scripts/ford-vehiclesmenu.json` (refresh via `scripts/fetch-ford-json.ts`). Not part of the brochure populate chain — run manually when Ford announces a new nameplate.
- **Deactivated/manual override**: `vehicle_models.meta_json.deactivated_reason` is respected by sync-ford-models — don't sync will un-deactivate manually-deactivated rows. See `sync-ford-models.ts:88-95`.

## Quick start for Session 2

```bash
cd /Users/paulgiurin/Documents/Projects/oem-agent

# 1. Probe + save raw RSC payload for Ranger
node -e "(async()=>{const r=await fetch('https://www.ford.com.au/price/Ranger?postalCode=3000&usageType=P&_rsc=x',{headers:{'User-Agent':'Mozilla/5.0 Chrome/120','RSC':'1'}});const t=await r.text();require('fs').writeFileSync('/tmp/ford-rsc-ranger.txt',t);console.log('wrote',t.length);})()"

# 2. Inspect — find basePrice blocks
grep -o 'polkVehicleDriveAwayPrice":[0-9.]*' /tmp/ford-rsc-ranger.txt | head

# 3. Write scripts/populate-ford-pricing-rsc.ts per the plan above

# 4. Test on Ranger alone first
pnpm tsx scripts/populate-ford-pricing-rsc.ts --slug=ranger --apply

# 5. Full sweep
pnpm tsx scripts/populate-ford-pricing-rsc.ts --apply

# 6. Chain into populate-ford-from-brochures.ts final block
```

## Success criteria — end of Session 2
- `variant_pricing` has ≥40 Ford rows with driveaway + RRP
- `offers` has Ford offers keyed by model_id with validity windows
- Running `populate-ford-from-brochures.ts --apply` refreshes trims + specs + colors + **pricing + offers** in one command

## Success criteria — end of Session 3
- `variant_colors.gallery_urls` has richer multi-angle coverage (current avg ~10.8 URLs; target 15+)
- All chained into single-command refresh
