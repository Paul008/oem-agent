#!/usr/bin/env node
/**
 * Rewrite variant_colors image URLs to use the /media proxy
 *
 * Converts OEM CDN URLs to proxy URLs that go through our Cloudflare Worker
 * edge cache. Stores original OEM URLs in source_*_url columns.
 *
 * Usage:
 *   node dashboard/scripts/rewrite-colors-to-proxy.mjs              # Rewrite all
 *   node dashboard/scripts/rewrite-colors-to-proxy.mjs --oem kgm-au # One OEM
 *   node dashboard/scripts/rewrite-colors-to-proxy.mjs --dry-run    # Preview
 *   node dashboard/scripts/rewrite-colors-to-proxy.mjs --force      # Re-rewrite all
 */

import { createClient } from '@supabase/supabase-js'

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://nnihmdmsglkxpmilmjjc.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'

// Worker URL — the /media proxy endpoint
const WORKER_BASE = process.env.WORKER_BASE || 'https://oem-agent.adme-dev.workers.dev'
const PROXY_PREFIX = `${WORKER_BASE}/media`

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null
}
const flagOem = getArg('oem')
const flagDryRun = args.includes('--dry-run')
const flagForce = args.includes('--force')

// ── Supabase client ─────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Base URLs for resolving relative paths (same as Worker) ─────────────────

const OEM_URL_BASES = {
  'kgm-au': 'https://payloadb.therefinerydesign.com',
  'hyundai-au': 'https://www.hyundai.com',
  'mazda-au': 'https://www.mazda.com.au',
}

// OEMs whose CDNs block server-side requests (WAF/bot protection) — skip proxy
const SKIP_OEMS = new Set(['ford-au'])

// ── Helpers ─────────────────────────────────────────────────────────────────

function encodeUrl(url) {
  return Buffer.from(url).toString('base64url')
}

function isProxyUrl(url) {
  return url && url.startsWith(PROXY_PREFIX)
}

function resolveSourceUrl(url, oemId) {
  if (!url) return null
  if (url.startsWith('http')) return url
  const base = OEM_URL_BASES[oemId]
  return base ? base + url : null
}

function toProxyUrl(sourceUrl, oemId) {
  // sourceUrl can be absolute or relative — we encode whatever the DB has
  // The Worker will resolve relative paths using OEM_URL_BASES
  return `${PROXY_PREFIX}/${oemId}/${encodeUrl(sourceUrl)}`
}

// ── Load variant_colors ─────────────────────────────────────────────────────

async function loadColors(oemFilter) {
  const PAGE = 1000
  const rows = []
  let from = 0
  while (true) {
    let query = supabase
      .from('variant_colors')
      .select('id, hero_image_url, swatch_url, gallery_urls, source_hero_url, source_swatch_url, source_gallery_urls, products!inner(oem_id)')
      .order('id')
      .range(from, from + PAGE - 1)
    if (oemFilter) {
      query = query.eq('products.oem_id', oemFilter)
    }
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

// ── Main ────────────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(60)}`)
console.log(`Rewrite variant_colors URLs to media proxy`)
console.log(`OEM: ${flagOem || 'all'} | Force: ${flagForce} | Dry run: ${flagDryRun}`)
console.log(`Proxy base: ${PROXY_PREFIX}`)
console.log(`${'='.repeat(60)}\n`)

const allColors = await loadColors(flagOem)
console.log(`Loaded ${allColors.length} variant_colors rows`)

// Filter to rows needing rewrite (skip OEMs with bot-protected CDNs)
const needsRewrite = (flagForce
  ? allColors.filter(r => r.hero_image_url || r.swatch_url || r.gallery_urls?.length)
  : allColors.filter(r =>
    (r.hero_image_url && !isProxyUrl(r.hero_image_url))
    || (r.swatch_url && !isProxyUrl(r.swatch_url))
    || (r.gallery_urls?.some(u => !isProxyUrl(u)))
  )
).filter(r => !SKIP_OEMS.has(r.products.oem_id))

const alreadyProxied = allColors.length - needsRewrite.length
console.log(`Need rewrite: ${needsRewrite.length} rows (${alreadyProxied} already proxied)\n`)

if (needsRewrite.length === 0) {
  console.log('Nothing to rewrite. All URLs already point to proxy.')
  process.exit(0)
}

if (flagDryRun) {
  const byOem = {}
  for (const row of needsRewrite) {
    const oem = row.products.oem_id
    byOem[oem] = (byOem[oem] || 0) + 1
  }
  console.log('Would rewrite:')
  for (const [oem, count] of Object.entries(byOem).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${oem.padEnd(20)} ${count} colors`)
  }
  console.log(`\nTotal: ${needsRewrite.length} colors`)

  // Show a sample
  const sample = needsRewrite[0]
  const oemId = sample.products.oem_id
  if (sample.hero_image_url) {
    console.log(`\nSample (${oemId}):`)
    console.log(`  Before: ${sample.hero_image_url}`)
    console.log(`  After:  ${toProxyUrl(sample.hero_image_url, oemId)}`)
  }
  process.exit(0)
}

// Batch update in chunks of 50
const BATCH = 50
let rewritten = 0
let failed = 0
const startTime = Date.now()

for (let i = 0; i < needsRewrite.length; i += BATCH) {
  const batch = needsRewrite.slice(i, i + BATCH)

  for (const row of batch) {
    const oemId = row.products.oem_id
    const update = {}

    // Hero
    if (row.hero_image_url && (flagForce || !isProxyUrl(row.hero_image_url))) {
      update.source_hero_url = resolveSourceUrl(row.hero_image_url, oemId) || row.hero_image_url
      update.hero_image_url = toProxyUrl(row.hero_image_url, oemId)
    }

    // Swatch
    if (row.swatch_url && (flagForce || !isProxyUrl(row.swatch_url))) {
      update.source_swatch_url = resolveSourceUrl(row.swatch_url, oemId) || row.swatch_url
      update.swatch_url = toProxyUrl(row.swatch_url, oemId)
    }

    // Gallery
    if (row.gallery_urls?.length && (flagForce || row.gallery_urls.some(u => !isProxyUrl(u)))) {
      const sourceGallery = []
      const proxyGallery = []
      for (const url of row.gallery_urls) {
        if (!flagForce && isProxyUrl(url)) {
          proxyGallery.push(url)
          sourceGallery.push(url) // already proxied, source unknown
        } else {
          sourceGallery.push(resolveSourceUrl(url, oemId) || url)
          proxyGallery.push(toProxyUrl(url, oemId))
        }
      }
      update.source_gallery_urls = sourceGallery
      update.gallery_urls = proxyGallery
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('variant_colors')
        .update(update)
        .eq('id', row.id)
      if (error) {
        console.warn(`  WARN ${row.id}: ${error.message}`)
        failed++
      } else {
        rewritten++
      }
    }
  }

  if ((i + BATCH) % 200 === 0 || i + BATCH >= needsRewrite.length) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`  [${Math.min(i + BATCH, needsRewrite.length)}/${needsRewrite.length}] rewritten: ${rewritten} | failed: ${failed} | ${elapsed}s`)
  }
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
console.log(`\n${'='.repeat(60)}`)
console.log(`Done in ${totalTime}s`)
console.log(`Rewritten: ${rewritten} | Failed: ${failed}`)
console.log(`${'='.repeat(60)}\n`)

process.exit(failed > 0 ? 1 : 0)
