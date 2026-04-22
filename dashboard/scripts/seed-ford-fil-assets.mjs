#!/usr/bin/env node
/**
 * Populate portal_assets with Ford Image Library (FIL) marketing assets.
 *
 * Source: Indicia Worldwide "BrandHub" DAM behind fordimagelibrary.com.au.
 * API: https://api-fil.brandhub.cloud/rest_v2/AssetService/v1
 * CDN: Public S3 (s3-ap-southeast-2.amazonaws.com/fil-filestor-storage-au)
 *
 * Auth: JWT Bearer token scraped from a logged-in browser session.
 *   - Set FORD_FIL_TOKEN env var (preferred), or paste into FALLBACK_TOKEN below.
 *   - Token TTL is ~24h (exp claim in JWT).
 *
 * To refresh the token:
 *   1. Log into https://www.fordimagelibrary.com.au (dealer SSO).
 *   2. DevTools → Network → filter "api-fil" → any request → copy
 *      the `Authorization: Bearer …` header value (no "Bearer " prefix).
 *   3. export FORD_FIL_TOKEN="<jwt>"
 *
 * Run:
 *   # Full sync (all ~15k assets across the six FIL root categories)
 *   node dashboard/scripts/seed-ford-fil-assets.mjs
 *
 *   # Narrow to a keyword (matches UI search box, e.g. "banners")
 *   node dashboard/scripts/seed-ford-fil-assets.mjs --search=banners
 *
 *   # Dry run — fetch + transform, don't write
 *   node dashboard/scripts/seed-ford-fil-assets.mjs --dry-run
 */
import { createClient } from '@supabase/supabase-js'

// ═══════════════ CONFIG ═══════════════

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc',
)

const OEM_ID = 'ford-au'
const API_BASE = 'https://api-fil.brandhub.cloud/rest_v2/AssetService/v1'
const CATALOGUE = 'FIL'
const EMAIL = 'philh@cpford.com.au'
// Six FIL root categories — search is recursive into subcategories.
const ROOT_CATEGORY_IDS = [38441, 38443, 38444, 38445, 44149, 44150]
const PAGE_SIZE = 1000

const FALLBACK_TOKEN = ''
const TOKEN = process.env.FORD_FIL_TOKEN || FALLBACK_TOKEN

const args = process.argv.slice(2)
const SEARCH = (args.find(a => a.startsWith('--search='))?.split('=')[1] ?? '').trim()
const DRY_RUN = args.includes('--dry-run')

if (!TOKEN) {
  console.error('ERROR: No FIL token. Set FORD_FIL_TOKEN or paste into FALLBACK_TOKEN.')
  console.error('  1. Log into https://www.fordimagelibrary.com.au')
  console.error('  2. DevTools → Network → filter "api-fil" → copy Bearer token')
  console.error('  3. export FORD_FIL_TOKEN="<jwt>"')
  process.exit(1)
}

// ═══════════════ ASSET NAME PARSER ═══════════════

const KNOWN_MODELS = [
  'ranger-raptor', 'ranger-hybrid', 'ranger',
  'everest',
  'mustang-mach-e', 'mustang',
  'f-150',
  'e-transit-custom', 'e-transit',
  'transit-custom', 'transit',
  'tourneo-custom', 'tourneo',
  'puma', 'escape', 'focus', 'fiesta', 'endura', 'bronco',
]

const KNOWN_TRIMS = [
  'platinum', 'wildtrak', 'stormtrak', 'raptor', 'sport', 'tremor',
  'xlt', 'xls', 'xl',
  'lariat',
  'ambiente', 'trend',
  'gt-fastback', 'gt-convertible', 'dark-horse', 'gt',
]

const KNOWN_ANGLES = ['profile', 'rear', 'front', 'side', 'three-quarter', '3-4', 'interior']

function normalise(s) {
  return (s || '').toLowerCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-').trim()
}

function parseAssetName(name, categoryPath) {
  const haystack = normalise(`${name} ${categoryPath || ''}`)

  let parsed_model = null
  for (const m of KNOWN_MODELS) {
    if (new RegExp(`\\b${m.replace(/-/g, '[\\s-]')}\\b`).test(haystack)) {
      parsed_model = m
      break
    }
  }

  let parsed_trim = null
  const sortedTrims = [...KNOWN_TRIMS].sort((a, b) => b.length - a.length)
  for (const t of sortedTrims) {
    if (new RegExp(`\\b${t.replace(/-/g, '[\\s-]')}\\b`).test(haystack)) {
      parsed_trim = t
      break
    }
  }

  let parsed_angle = null
  for (const a of KNOWN_ANGLES) {
    if (haystack.includes(a)) {
      parsed_angle = a
      break
    }
  }

  return { parsed_model, parsed_trim, parsed_angle, parsed_color: null }
}

function extFromFilename(filename) {
  if (!filename) return null
  const m = filename.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : null
}

