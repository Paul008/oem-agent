#!/usr/bin/env node
/**
 * Hydrate Ford Image Library assets with per-asset metaList detail.
 *
 * The search endpoint (seed-ford-fil-assets.mjs) only returns lightweight fields.
 * This script fetches `/asset/FIL/{id}` for each un-hydrated row and maps the
 * 22-field metaList into structured columns (nameplate, keywords, usage_rights,
 * expiry_date, media_type, etc.) plus the full metaList payload into `metadata`.
 *
 * Depends on migration `20260422000000_portal_assets_enrichment.sql`.
 *
 * Auth: JWT via FORD_FIL_TOKEN env var (same as seed script).
 *
 * Run:
 *   # Hydrate all un-hydrated Ford assets
 *   node dashboard/scripts/hydrate-ford-fil-metadata.mjs
 *
 *   # Re-hydrate everything (force refresh)
 *   node dashboard/scripts/hydrate-ford-fil-metadata.mjs --force
 *
 *   # Limit batch size for a test run
 *   node dashboard/scripts/hydrate-ford-fil-metadata.mjs --limit=100
 *
 *   # Control request concurrency (default 8)
 *   node dashboard/scripts/hydrate-ford-fil-metadata.mjs --concurrency=12
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc',
)

const OEM_ID = 'ford-au'
const API_BASE = 'https://api-fil.brandhub.cloud/rest_v2/AssetService/v1'
const EMAIL = 'philh@cpford.com.au'
const TOKEN = process.env.FORD_FIL_TOKEN

const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10) || Infinity
const CONCURRENCY = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? '8', 10)
const PAGE_SIZE = 500 // Supabase rows-per-fetch when listing candidates

if (!TOKEN) {
  console.error('ERROR: Set FORD_FIL_TOKEN from a logged-in fordimagelibrary.com.au session.')
  process.exit(1)
}

// ═══════════════ FIL API ═══════════════

async function fetchDetail(assetID) {
  const res = await fetch(`${API_BASE}/asset/FIL/${assetID}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://www.fordimagelibrary.com.au',
      Referer: 'https://www.fordimagelibrary.com.au/',
      'X-Timezone-Offset': '-600',
      emailId: EMAIL,
    },
  })
  if (res.status === 401 || res.status === 403) {
    console.error(`\nToken expired (HTTP ${res.status}). Refresh FORD_FIL_TOKEN and rerun.`)
    process.exit(1)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return json.instance || null
}

// ═══════════════ METALIST → STRUCTURED ═══════════════

function valueByField(metaList, fieldName) {
  const m = metaList.find(x => x?.fieldName === fieldName)
  const v = m?.fieldValue
  if (v === undefined || v === null || v === '') return null
  return typeof v === 'string' ? v.trim() : v
}

// "Mon Apr 18 2026 12:28:57 GMT+1000 (Australian Eastern Standard Time)" → ISO
function parseLocaleDate(s) {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// "18/04/2026 01:14 PM" → ISO (AEST)
function parseFilDate(s) {
  if (!s) return null
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return null
  let [, dd, mm, yy, hh, mi, ap] = m
  const year = yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10)
  let hour = parseInt(hh, 10)
  if (ap?.toUpperCase() === 'PM' && hour < 12) hour += 12
  if (ap?.toUpperCase() === 'AM' && hour === 12) hour = 0
  const iso = `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${mi}:00+10:00`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function parseDate(s) {
  return parseLocaleDate(s) || parseFilDate(s)
}

function mapMetaList(instance) {
  const ml = Array.isArray(instance.metaList) ? instance.metaList : []

  // Full map for JSONB storage — fieldName → fieldValue
  const metadata = {}
  for (const m of ml) {
    if (m?.fieldName) metadata[m.fieldName] = m.fieldValue ?? null
  }

  const keywords = (valueByField(ml, 'F_Keywords') || '')
    .split(/[,;|]/)
    .map(s => s.trim())
    .filter(Boolean)

  const discontinuedRaw = valueByField(ml, 'F_Discontinued')
  const discontinued = discontinuedRaw ? /yes|true/i.test(discontinuedRaw) : null

  return {
    record_name: valueByField(ml, 'F_RecordName') || instance.recordName || null,
    nameplate: valueByField(ml, 'F_Nameplate') || null,
    model_label: valueByField(ml, 'F_Model') || null,
    color_label: valueByField(ml, 'F_Colour') || null,
    media_type: valueByField(ml, 'F_Media_Type') || null,
    asset_type_label: valueByField(ml, 'F_AssetTypes') || null,
    usage_rights: valueByField(ml, 'F_Usage Rights') || valueByField(ml, 'F_UsageRights') || null,
    job_number: valueByField(ml, 'F_Job_Number') || null,
    copyright_notice: valueByField(ml, 'F_Copyright_Notice') || null,
    keywords: keywords.length ? keywords : null,
    discontinued,
    expiry_date: parseDate(valueByField(ml, 'ExpiryDate') || instance.expiryDate) || null,
    appearance_date: parseDate(valueByField(ml, 'F_Appearance_Date')) || null,
    source_created_at: parseDate(valueByField(ml, 'F_AssetCreated') || instance.crDate) || null,
    source_modified_at: parseDate(instance.modDate) || null,
    modified_by: instance.modBy || null,
    interface_id: instance.interfaceID ? String(instance.interfaceID) : null,
    category_path: instance.categoryPath || null,
    metadata,
    metadata_hydrated_at: new Date().toISOString(),
  }
}

// ═══════════════ CONCURRENCY ═══════════════

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      try { out[i] = await fn(items[i], i) }
      catch (e) { out[i] = { __error: e?.message || String(e) } }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return out
}

// ═══════════════ MAIN ═══════════════

async function listCandidates() {
  const all = []
  let from = 0
  while (all.length < LIMIT) {
    let q = supabase
      .from('portal_assets')
      .select('id, external_id')
      .eq('oem_id', OEM_ID)
      .eq('external_source', 'ford_image_library')
      .order('last_synced_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (!FORCE) q = q.is('metadata_hydrated_at', null)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all.slice(0, LIMIT)
}

async function main() {
  console.log('Ford Image Library Metadata Hydrator')
  console.log('═'.repeat(50))
  console.log(`Mode: ${FORCE ? 'force (re-hydrate all)' : 'incremental (un-hydrated only)'}`)
  console.log(`Concurrency: ${CONCURRENCY}`)
  if (LIMIT !== Infinity) console.log(`Limit: ${LIMIT}`)

  const candidates = await listCandidates()
  console.log(`\nCandidates: ${candidates.length}`)
  if (candidates.length === 0) {
    console.log('Nothing to do.')
    return
  }

  let done = 0
  let failed = 0
  const t0 = Date.now()

  // Pull detail concurrently, upsert in batches of 100.
  const BATCH = 100
  for (let off = 0; off < candidates.length; off += BATCH) {
    const slice = candidates.slice(off, off + BATCH)

    const details = await mapLimit(slice, CONCURRENCY, async (c) => {
      const inst = await fetchDetail(c.external_id)
      return { id: c.id, inst }
    })

    const updates = []
    for (const d of details) {
      if (!d || d.__error || !d.inst) { failed++; continue }
      const mapped = mapMetaList(d.inst)
      updates.push({ id: d.id, ...mapped })
    }

    if (updates.length) {
      // Upsert in a single call keyed on id (primary key).
      const { error } = await supabase
        .from('portal_assets')
        .upsert(updates, { onConflict: 'id', ignoreDuplicates: false })
      if (error) {
        console.error(`\nBatch ${off / BATCH} upsert failed: ${error.message}`)
        failed += updates.length
      }
      else {
        done += updates.length
      }
    }

    const rate = done / ((Date.now() - t0) / 1000)
    process.stdout.write(`\r  Hydrated ${done}/${candidates.length} (${failed} failed) ${rate.toFixed(1)}/s`)
  }
  console.log()

  // Quick sample summary.
  const { data: sample } = await supabase
    .from('portal_assets')
    .select('nameplate, asset_type_label, usage_rights, keywords')
    .eq('oem_id', OEM_ID)
    .not('metadata_hydrated_at', 'is', null)
    .limit(2000)

  const byNameplate = {}
  const byType = {}
  const byRights = {}
  for (const r of sample ?? []) {
    const n = r.nameplate || '(none)'
    byNameplate[n] = (byNameplate[n] || 0) + 1
    byType[r.asset_type_label || '(none)'] = (byType[r.asset_type_label || '(none)'] || 0) + 1
    byRights[r.usage_rights || '(none)'] = (byRights[r.usage_rights || '(none)'] || 0) + 1
  }

  console.log('\nTop nameplates (campaigns, sample of 2000):')
  Object.entries(byNameplate).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => console.log(`  ${k}: ${v}`))
  console.log('\nAsset types (F_AssetTypes):')
  Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => console.log(`  ${k}: ${v}`))
  console.log('\nUsage rights:')
  Object.entries(byRights).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`))
}

main().catch(err => {
  console.error('\nFatal:', err)
  process.exit(1)
})
