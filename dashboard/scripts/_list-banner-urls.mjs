import { createClient } from '@supabase/supabase-js'
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)
const { data } = await sb.from('banners').select('id, oem_id, page_url, position, headline, image_url_desktop').order('oem_id, position')
if (!data) { console.log('No data'); process.exit(1) }
// Show banners without headline, grouped by OEM
const noText = data.filter(b => !b.headline)
console.log(`Total: ${data.length}, No headline: ${noText.length}\n`)
let lastOem = ''
for (const b of noText) {
  if (b.oem_id !== lastOem) { console.log(`\n=== ${b.oem_id} ===`); lastOem = b.oem_id }
  const fname = (b.image_url_desktop || '').split('/').pop()
  const path = (b.page_url || '').replace(/^https?:\/\/[^/]+/, '')
  console.log(`  [${b.position}] ${path} | ${fname.substring(0, 60)} | id:${b.id.substring(0, 8)}`)
}