function fileFormatToExt(fileFormat, filename) {
  const fromFile = extFromFilename(filename)
  if (fromFile) {
    if (fromFile === 'jpeg') return 'jpg'
    return fromFile
  }
  if (!fileFormat) return null
  const s = fileFormat.toLowerCase()
  // Order matters: more-specific words before the generic "portable".
  if (s.includes('jpeg') || s.includes('jpg')) return 'jpg'
  if (s.includes('network graphics') || s.includes('png')) return 'png'
  if (s.includes('document format') || s.includes('pdf')) return 'pdf'
  if (s.includes('mp4') || s.includes('mpeg-4') || s.includes('video')) return 'mp4'
  if (s.includes('gif')) return 'gif'
  if (s.includes('zip')) return 'zip'
  if (s.includes('indesign') || s.includes('indd')) return 'indd'
  if (s.includes('illustrator')) return 'ai'
  if (s.includes('photoshop') || s.includes('psd')) return 'psd'
  return s.split(/\s+/)[0] || null
}

function mapAssetType(fileFormat, filename) {
  const ext = fileFormatToExt(fileFormat, filename)
  if (['jpg', 'png', 'gif', 'webp', 'tiff', 'tif', 'bmp', 'svg'].includes(ext)) return 'IMAGE'
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return 'VIDEO'
  if (['pdf', 'doc', 'docx'].includes(ext)) return 'DOCUMENT'
  if (['indd', 'ai', 'psd', 'eps'].includes(ext)) return 'TEMPLATE'
  return 'OTHER'
}

function parseDatasize(s) {
  if (!s) return null
  const m = s.trim().match(/^([\d.]+)\s*(KB|MB|GB|B)$/i)
  if (!m) return null
  const n = parseFloat(m[1])
  const unit = m[2].toUpperCase()
  if (unit === 'B') return Math.round(n)
  if (unit === 'KB') return Math.round(n * 1024)
  if (unit === 'MB') return Math.round(n * 1024 * 1024)
  if (unit === 'GB') return Math.round(n * 1024 * 1024 * 1024)
  return null
}

function previewUrl(row) {
  // assetS3PreviewPath is a JSON-encoded array of {pageNo, s3Path}.
  try {
    const arr = JSON.parse(row.assetS3PreviewPath || '[]')
    return arr[0]?.s3Path || null
  }
  catch {
    return null
  }
}

// ═══════════════ API ═══════════════

async function apiGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString()
  const url = `${API_BASE}${path}${qs ? '?' + qs : ''}`
  const res = await fetch(url, {
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
    console.error(`\nERROR: FIL returned ${res.status} — token expired.`)
    console.error('  Refresh: log into fordimagelibrary.com.au, copy new Bearer token,')
    console.error('  export FORD_FIL_TOKEN="<jwt>", rerun.')
    process.exit(1)
  }
  if (!res.ok) throw new Error(`FIL HTTP ${res.status} on ${path}: ${await res.text()}`)
  return res.json()
}

async function searchPage(page, search = '') {
  const params = {
    page: String(page),
    fetchSize: String(PAGE_SIZE),
    order: 'F_AssetModified',
    dir: 'down',
    filter: '',
    search,
    catalogue: CATALOGUE,
    fromDate: '',
    toDate: '',
    categoryIDs: ROOT_CATEGORY_IDS.join(','),
    findDuplicate: 'false',
    searchCurrent: 'true',
    token: TOKEN,
    uid: '1797',
  }
  const json = await apiGet('/assets/category/search/allPublications', params)
  return json.instance
}

// ═══════════════ TRANSFORM ═══════════════

function rowToPortalAsset(row, portalId) {
  const preview = previewUrl(row)
  const cdnUrl = preview || row.assetThumbnailPath
  if (!cdnUrl) return null

  const { parsed_model, parsed_trim, parsed_angle, parsed_color } = parseAssetName(
    row.assetName,
    row.categoryPath,
  )

  const categories = {}
  if (row.categoryPath) {
    // "FIL | Retail Marketing | Ranger Hybrid Driveaway Deals 2026 |Website Banners"
    const parts = row.categoryPath.split('|').map(s => s.trim()).filter(Boolean)
    parts.forEach((p, i) => {
      categories[`lvl${i}`] = p
    })
  }

  const tags = []
  if (Array.isArray(row.categories)) {
    for (const c of row.categories) {
      if (c?.name) tags.push(c.name)
    }
  }

  const width = row.width ? parseInt(row.width, 10) : null
  const height = row.height ? parseInt(row.height, 10) : null

  return {
    oem_id: OEM_ID,
    portal_id: portalId,
    external_id: String(row.assetID),
    external_source: 'ford_image_library',
    name: row.assetName || row.recordName || `asset-${row.assetID}`,
    description: row.recordName || null,
    asset_type: mapAssetType(row.fileFormat, row.fileName || row.assetName),
    tags: JSON.stringify(tags),
    categories: JSON.stringify(categories),
    cdn_provider: 's3',
    cdn_id: String(row.assetID),
    cdn_url: cdnUrl,
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
    original_format: fileFormatToExt(row.fileFormat, row.fileName || row.assetName),
    file_size_bytes: parseDatasize(row.datasize),
    export_sizes: JSON.stringify([]),
    parsed_model,
    parsed_trim,
    parsed_angle,
    parsed_color,
    // Free fields from the search response — no detail-endpoint round trip needed.
    record_name: row.recordName || null,
    interface_id: row.interfaceID ? String(row.interfaceID) : null,
    category_id: row.cid ? String(row.cid) : null,
    category_path: row.categoryPath || null,
    source_modified_at: parseFilDate(row.modDate),
    source_created_at: parseFilDate(row.crDate),
    modified_by: row.modBy || null,
    is_active: true,
    last_synced_at: new Date().toISOString(),
  }
}

