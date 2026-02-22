/**
 * Seed brochure URLs for vehicle models across all OEMs.
 *
 * Multi-OEM brochure URL scraper with per-OEM extractors.
 * Updates vehicle_models.brochure_url for each model where a PDF brochure is found.
 *
 * Run: cd dashboard/scripts && node seed-brochures.mjs
 */
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function fetchPage(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...headers },
    redirect: 'follow',
  })
  if (!res.ok) return null
  return res.text()
}

async function headCheck(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, redirect: 'follow' })
    return res.ok && (res.headers.get('content-type')?.includes('pdf') || res.url.endsWith('.pdf'))
  } catch {
    return false
  }
}

// ── Isuzu: B-CDN JSON API ──
async function extractIsuzu(models) {
  const results = {}
  try {
    const res = await fetch('https://isuzuute.b-cdn.net/data/models.json', { headers: { 'User-Agent': UA } })
    const data = await res.json()
    for (const item of data) {
      const brochures = item.brochure_pdfs || item.brochurePdfs || item.brochure
      if (!brochures) continue
      const url = Array.isArray(brochures) ? brochures[0]?.url || brochures[0] : (typeof brochures === 'string' ? brochures : brochures.url)
      if (!url) continue
      // Match to our model by slug/name
      for (const m of models) {
        const slug = m.slug.toLowerCase()
        const itemName = (item.name || item.slug || '').toLowerCase()
        if (itemName.includes(slug) || slug.includes(itemName.replace(/-/g, ''))) {
          results[m.id] = url.startsWith('http') ? url : `https://isuzuute.b-cdn.net${url}`
        }
      }
    }
  } catch (e) {
    console.error('  Isuzu error:', e.message)
  }
  return results
}

// ── Mazda: Central brochure page ──
async function extractMazda(models) {
  const results = {}
  try {
    const html = await fetchPage('https://www.mazda.com.au/brochures/')
    if (!html) return results
    const $ = cheerio.load(html)
    $('a[href*=".pdf"]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return
      const url = href.startsWith('http') ? href : `https://www.mazda.com.au${href}`
      const text = $(el).text().toLowerCase().trim()
      const parent = $(el).closest('[class*="card"], [class*="item"], li, div').text().toLowerCase()
      for (const m of models) {
        const name = m.name.toLowerCase()
        const slug = m.slug.toLowerCase()
        if (text.includes(name) || parent.includes(name) || url.toLowerCase().includes(slug)) {
          results[m.id] = url
        }
      }
    })
  } catch (e) {
    console.error('  Mazda error:', e.message)
  }
  return results
}

// ── Nissan: Download brochure page ──
async function extractNissan(models) {
  const results = {}
  try {
    const html = await fetchPage('https://www.nissan.com.au/vehicles/download-brochure.html')
    if (!html) return results
    const $ = cheerio.load(html)
    $('a[href*=".pdf"], a[href*="brochure"]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return
      const url = href.startsWith('http') ? href : `https://www.nissan.com.au${href}`
      const text = $(el).text().toLowerCase().trim()
      const parent = $(el).closest('[class*="card"], [class*="item"], [class*="vehicle"], li, div').text().toLowerCase()
      for (const m of models) {
        const name = m.name.toLowerCase()
        const slug = m.slug.toLowerCase().replace(/-/g, '')
        if (text.includes(name) || parent.includes(name) || url.toLowerCase().includes(slug)) {
          results[m.id] = url
        }
      }
    })
  } catch (e) {
    console.error('  Nissan error:', e.message)
  }
  return results
}

