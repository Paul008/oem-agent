/**
 * Remove non-banner entries (navigation icons, tracking pixels, etc.)
 * from the banners table.
 */
import { createClient } from '@supabase/supabase-js'
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const { data } = await sb.from('banners').select('id, oem_id, headline, image_url_desktop')
const toDelete = data.filter(b => {
  const h = (b.headline || '').toLowerCase()
  const img = (b.image_url_desktop || '').toLowerCase()
  // Navigation menu icons
  if (h.includes('navigation icon')) return true
  // Nav menu images (Build & Price, Test Drive etc.)
  if (img.includes('hyundai_nav_')) return true
  return false
})

console.log(`Total banners: ${data.length}`)
console.log(`To delete (nav icons): ${toDelete.length}`)

if (toDelete.length > 0) {
  for (const b of toDelete) {
    console.log(`  Deleting: ${b.oem_id} | "${b.headline}" | ${(b.image_url_desktop || '').split('/').pop().substring(0, 40)}`)
  }
  const ids = toDelete.map(b => b.id)
  const { error } = await sb.from('banners').delete().in('id', ids)
  if (error) console.error('Delete error:', error.message)
  else console.log(`\nDeleted ${ids.length} non-banner entries.`)

  const { count } = await sb.from('banners').select('*', { count: 'exact', head: true })
  console.log(`Remaining: ${count} banners`)
}
