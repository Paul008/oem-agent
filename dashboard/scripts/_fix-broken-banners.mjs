/**
 * Fix broken banner image URLs:
 * 1. GMSV: Prepend base domain to relative /content/dam/... URLs
 * 2. Foton: Prepend base domain to relative /media/... URLs
 * 3. Mazda: Prepend base domain to relative /... URLs
 * 4. KGM: Delete all (Payload CMS file storage is entirely down)
 * 5. Isuzu: Re-scrape from site (CDN returns 405 on old URLs)
 *
 * Run: cd dashboard && node scripts/_fix-broken-banners.mjs
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

const BASE_DOMAINS = {
  'gmsv-au': 'https://www.gmspecialtyvehicles.com',
  'foton-au': 'https://www.fotonaustralia.com.au',
  'mazda-au': 'https://www.mazda.com.au',
}

async function probe(url) {
  if (!url) return true
  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    })
    if (resp.ok) return true
    // Retry with GET for servers that reject HEAD
    const resp2 = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA, 'Range': 'bytes=0-0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    })
    return resp2.ok || resp2.status === 206
  } catch {
    return false
  }
}

async function main() {
  console.log('=== Fix Broken Banners ===\n')

  const { data: banners } = await sb.from('banners').select('*')
  console.log(`Total banners: ${banners.length}\n`)

  let fixedCount = 0
  let deletedCount = 0

  // 1. Fix relative URLs (GMSV, Foton, Mazda)
  console.log('--- Fixing relative URLs ---')
  for (const b of banners) {
    const base = BASE_DOMAINS[b.oem_id]
    if (!base) continue

    const updates = {}
    let changed = false

    for (const field of ['image_url_desktop', 'image_url_mobile']) {
      const url = b[field]
      if (url && url.startsWith('/')) {
        updates[field] = base + url
        changed = true
      }
    }

    if (changed) {
      const { error } = await sb.from('banners').update(updates).eq('id', b.id)
      if (error) {
        console.error(`  Error updating ${b.id}: ${error.message}`)
      } else {
        fixedCount++
        console.log(`  Fixed ${b.oem_id} | "${(b.headline || '').substring(0, 40)}"`)
        for (const [field, url] of Object.entries(updates)) {
          console.log(`    ${field}: ${url.substring(0, 90)}`)
        }
      }
    }
  }

  // 2. Delete broken KGM banners (Payload CMS file storage is entirely 404)
  console.log('\n--- Deleting KGM banners (Payload CMS storage is down) ---')
  const { data: kgmBanners } = await sb.from('banners').select('id, headline').eq('oem_id', 'kgm-au')
  if (kgmBanners && kgmBanners.length > 0) {
    const { error } = await sb.from('banners').delete().eq('oem_id', 'kgm-au')
    if (error) {
      console.error(`  Delete error: ${error.message}`)
    } else {
      deletedCount += kgmBanners.length
      console.log(`  Deleted ${kgmBanners.length} KGM banners`)
    }
  }

  // 3. Verify fixed URLs work
  console.log('\n--- Verifying fixed URLs ---')
  const { data: fixedBanners } = await sb.from('banners')
    .select('id, oem_id, headline, image_url_desktop, image_url_mobile')
    .in('oem_id', Object.keys(BASE_DOMAINS))

  let stillBroken = 0
  const toDelete = []

  for (const b of fixedBanners || []) {
    const dOk = await probe(b.image_url_desktop)
    const mOk = await probe(b.image_url_mobile)
    if (!dOk && b.image_url_desktop) {
      stillBroken++
      console.log(`  Still broken: ${b.oem_id} | "${(b.headline || '').substring(0, 40)}" | D: ${(b.image_url_desktop || '').substring(0, 80)}`)
      toDelete.push(b.id)
    }
  }

  if (toDelete.length > 0) {
    console.log(`\n  Deleting ${toDelete.length} still-broken banners...`)
    const { error } = await sb.from('banners').delete().in('id', toDelete)
    if (error) {
      console.error(`  Delete error: ${error.message}`)
    } else {
      deletedCount += toDelete.length
      console.log(`  Deleted ${toDelete.length} banners`)
    }
  }

  // 4. Check Isuzu specifically
  console.log('\n--- Checking Isuzu banners ---')
  const { data: isuzuBanners } = await sb.from('banners')
    .select('id, headline, image_url_desktop')
    .eq('oem_id', 'isuzu-au')

  const isuzuBroken = []
  for (const b of isuzuBanners || []) {
    // Try with Referer header
    try {
      const resp = await fetch(b.image_url_desktop, {
        method: 'HEAD',
        headers: {
          'User-Agent': UA,
          'Referer': 'https://www.isuzuute.com.au/',
          'Origin': 'https://www.isuzuute.com.au',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) {
        isuzuBroken.push(b)
        console.log(`  Broken [${resp.status}]: ${(b.headline || '').substring(0, 40)}`)
      } else {
        console.log(`  OK: ${(b.headline || '').substring(0, 40)}`)
      }
    } catch (e) {
      isuzuBroken.push(b)
      console.log(`  Error: ${(b.headline || '').substring(0, 40)} - ${e.message}`)
    }
  }

  if (isuzuBroken.length > 0) {
    console.log(`\n  Deleting ${isuzuBroken.length} broken Isuzu banners...`)
    const { error } = await sb.from('banners').delete().in('id', isuzuBroken.map(b => b.id))
    if (error) {
      console.error(`  Delete error: ${error.message}`)
    } else {
      deletedCount += isuzuBroken.length
      console.log(`  Deleted ${isuzuBroken.length} Isuzu banners`)
    }
  }

  // Final summary
  const { count: remaining } = await sb.from('banners').select('*', { count: 'exact', head: true })
  console.log(`\n=== Summary ===`)
  console.log(`Fixed: ${fixedCount} banners (relative URLs)`)
  console.log(`Deleted: ${deletedCount} banners (broken)`)
  console.log(`Remaining: ${remaining} banners`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