// ── Ford: AEM DAM brochure page at /vehicles/download-brochure.html ──
async function extractFord(models) {
  const results = {}
  try {
    // Correct URL: /vehicles/download-brochure.html (not /showroom/brochures/)
    const html = await fetchPage('https://www.ford.com.au/vehicles/download-brochure.html')
    if (!html) return results
    const $ = cheerio.load(html)
    $('a[href*=".pdf"]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return
      const url = href.startsWith('http') ? href : `https://www.ford.com.au${href}`
      // Skip accessories brochures, prefer vehicle/spec brochures
      if (url.includes('accessories-brochure') || url.includes('accessory')) return
      const text = $(el).text().toLowerCase().trim()
      const parent = $(el).closest('[class*="card"], [class*="item"], [class*="vehicle"], section, div').text().toLowerCase()
      for (const m of models) {
        const name = m.name.toLowerCase()
        const slug = m.slug.toLowerCase()
        // Match by name in text/parent or slug in URL path
        if (text.includes(name) || parent.includes(name) || url.toLowerCase().includes(`/nameplate/${slug}/`) || url.toLowerCase().includes(`/${slug}/`)) {
          // Prefer brochure over spec sheet if both exist
          if (!results[m.id] || url.includes('brochure')) {
            results[m.id] = url
          }
        }
      }
    })
  } catch (e) {
    console.error('  Ford error:', e.message)
  }
  return results
}

// ── VW: Digital brochure page ──
async function extractVW(models) {
  const results = {}
  try {
    const html = await fetchPage('https://www.volkswagen.com.au/en/digital-brochure.html')
    if (!html) return results
    const $ = cheerio.load(html)
    $('a[href*=".pdf"], a[href*="brochure"]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return
      const url = href.startsWith('http') ? href : `https://www.volkswagen.com.au${href}`
      const text = $(el).text().toLowerCase().trim()
      const parent = $(el).closest('[class*="card"], [class*="item"], [class*="model"], div').text().toLowerCase()
      for (const m of models) {
        const name = m.name.toLowerCase()
        const slug = m.slug.toLowerCase()
        if (text.includes(name) || parent.includes(name) || url.toLowerCase().includes(slug)) {
          results[m.id] = url
        }
      }
    })
  } catch (e) {
    console.error('  VW error:', e.message)
  }
  return results
}

// ── GWM: Download brochure page (single page has all brands) ──
async function extractGWM(models) {
  const results = {}
  try {
    const html = await fetchPage('https://www.gwmanz.com/au/download-brochure/')
    if (!html) return results
    const $ = cheerio.load(html)
    // All PDFs are Storyblok asset URLs like assets.gwmanz.com/f/256395/x/.../jolion_brochure_au.pdf
    const pdfUrls = []
    $('a[href*=".pdf"]').each((_, el) => {
      const href = $(el).attr('href')
      if (href) pdfUrls.push(href)
    })
    // Match PDFs to models by URL filename
    // Sort models by name length descending for most-specific match first
    const sortedModels = [...models].sort((a, b) => b.name.length - a.name.length)
    for (const m of sortedModels) {
      const name = m.name.toLowerCase()
      const slug = m.slug.toLowerCase()
      for (const pdfUrl of pdfUrls) {
        const lower = pdfUrl.toLowerCase()
        const filename = lower.split('/').pop() || ''
        // Try slug match in filename (e.g. "tank-300" in "gwm-tank-300-brochure-au.pdf")
        if (filename.includes(slug)) {
          if (!results[m.id]) results[m.id] = pdfUrl
          break
        }
        // Try model name parts (e.g. "jolion" in "jolion_brochure_au.pdf")
        // Only use full name or multi-word, avoid single common words like "h6"
        const nameKey = name.replace(/\s+/g, '-')
        if (nameKey.length > 3 && filename.includes(nameKey)) {
          if (!results[m.id]) results[m.id] = pdfUrl
          break
        }
        // Single-word match for unique names (jolion, cannon, ora)
        const singleWord = name.replace(/haval\s*/i, '').replace(/gwm\s*/i, '').trim()
        if (singleWord.length > 3 && filename.includes(singleWord.replace(/\s+/g, '-'))) {
          if (!results[m.id]) results[m.id] = pdfUrl
          break
        }
      }
    }
  } catch (e) {
    console.error('  GWM error:', e.message)
  }
  return results
}

