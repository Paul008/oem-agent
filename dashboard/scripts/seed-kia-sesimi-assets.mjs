#!/usr/bin/env node
/**
 * Populate portal_assets with ALL Kia AU Sesimi marketing assets via Algolia.
 *
 * Auth: Algolia secured API key (24h expiry).
 *   - Set SESIMI_ALGOLIA_KEY env var, or
 *   - Falls back to last-intercepted key below (will expire).
 *
 * Run: node dashboard/scripts/seed-kia-sesimi-assets.mjs
 *
 * To refresh the key:
 *   1. Log into https://kia-au.sesimi.com with Cognito credentials
 *   2. Open DevTools → Network → filter "algolia"
 *   3. Copy the x-algolia-api-key header value from any request
 *   4. Export SESIMI_ALGOLIA_KEY="<key>" or paste below
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'kia-au'
const ALGOLIA_APP_ID = 'TNQJZPDMIK'
const ALGOLIA_INDEX = 'prod_NEBULA'
const ALGOLIA_HOST = `https://${ALGOLIA_APP_ID}-dsn.algolia.net`
const CLOUDINARY_BASE = 'https://res.cloudinary.com/mabx-eu-prod/image/upload/v1'

// Fallback key — will expire after ~24h. See header comment to refresh.
const FALLBACK_KEY = ''

const ALGOLIA_KEY = process.env.SESIMI_ALGOLIA_KEY || FALLBACK_KEY

if (!ALGOLIA_KEY) {
  console.error('ERROR: No Algolia key found.')
  console.error('Set SESIMI_ALGOLIA_KEY env var or paste a fresh key in the script.')
  console.error('To get a key: log into kia-au.sesimi.com → DevTools → Network → copy x-algolia-api-key')
  process.exit(1)
}

// ═══════════════ ASSET NAME PARSER ═══════════════

// Longest-first to avoid partial matches (e.g. "sportage" before "sport")
const KNOWN_MODELS = [
  'sportage-facelift', 'sportage', 'sorento', 'carnival', 'cerato',
  'picanto', 'stonic', 'seltos', 'tasman', 'niro', 'ev9', 'ev6', 'ev5', 'ev3', 'k4',
]

const KNOWN_ANGLES = ['profile', 'rear', 'front', 'side']

const KNOWN_TRIMS = [
  'gt-line', 'gt line', 'x-pro', 'x pro', 'sport-plus', 'sport+',
  'sport', 'gt', 's', 'sx', 'sx+', 'si', 'si-limited',
]

function parseAssetName(name) {
  const lower = name.toLowerCase().replace(/[-_]+/g, ' ')
  // Strip "kia" prefix
  const cleaned = lower.replace(/^kia\s+/, '')

  let parsed_model = null
  let parsed_trim = null
  let parsed_angle = null
  let parsed_color = null

  // Model (longest-first)
  for (const model of KNOWN_MODELS) {
    const modelPattern = model.replace(/-/g, '[\\s-]')
    const re = new RegExp(`\\b${modelPattern}\\b`)
    if (re.test(cleaned)) {
      parsed_model = model
      break
    }
  }

  // Angle
  for (const angle of KNOWN_ANGLES) {
    if (cleaned.includes(angle)) {
      parsed_angle = angle
      break
    }
  }

  // Trim (longest-first)
  const sortedTrims = [...KNOWN_TRIMS].sort((a, b) => b.length - a.length)
  for (const trim of sortedTrims) {
    const trimPattern = trim.replace(/[+-]/g, '[\\s\\-+]?')
    const re = new RegExp(`\\b${trimPattern}\\b`)
    if (re.test(cleaned)) {
      parsed_trim = trim.replace(/\s+/g, '-')
      break
    }
  }

  // Color: everything after the angle (or after model+trim if no angle)
  if (parsed_angle) {
    const angleIdx = cleaned.indexOf(parsed_angle)
    const afterAngle = cleaned.slice(angleIdx + parsed_angle.length).trim()
    if (afterAngle) {
      parsed_color = afterAngle.replace(/\s+/g, '-').replace(/^-|-$/g, '')
    }
  } else if (parsed_model) {
    // Try extracting color as the last segment after known parts
    let remainder = cleaned
    if (parsed_model) remainder = remainder.replace(new RegExp(parsed_model.replace(/-/g, '[\\s-]')), '').trim()
    if (parsed_trim) remainder = remainder.replace(new RegExp(parsed_trim.replace(/-/g, '[\\s-]?')), '').trim()
    remainder = remainder.replace(/\s+/g, '-').replace(/^-|-$/g, '')
    if (remainder && remainder.length > 1) parsed_color = remainder
  }

  return { parsed_model, parsed_trim, parsed_angle, parsed_color }
}

// ═══════════════ ALGOLIA QUERY ═══════════════

async function queryAlgolia(page = 0, hitsPerPage = 1000, filters = null) {
  const url = `${ALGOLIA_HOST}/1/indexes/*/queries`
  const request = {
    indexName: ALGOLIA_INDEX,
    query: '',
    hitsPerPage,
    page,
  }
  if (filters) request.filters = filters
  const body = { requests: [request] }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-algolia-application-id': ALGOLIA_APP_ID,
      'x-algolia-api-key': ALGOLIA_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (res.status === 403) {
    console.error('ERROR: Algolia returned 403 — API key has expired.')
    console.error('To refresh:')
    console.error('  1. Log into https://kia-au.sesimi.com')
    console.error('  2. DevTools → Network → filter "algolia"')
    console.error('  3. Copy x-algolia-api-key header')
    console.error('  4. export SESIMI_ALGOLIA_KEY="<new-key>"')
    process.exit(1)
  }

  if (!res.ok) {
    throw new Error(`Algolia HTTP ${res.status}: ${await res.text()}`)
  }

  const json = await res.json()
  return json.results[0]
}

// ═══════════════ TRANSFORM HIT → PORTAL ASSET ═══════════════

function mapAssetType(type) {
  if (!type) return 'IMAGE'
  const t = type.toLowerCase()
  if (t === 'image' || t === 'photo') return 'IMAGE'
  if (t === 'video') return 'VIDEO'
  if (t === 'template') return 'TEMPLATE'
  if (t === 'document' || t === 'pdf') return 'DOCUMENT'
  return 'OTHER'
}

function hitToPortalAsset(hit, portalId) {
  const version = hit.versions?.[0]
  const cloudinaryId = version?.cloudinaryId
  const cdnUrl = cloudinaryId ? `${CLOUDINARY_BASE}/${cloudinaryId}` : null

  if (!cdnUrl) return null // Skip assets without CDN URL

  const { parsed_model, parsed_trim, parsed_angle, parsed_color } = parseAssetName(hit.name || '')

  // Extract tags as flat array
  const tags = Array.isArray(hit.tags) ? hit.tags : []

  // Extract categories object
  const categories = {}
  if (hit.categories) {
    for (const [key, val] of Object.entries(hit.categories)) {
      if (key.startsWith('lvl')) categories[key] = val
    }
  }

  return {
    oem_id: OEM_ID,
    portal_id: portalId,
    external_id: hit.objectID,
    external_source: 'sesimi_algolia',
    name: hit.name || hit.objectID,
    description: hit.description || null,
    asset_type: mapAssetType(hit.type),
    tags: JSON.stringify(tags),
    categories: JSON.stringify(categories),
    cdn_provider: 'cloudinary',
    cdn_id: cloudinaryId,
    cdn_url: cdnUrl,
    width: version?.width || null,
    height: version?.height || null,
    original_format: version?.originalFormat || null,
    file_size_bytes: version?.bytes || null,
    export_sizes: JSON.stringify(version?.exportSizes || []),
    parsed_model,
    parsed_trim,
    parsed_angle,
    parsed_color,
    is_active: true,
    last_synced_at: new Date().toISOString(),
  }
}

// ═══════════════ MAIN ═══════════════

async function seed() {
  console.log('Sesimi Asset Importer — Kia AU')
  console.log('═'.repeat(50))

  // 1. Look up portal_id for kia-au Sesimi portal
  const { data: portals } = await supabase
    .from('oem_portals')
    .select('id')
    .eq('oem_id', OEM_ID)
    .ilike('portal_name', '%sesimi%')
    .limit(1)

  const portalId = portals?.[0]?.id || null
  console.log(`Portal ID: ${portalId || '(none found — will insert without portal FK)'}`)

  // 2. Paginate all Algolia assets
  // Algolia scoped keys limit pagination to ~2000 results.
  // Partition by category to get all 2,642 assets.
  console.log('\nQuerying Algolia...')
  const allHits = []
  const seen = new Set()

  // First pass: unfiltered (gets first 2000)
  const partitions = [
    { label: 'all', filters: null },
    // Second pass: filter by categories that may have been missed
    { label: 'sorento', filters: 'tags:SORENTO OR tags:sorento' },
    { label: 'cerato', filters: 'tags:Cerato OR tags:cerato' },
    { label: 'picanto', filters: 'tags:Picanto OR tags:picanto' },
    { label: 'stonic', filters: 'tags:Stonic OR tags:stonic' },
    { label: 'niro', filters: 'tags:Niro OR tags:niro' },
    { label: 'carnival', filters: 'tags:Carnival OR tags:carnival' },
    { label: 'ev6', filters: 'tags:EV6 OR tags:ev6' },
    { label: 'ev9', filters: 'tags:EV9 OR tags:ev9' },
    { label: 'seltos', filters: 'tags:Seltos OR tags:seltos' },
    { label: 'tasman', filters: 'tags:tasman OR tags:Tasman' },
    { label: 'sportage', filters: 'tags:SPORTAGE OR tags:sportage' },
    { label: 'k4', filters: 'tags:k4 OR tags:K4' },
    { label: 'ev3', filters: 'tags:ev3 OR tags:EV3' },
    { label: 'ev5', filters: 'tags:ev5 OR tags:EV5' },
    { label: 'my25', filters: 'tags:my25' },
    { label: '3d-render', filters: 'tags:"3d render"' },
  ]

  for (const partition of partitions) {
    let page = 0
    let partitionCount = 0
    while (true) {
      const result = await queryAlgolia(page, 1000, partition.filters)
      for (const hit of result.hits) {
        if (!seen.has(hit.objectID)) {
          seen.add(hit.objectID)
          allHits.push(hit)
          partitionCount++
        }
      }
      console.log(`  [${partition.label}] Page ${page}: ${result.hits.length} hits, ${partitionCount} new (total: ${allHits.length}/${result.nbHits})`)

      if (page >= result.nbPages - 1 || result.hits.length === 0) break
      page++
    }
  }

  console.log(`\nTotal unique hits: ${allHits.length}`)

  // 3. Transform hits to portal_assets rows
  const rows = allHits
    .map(hit => hitToPortalAsset(hit, portalId))
    .filter(Boolean)

  console.log(`Mapped ${rows.length} assets (skipped ${allHits.length - rows.length} without CDN URL)`)

  // 4. Upsert in batches of 200
  const BATCH_SIZE = 200
  let totalInserted = 0
  let totalUpdated = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from('portal_assets')
      .upsert(batch, { onConflict: 'oem_id,external_source,external_id', ignoreDuplicates: false })
      .select('id')

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE)} error:`, error.message)
      continue
    }

    totalInserted += data?.length ?? 0
    process.stdout.write(`\r  Upserted: ${totalInserted}/${rows.length}`)
  }

  console.log() // newline after progress

  // 5. Report
  console.log('\n═══════════════ SUMMARY ═══════════════')
  console.log(`Total upserted: ${totalInserted}`)

  // Per-model breakdown
  const byModel = {}
  const byType = {}
  for (const r of rows) {
    const model = r.parsed_model || '(unknown)'
    byModel[model] = (byModel[model] || 0) + 1
    byType[r.asset_type] = (byType[r.asset_type] || 0) + 1
  }

  console.log('\nBy model:')
  Object.entries(byModel).sort((a, b) => b[1] - a[1]).forEach(([m, c]) => {
    console.log(`  ${m}: ${c}`)
  })

  console.log('\nBy type:')
  Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => {
    console.log(`  ${t}: ${c}`)
  })

  // Render-specific stats
  const renders = rows.filter(r => r.parsed_angle)
  console.log(`\n3D renders with parsed angle: ${renders.length}`)
  const byAngle = {}
  for (const r of renders) {
    byAngle[r.parsed_angle] = (byAngle[r.parsed_angle] || 0) + 1
  }
  Object.entries(byAngle).sort((a, b) => b[1] - a[1]).forEach(([a, c]) => {
    console.log(`  ${a}: ${c}`)
  })
}

seed().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
