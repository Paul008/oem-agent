/**
 * Probe all banner image URLs with HEAD requests to find broken images.
 * Run: cd dashboard && node scripts/_probe-broken-banners.mjs
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

const { data: banners } = await sb.from('banners').select('*').order('oem_id, position')
console.log(`Total banners: ${banners.length}\n`)

async function probe(url) {
  if (!url) return { status: null, ok: true }
  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    })
    return { status: resp.status, ok: resp.ok }
  } catch (e) {
    // Some servers reject HEAD, try GET with range
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': UA, 'Range': 'bytes=0-0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      })
      return { status: resp.status, ok: resp.ok || resp.status === 206 }
    } catch (e2) {
      return { status: 0, ok: false, error: e2.message }
    }
  }
}

const broken = []
const byOem = {}

// Process in batches of 10 to avoid hammering
for (let i = 0; i < banners.length; i += 10) {
  const batch = banners.slice(i, i + 10)
  const results = await Promise.all(batch.map(async b => {
    const dResult = await probe(b.image_url_desktop)
    const mResult = await probe(b.image_url_mobile)
    return { banner: b, desktop: dResult, mobile: mResult }
  }))

  for (const { banner: b, desktop: d, mobile: m } of results) {
    if (!byOem[b.oem_id]) byOem[b.oem_id] = { total: 0, ok: 0, broken: 0 }
    byOem[b.oem_id].total++

    const dBroken = b.image_url_desktop && !d.ok
    const mBroken = b.image_url_mobile && !m.ok

    if (dBroken || mBroken) {
      byOem[b.oem_id].broken++
      broken.push({
        id: b.id,
        oem_id: b.oem_id,
        headline: b.headline,
        page_url: b.page_url,
        desktop_url: b.image_url_desktop,
        desktop_status: d.status,
        mobile_url: b.image_url_mobile,
        mobile_status: m.status,
      })
    } else {
      byOem[b.oem_id].ok++
    }
  }

  process.stdout.write(`  Checked ${Math.min(i + 10, banners.length)}/${banners.length}\r`)
}

console.log('\n\n=== BROKEN BANNERS ===\n')

if (broken.length === 0) {
  console.log('No broken images found!')
} else {
  console.log(`Found ${broken.length} banners with broken images:\n`)
  let lastOem = ''
  for (const b of broken) {
    if (b.oem_id !== lastOem) { console.log(`\n--- ${b.oem_id} ---`); lastOem = b.oem_id }
    console.log(`  "${b.headline || '(no headline)'}" | page: ${(b.page_url || '').replace(/^https?:\/\/[^/]+/, '')}`)
    if (b.desktop_url && b.desktop_status !== null) {
      console.log(`    Desktop [${b.desktop_status}]: ${b.desktop_url.substring(0, 100)}`)
    }
    if (b.mobile_url && b.mobile_status !== null && !b.mobile_status) {
      console.log(`    Mobile  [${b.mobile_status}]: ${b.mobile_url.substring(0, 100)}`)
    }
  }
}

console.log('\n\n=== SUMMARY BY OEM ===\n')
console.log('OEM               | Total | OK    | Broken')
console.log('------------------|-------|-------|-------')
for (const [oem, s] of Object.entries(byOem).sort((a, b) => a[0].localeCompare(b[0]))) {
  const marker = s.broken > 0 ? ' !!!' : ''
  console.log(`${oem.padEnd(18)}| ${String(s.total).padEnd(6)}| ${String(s.ok).padEnd(6)}| ${s.broken}${marker}`)
}

// Output broken IDs for easy deletion
if (broken.length > 0) {
  console.log('\n\n=== BROKEN BANNER IDs (for deletion) ===\n')
  console.log(JSON.stringify(broken.map(b => b.id)))
}