// ── Subaru: Predictable URL pattern at docs.subaru.com.au ──
async function extractSubaru(models) {
  const results = {}
  for (const m of models) {
    const capitalized = m.name.charAt(0).toUpperCase() + m.name.slice(1)
    const upper = m.name.toUpperCase()
    const nameVariants = [
      m.name.replace(/\s+/g, '-'),
      capitalized,
      m.slug,
      upper,
    ]
    for (const name of nameVariants) {
      const urls = [
        `https://docs.subaru.com.au/Subaru-${name}-Brochure.pdf`,
        `https://docs.subaru.com.au/${name}-Brochure.pdf`,
        `https://docs.subaru.com.au/${name}-brochure.pdf`,
        `https://docs.subaru.com.au/MY25-${name}-Brochure.pdf`,
        `https://docs.subaru.com.au/MY26-${name}-Brochure.pdf`,
        `https://docs.subaru.com.au/Subaru_${name}_brochure.pdf`,
        `https://docs.subaru.com.au/Subaru-${name}-MY25.pdf`,
        `https://docs.subaru.com.au/Subaru-${name}-MY26.pdf`,
      ]
      for (const url of urls) {
        if (await headCheck(url)) {
          results[m.id] = url
          break
        }
      }
      if (results[m.id]) break
    }
  }
  return results
}