// FIL timestamps: "DD-MM-YY HH:MM AM/PM" or "DD/MM/YYYY HH:MM AM/PM"
function parseFilDate(s) {
  if (!s) return null
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return null
  let [, dd, mm, yy, hh, mi, ap] = m
  const year = yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10)
  let hour = parseInt(hh, 10)
  if (ap?.toUpperCase() === 'PM' && hour < 12) hour += 12
  if (ap?.toUpperCase() === 'AM' && hour === 12) hour = 0
  // Interpret as AEST (+10), which is what FIL shows for AU content.
  const iso = `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${mi}:00+10:00`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// ═══════════════ MAIN ═══════════════

async function seed() {
  console.log('Ford Image Library Asset Importer')
  console.log('═'.repeat(50))
  if (SEARCH) console.log(`Filter: search="${SEARCH}"`)
  if (DRY_RUN) console.log('DRY RUN — no DB writes')

  // Look up Ford portal row (optional FK on portal_assets).
  const { data: portals } = await supabase
    .from('oem_portals')
    .select('id, portal_name, portal_url')
    .eq('oem_id', OEM_ID)

  const fordPortal = (portals || []).find(
    p =>
      /fordimagelibrary/i.test(p.portal_url || '')
      || /image.*library|dealer.*image/i.test(p.portal_name || ''),
  )
  const portalId = fordPortal?.id || null
  console.log(
    `Portal row: ${portalId ? `${portalId} (${fordPortal.portal_name})` : '(none — inserting without FK)'}`,
  )

  // Paginate.
  console.log(`\nFetching from FIL (categories: ${ROOT_CATEGORY_IDS.join(',')})...`)
  const allRows = []
  const seen = new Set()
  let page = 1
  let totalSize = 0

  while (true) {
    const inst = await searchPage(page, SEARCH)
    totalSize = inst.totalSize ?? 0
    const rows = inst.rows ?? []
    if (rows.length === 0) break
    for (const r of rows) {
      const key = String(r.assetID)
      if (seen.has(key)) continue
      seen.add(key)
      allRows.push(r)
    }
    process.stdout.write(`\r  Page ${page}: fetched ${allRows.length}/${totalSize}`)
    if (allRows.length >= totalSize) break
    page++
  }
  console.log()

  if (allRows.length === 0) {
    console.log('No assets returned.')
    return
  }

  // Transform.
  const mapped = allRows.map(r => rowToPortalAsset(r, portalId)).filter(Boolean)
  console.log(`\nMapped ${mapped.length} / ${allRows.length} assets (dropped ${allRows.length - mapped.length} without CDN URL)`)

  if (DRY_RUN) {
    console.log('\nSample (first 3):')
    console.log(JSON.stringify(mapped.slice(0, 3), null, 2))
    return
  }

  // Upsert in batches.
  const BATCH = 200
  let upserted = 0
  for (let i = 0; i < mapped.length; i += BATCH) {
    const batch = mapped.slice(i, i + BATCH)
    const { data, error } = await supabase
      .from('portal_assets')
      .upsert(batch, {
        onConflict: 'oem_id,external_source,external_id',
        ignoreDuplicates: false,
      })
      .select('id')
    if (error) {
      console.error(`\nBatch ${i / BATCH} failed: ${error.message}`)
      continue
    }
    upserted += data?.length ?? 0
    process.stdout.write(`\r  Upserted ${upserted}/${mapped.length}`)
  }
  console.log()

  // Summary.
  console.log('\n═══════════════ SUMMARY ═══════════════')
  console.log(`Total upserted: ${upserted}`)

  const byModel = {}
  const byType = {}
  for (const r of mapped) {
    const m = r.parsed_model || '(unparsed)'
    byModel[m] = (byModel[m] || 0) + 1
    byType[r.asset_type] = (byType[r.asset_type] || 0) + 1
  }
  console.log('\nBy parsed model:')
  Object.entries(byModel)
    .sort((a, b) => b[1] - a[1])
    .forEach(([m, c]) => console.log(`  ${m}: ${c}`))
  console.log('\nBy asset type:')
  Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, c]) => console.log(`  ${t}: ${c}`))
}

seed().catch(err => {
  console.error('\nFatal:', err)
  process.exit(1)
})
