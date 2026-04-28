# Ford Ingestion — Open Items

Two related issues parked here on 2026-04-29 so the dealer-network UI work
can continue without blocking on OEM Agent ingestion changes. Both surface
as Frankston Ford build-page gaps but the fix lives in this repo.

## 1. Ford CDN now Akamai-blocks every brochure URL

**Symptom**

`scripts/populate-ford-from-brochures.ts` returns `PDF fetch 404` (actually
**HTTP 403**) for every active Ford `vehicle_models.brochure_url`. Probed
all 17 Ford models in DB on 2026-04-29 — every URL 403s with browser-like
headers (User-Agent, Referer, Accept). Ford has hardened the
`/content/dam/` tree with Akamai bot protection since the previous
successful ingestion run.

**Impact**

- New Ford trims Ford publishes won't appear in our DB
- All 17 Ford `vehicle_models` are stuck on whatever variants were
  ingested when the CDN was open
- Live build pages keep working with stale variants but pricing/specs
  drift over time

**Fix paths**

| Path | Effort | Notes |
|---|---|---|
| **A. Puppeteer-fetch PDFs** in the existing pipeline | ~1 day | Reuse `src/utils/network-browser.ts` patterns. Adds ~30s per model to ingestion. Stopgap — keeps the brochure-shaped flow alive. |
| **B. Switch variant source to Nukleus pricing API** | ~3 days | The script `harvest-ford-catalogs.ts` already captures Nukleus catalog tuples. Build a `populate-ford-from-nukleus.ts` that uses those tuples to fetch structured variant data from Ford's pricing API (which already powers /price/{Nameplate}). Authoritative pricing, no PDF chunking, no Groq round-trips. **Long-term right answer.** |

**Recommendation:** A as a stopgap, then B.

**Repro**

```bash
cd /Users/paulgiurin/Documents/Projects/oem-agent
npx tsx scripts/populate-ford-from-brochures.ts --slug=ranger-super-duty
# → "PDF fetch 404"  (actually 403 from Akamai)
```

**Files involved**

- `scripts/populate-ford-from-brochures.ts` — uses plain `fetch()`. Comment
  on line ~3 says *"Ford CDN isn't bot-blocked on /content/dam"* — this
  assumption is now wrong.
- `src/utils/network-browser.ts` — has the puppeteer wrapper that path A
  would reuse.

## 2. Ranger Super Duty — only 3 cab-chassis variants in DB

**Symptom**

Frankston Ford build page at `/build/ranger-super-duty` shows 3 variants:
Single Cab, Super Cab, Double Cab — all `Cab-Chassis` body style. User
flagged Ford's pricing endpoint as showing more variants
(`https://www.ford.com.au/price/RangerSuperDuty?postalCode=3000&usageType=B`).

**Likely true state**

Super Duty IS Ford's chassis-cab work truck — Pickups are the regular
Ranger. The 3 cab-chassis variants might be the complete *body-style*
lineup. What's missing is probably **trim levels within each cab style**
(XL / XLT / etc.) which Ford lists on the Nukleus-backed pricing page but
which the brochure parsing didn't pick up — or which Ford added after our
last successful brochure parse.

**Confirmed via Supabase**

```sql
SELECT title, subtitle, external_key, price_amount
FROM products WHERE oem_id='ford-au' AND title ILIKE '%super duty%';
```

Returns 3 rows, all with `subtitle = 'Cab-Chassis'`, all sharing the
same `external_key` prefix `ford-au_ranger-super-duty`.

**Blocked on**

Issue #1 (CDN block). Once brochure fetching works again, re-running
`populate-ford-from-brochures.ts --slug=ranger-super-duty --apply`
*may* surface more trims. If Ford's brochure also doesn't list trim
levels (likely — work-truck brochures tend to be terse), then Path B
(Nukleus migration) becomes the only fix because Nukleus exposes the
full configurable trim matrix.

## Status

- **2026-04-29:** Both items parked. Frankston Ford build page surfaces
  what's in the DB correctly; the gap is upstream. Dealer-network UI work
  continues.
- **No changes** to current ingestion logic — that would risk breaking
  the other 16 Ford models which still show their last-successful data.