// ── Hyundai: Scrape AEM DAM PDF links from model pages ──
async function extractHyundai(models) {
  const results = {}
  // Model page paths — slug to Hyundai URL path
  const MODEL_PATHS = {
    'venue':            '/au/en/cars/suvs/venue',
    'kona':             '/au/en/cars/suvs/kona',
    'kona-hybrid':      '/au/en/cars/suvs/kona/konahybrid',
    'kona-electric':    '/au/en/cars/eco/kona-electric',
    'tucson':           '/au/en/cars/suvs/tucson',
    'santa-fe':         '/au/en/cars/suvs/santa-fe',
    'santa-fe-hybrid':  '/au/en/cars/suvs/santa-fe-hybrid',
    'palisade':         '/au/en/cars/suvs/palisade',
    'i20-n':            '/au/en/cars/sports-cars/i20-n',
    'i30':              '/au/en/cars/small-cars/i30',
    'i30-sedan':        '/au/en/cars/small-cars/i30/sedan',
    'i30-n':            '/au/en/cars/sports-cars/i30-n',
    'ioniq-5':          '/au/en/cars/eco/ioniq5',
    'ioniq-5-n':        '/au/en/cars/eco/ioniq5n',
    'ioniq-6':          '/au/en/cars/eco/ioniq6',
    'ioniq-9':          '/au/en/cars/eco/ioniq9',
    'staria':           '/au/en/cars/people-movers-and-commercial/staria',
    'inster':           '/au/en/cars/eco/inster',
  }
  for (const m of models) {
    const path = MODEL_PATHS[m.slug]
    if (!path) continue
    try {
      const html = await fetchPage(`https://www.hyundai.com${path}`)
      if (!html) continue
      // Extract AEM DAM PDF paths
      const damPdfs = html.match(/content\/dam\/hyundai\/au\/en[^"'\s)}\]>]*\.pdf[^"'\s)}\]>]*/gi)
      if (!damPdfs) continue
      const unique = [...new Set(damPdfs)]
      // Filter: prefer brochure, then spec sheet, skip bluelink/terms
      const relevant = unique.filter(p => {
        const lower = p.toLowerCase()
        return (lower.includes('brochure') || lower.includes('spec'))
               && !lower.includes('bluelink') && !lower.includes('terms')
      })
      const fallback = relevant.length === 0
        ? unique.filter(p => !p.toLowerCase().includes('bluelink') && !p.toLowerCase().includes('terms'))
        : []
      const best = relevant.length > 0 ? relevant : fallback
      if (best.length > 0) {
        const brochure = best.find(p => p.toLowerCase().includes('brochure'))
        const chosen = brochure || best[0]
        results[m.id] = 'https://www.hyundai.com/' + chosen.replace(/["'\\&#;34]+$/g, '').replace(/&#\d+;/g, '').replace(/\.pdf\.pdf$/, '.pdf')
      }
    } catch (e) {
      console.error(`  Hyundai ${m.slug} error:`, e.message)
    }
  }
  return results
}

// ── Toyota: Sitecore media library with known slug patterns ──
async function extractToyota(models) {
  const results = {}
  // Toyota PDFs are Cloudflare-protected (HEAD returns 403) but accessible in browser.
  // Known brochure URLs discovered from dealer sites and search engine cache.
  // We skip HEAD checks and trust the known URLs.
  const KNOWN_BROCHURES = {
    'hilux': '/-/media/toyota/main-site/vehicle-hubs/hilux/files/20250501_hilux_brochure_gto009126.pdf',
    'rav4': '/-/media/toyota/main-site/vehicle-hubs/rav4/files/20241022_rav4_online-brochure-v4.pdf',
    'gr-corolla': '/-/media/toyota/main-site/vehicle-hubs/gr-corolla/files/20250124_gto008687_gr-corolla_brochure.pdf',
    'corolla-hatch': '/-/media/toyota/main-site/vehicle-hubs/corolla/files/20240607_corolla_hatch_sedan_online_brochure_v3.pdf',
    'corolla-sedan': '/-/media/toyota/main-site/vehicle-hubs/corolla/files/20240607_corolla_hatch_sedan_online_brochure_v3.pdf',
    'corolla-cross': '/-/media/toyota/main-site/vehicle-hubs/corolla-cross/files/20250801_corolla_cross_spec_table_gtp009170.pdf',
    'gr-yaris': '/-/media/toyota/main-site/vehicle-hubs/gr-yaris/files/20250408_gr-yaris_brochure_gto0089001289.pdf',
    'gr86': '/-/media/toyota/main-site/vehicle-hubs/gr86/files/20241015_gr86_online-brochure-v4.pdf',
    'yaris-cross': '/-/media/toyota/main-site/vehicle-hubs/yaris-cross/files/20250509_yaris-cross_spec_table_gto008953.pdf',
    'prado': '/-/media/toyota/main-site/vehicle-hubs/prado/files/20231124_prado_online-brochure-v2.pdf',
    'fortuner': '/-/media/toyota/main-site/vehicle-hubs/fortuner/files/20231201_fortuner_online-brochure-v2.pdf',
    'kluger': '/-/media/toyota/main-site/vehicle-hubs/kluger/files/20231025_kluger_online_brochure-v2.pdf',
    'tundra': '/-/media/toyota/main-site/vehicle-hubs/tundra/files/20250506-tundra_brochure_gto008992.pdf',
    'hiace': '/-/media/toyota/main-site/vehicle-hubs/hiace/files/20250409_hiace_brochure_v7_gto009236.pdf',
    'bz4x': '/-/media/toyota/main-site/vehicle-hubs/bz4x/files/20260212_bz4x_spec_table_gtp009576.pdf',
  }

  for (const m of models) {
    const slug = m.slug.toLowerCase()
    const path = KNOWN_BROCHURES[slug]
    if (path) {
      results[m.id] = `https://www.toyota.com.au${path}`
    }
  }
  return results
}

// ── Mitsubishi: Download brochure page ──
async function extractMitsubishi(models) {
  const results = {}
  try {
    const html = await fetchPage('https://www.mitsubishi-motors.com.au/buying-tools/download-brochure.html')
    if (!html) return results
    const $ = cheerio.load(html)
    $('a[href*=".pdf"]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return
      const url = href.startsWith('http') ? href : `https://www.mitsubishi-motors.com.au${href}`
      const text = $(el).text().toLowerCase().trim()
      const parent = $(el).closest('[class*="card"], [class*="item"], div').text().toLowerCase()
      for (const m of models) {
        const name = m.name.toLowerCase()
        const slug = m.slug.toLowerCase()
        if (text.includes(name) || parent.includes(name) || url.toLowerCase().includes(slug)) {
          results[m.id] = url
        }
      }
    })
  } catch (e) {
    console.error('  Mitsubishi error:', e.message)
  }
  return results
}

// ── Kia: selectVehicleList API with brochure field ──
async function extractKia(models) {
  const results = {}
  try {
    const res = await fetch('https://www.kia.com/api/kia_australia/base/carInfo.selectVehicleList', {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) return results
    const data = await res.json()
    // Response: { dataInfo: { smallCars: [...], suvs: [...], ... } }
    const categories = data?.dataInfo || {}
    const allVehicles = Object.values(categories).flat()

    for (const v of allVehicles) {
      const brochure = v.brochure
      if (!brochure) continue
      const url = brochure.startsWith('http') ? brochure : `https://www.kia.com${brochure}`

      // Match to our models by displayName or code
      const vName = (v.displayName || v.code || '').toLowerCase()
      for (const m of models) {
        const name = m.name.toLowerCase()
        const slug = m.slug.toLowerCase()
        // Match: "ev5" in "EV5", "sportage" in "Sportage NQ5", "carnival" in "Carnival KA4"
        if (vName.includes(name) || name.includes(vName.split(' ')[0]) || url.toLowerCase().includes(slug)) {
          // HEAD check to skip dead links
          if (await headCheck(url)) {
            results[m.id] = url
          }
        }
      }
    }
  } catch (e) {
    console.error('  Kia error:', e.message)
  }
  return results
}

// ── Suzuki: Try direct URL patterns (form-gated) ──
async function extractSuzuki(models) {
  const results = {}
  for (const m of models) {
    const slugs = [m.slug, m.name.toLowerCase().replace(/\s+/g, '-')]
    for (const slug of slugs) {
      const urls = [
        `https://www.suzuki.com.au/content/dam/suzuki/au/brochures/${slug}-brochure.pdf`,
        `https://www.suzuki.com.au/assets/brochures/${slug}.pdf`,
      ]
      for (const url of urls) {
        if (await headCheck(url)) {
          results[m.id] = url
          break
        }
      }
      if (results[m.id]) break
    }
  }
  return results
}

// ── KGM: Payload CMS media library (specs & features PDFs) ──
async function extractKGM(models) {
  const results = {}
  try {
    const res = await fetch('https://payloadb.therefinerydesign.com/api/media?limit=50&where[mimeType][contains]=pdf', {
      headers: { Accept: 'application/json', Origin: 'https://kgm.com.au', Referer: 'https://kgm.com.au/' },
    })
    if (!res.ok) return results
    const data = await res.json()
    const pdfs = data.docs || []

    // Known mappings: filename keyword → model slug
    const KGM_PDF_MAP = {
      'korando': 'korando',
      'torres-evx': 'torres',      // Torres EVX maps to Torres
      'torres-hev': 'torres',
      'torres-my25': 'torres',
      'actyon-hev': 'actyon',
      'actyon': 'actyon',
      'rexton': 'rexton-my26',
      'musso-ev': 'musso-ev-my26',
      'musso-my26': 'musso-my26',
      'musso-my24': 'musso-my24',
    }

    for (const pdf of pdfs) {
      const filename = (pdf.filename || '').toLowerCase()
      // Try specific mappings first
      for (const [keyword, targetSlug] of Object.entries(KGM_PDF_MAP)) {
        if (filename.includes(keyword)) {
          const model = models.find(m => m.slug === targetSlug)
          if (model && !results[model.id]) {
            results[model.id] = `https://payloadb.therefinerydesign.com${pdf.url}`
          }
          break
        }
      }
    }

    // Fallback: fuzzy match remaining unmatched models
    for (const m of models) {
      if (results[m.id]) continue
      const name = m.name.toLowerCase().split(/\s+/)[0] // First word: "Musso", "Rexton"
      if (name.length < 4) continue
      const pdf = pdfs.find(p => p.filename?.toLowerCase().includes(name))
      if (pdf) {
        results[m.id] = `https://payloadb.therefinerydesign.com${pdf.url}`
      }
    }
  } catch (e) {
    console.error('  KGM error:', e.message)
  }
  return results
}

// ── Main ──
const OEM_EXTRACTORS = {
  'isuzu-au': extractIsuzu,
  'mazda-au': extractMazda,
  'nissan-au': extractNissan,
  'ford-au': extractFord,
  'volkswagen-au': extractVW,
  'gwm-au': extractGWM,
  'subaru-au': extractSubaru,
  'hyundai-au': extractHyundai,
  'toyota-au': extractToyota,
  'mitsubishi-au': extractMitsubishi,
  'kia-au': extractKia,
  'suzuki-au': extractSuzuki,
  'kgm-au': extractKGM,
  // LDV skipped — only 1 model, no brochure page
}

async function main() {
  console.log('=== Seed Vehicle Model Brochure URLs ===\n')

  // Fetch all models
  const { data: allModels, error: err } = await supabase
    .from('vehicle_models')
    .select('id, oem_id, slug, name')
    .order('oem_id, name')

  if (err) throw err
  console.log(`Loaded ${allModels.length} vehicle models\n`)

  // Group by OEM
  const byOem = {}
  for (const m of allModels) {
    if (!byOem[m.oem_id]) byOem[m.oem_id] = []
    byOem[m.oem_id].push(m)
  }

  const totalResults = {}
  let totalFound = 0
  let totalMissing = 0

  for (const [oemId, models] of Object.entries(byOem).sort()) {
    const extractor = OEM_EXTRACTORS[oemId]
    if (!extractor) {
      console.log(`${oemId}: skipped (no extractor)`)
      totalMissing += models.length
      continue
    }

    console.log(`${oemId}: extracting brochures for ${models.length} models...`)
    const results = await extractor(models)
    const found = Object.keys(results).length

    for (const [modelId, url] of Object.entries(results)) {
      const model = models.find(m => m.id === modelId)
      console.log(`  ✓ ${model?.name || modelId}: ${url}`)
    }

    const missing = models.filter(m => !results[m.id])
    for (const m of missing) {
      console.log(`  ✗ ${m.name}: not found`)
    }

    console.log(`  → ${found}/${models.length} found\n`)
    Object.assign(totalResults, results)
    totalFound += found
    totalMissing += missing.length
  }

  // Update database
  const updates = Object.entries(totalResults)
  if (updates.length > 0) {
    console.log(`\nUpdating ${updates.length} models with brochure URLs...`)
    let ok = 0, fail = 0
    for (const [modelId, url] of updates) {
      const { error: e } = await supabase
        .from('vehicle_models')
        .update({ brochure_url: url })
        .eq('id', modelId)
      if (e) {
        console.error(`  Failed ${modelId}: ${e.message}`)
        fail++
      } else {
        ok++
      }
    }
    console.log(`Updated: ${ok} ok, ${fail} failed`)
  }

  // Summary
  console.log('\n=== Summary ===')
  console.log(`Total models: ${allModels.length}`)
  console.log(`Brochures found: ${totalFound}`)
  console.log(`Missing: ${totalMissing}`)

  // Per-OEM breakdown
  const summary = {}
  for (const [oemId, models] of Object.entries(byOem).sort()) {
    const found = models.filter(m => totalResults[m.id]).length
    summary[oemId] = `${found}/${models.length}`
  }
  console.log('\nPer OEM:')
  for (const [oemId, ratio] of Object.entries(summary)) {
    console.log(`  ${oemId}: ${ratio}`)
  }
}

main().catch(console.error)
