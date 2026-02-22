import { createClient } from '@supabase/supabase-js'
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)
const { data, error } = await sb.from('banners').select('oem_id, page_url, headline, sub_headline, cta_text, cta_url')
if (error) { console.error('Query error:', error.message); process.exit(1) }
if (!data) { console.log('No data returned'); process.exit(0) }

const withH = data.filter(b => b.headline)
const withS = data.filter(b => b.sub_headline)
const withCT = data.filter(b => b.cta_text)
const withCU = data.filter(b => b.cta_url)

console.log(`Total: ${data.length}`)
console.log(`With headline: ${withH.length} (${Math.round(withH.length/data.length*100)}%)`)
console.log(`With sub_headline: ${withS.length} (${Math.round(withS.length/data.length*100)}%)`)
console.log(`With cta_text: ${withCT.length} (${Math.round(withCT.length/data.length*100)}%)`)
console.log(`With cta_url: ${withCU.length} (${Math.round(withCU.length/data.length*100)}%)`)
console.log()

// Group by OEM
const byOem = {}
for (const b of data) {
  if (!byOem[b.oem_id]) byOem[b.oem_id] = { total: 0, headline: 0, sub: 0, cta: 0 }
  byOem[b.oem_id].total++
  if (b.headline) byOem[b.oem_id].headline++
  if (b.sub_headline) byOem[b.oem_id].sub++
  if (b.cta_text) byOem[b.oem_id].cta++
}
console.log('By OEM:')
console.log('OEM             | Total | Head | Sub  | CTA')
console.log('----------------|-------|------|------|-----')
for (const [oem, s] of Object.entries(byOem).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`${oem.padEnd(16)}| ${String(s.total).padEnd(6)}| ${String(s.headline).padEnd(5)}| ${String(s.sub).padEnd(5)}| ${s.cta}`)
}

// Show bad headlines (too short or generic)
console.log('\nBad/generic headlines:')
for (const b of data) {
  const h = b.headline || ''
  if (h.includes('navigation icon') || h.includes('website') || h.length < 3) {
    const path = (b.page_url || '').replace(/^https?:\/\/[^/]+/, '')
    console.log(`  ${b.oem_id} ${path} → "${h}"`)
  }
}
