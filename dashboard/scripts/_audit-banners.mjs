/**
 * Audit banners for:
 * 1. Video banners (missing?)
 * 2. Variant/model images incorrectly captured as banners
 * 3. Mobile image coverage
 */
import { createClient } from '@supabase/supabase-js'
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const { data } = await sb.from('banners').select('*').order('oem_id, position')

console.log('=== BANNER AUDIT ===\n')
console.log(`Total banners: ${data.length}\n`)

// 1. Check for video content
console.log('--- VIDEO CHECK ---')
const videoExts = ['.mp4', '.webm', '.mov', '.avi']
const videoKeywords = ['video', 'mp4', 'webm', 'autoplay', 'poster']
for (const b of data) {
  const img = (b.image_url_desktop || '').toLowerCase()
  const imgM = (b.image_url_mobile || '').toLowerCase()
  const isVideo = videoExts.some(e => img.includes(e) || imgM.includes(e))
  const hasVideoKw = videoKeywords.some(k => img.includes(k) || imgM.includes(k))
  if (isVideo || hasVideoKw) {
    console.log(`  VIDEO: ${b.oem_id} | ${b.headline} | ${img.split('/').pop()?.substring(0, 60)}`)
  }
}
console.log('  (No video banners found in DB — these are static image captures only)\n')

// 2. Check for suspected variant/model images (not hero banners)
console.log('--- SUSPECTED VARIANT/MODEL IMAGES ---')
// Look for patterns that suggest product shots rather than hero banners
const suspectPatterns = [
  // Configurator/variant renders
  /configurator/i, /variant/i, /grade/i,
  // Small product tiles
  /thumb/i, /tile/i, /card/i,
  // Colour-specific renders (suggests variant colors)
  /colour|color/i,
  // Very specific model codes
  /\d{5,}/,
]

// Also check image dimensions by looking at URL patterns suggesting thumbnails
const thumbnailPatterns = [
  /\/w_\d{2,3}\//i,  // width 100-999 = small
  /\/h_\d{2,3}\//i,  // height 100-999 = small
  /\?w=\d{2,3}&/i,
  /\?.*width=\d{2,3}/i,
  /-\d{2,3}x\d{2,3}\./i,  // filename like -300x200.jpg
]

let suspectCount = 0
for (const b of data) {
  const img = b.image_url_desktop || b.image_url_mobile || ''
  const isSuspect = suspectPatterns.some(p => p.test(img))
  const isThumb = thumbnailPatterns.some(p => p.test(img))
  if (isSuspect || isThumb) {
    suspectCount++
    const fname = img.split('/').pop()?.substring(0, 70) || ''
    console.log(`  ${b.oem_id} | "${b.headline}" | ${fname}`)
  }
}
console.log(`  Suspect: ${suspectCount}/${data.length}\n`)

// 3. Mobile image coverage
console.log('--- MOBILE IMAGE COVERAGE ---')
const byOem = {}
for (const b of data) {
  if (!byOem[b.oem_id]) byOem[b.oem_id] = { total: 0, desktop: 0, mobile: 0, both: 0, desktopOnly: 0, mobileOnly: 0 }
  const s = byOem[b.oem_id]
  s.total++
  if (b.image_url_desktop) s.desktop++
  if (b.image_url_mobile) s.mobile++
  if (b.image_url_desktop && b.image_url_mobile) s.both++
  if (b.image_url_desktop && !b.image_url_mobile) s.desktopOnly++
  if (!b.image_url_desktop && b.image_url_mobile) s.mobileOnly++
}

console.log('OEM               | Total | Desktop | Mobile | Both | Desktop-only')
console.log('------------------|-------|---------|--------|------|-------------')
for (const [oem, s] of Object.entries(byOem).sort((a,b) => b[1].total - a[1].total)) {
  console.log(`${oem.padEnd(18)}| ${String(s.total).padEnd(6)}| ${String(s.desktop).padEnd(8)}| ${String(s.mobile).padEnd(7)}| ${String(s.both).padEnd(5)}| ${s.desktopOnly}`)
}

const totalDesktop = data.filter(b => b.image_url_desktop).length
const totalMobile = data.filter(b => b.image_url_mobile).length
const totalBoth = data.filter(b => b.image_url_desktop && b.image_url_mobile).length
console.log(`\nTotals: ${totalDesktop} desktop, ${totalMobile} mobile, ${totalBoth} both`)

// 4. Show all image URLs for manual review by OEM
console.log('\n--- ALL BANNER IMAGE URLs (for manual review) ---')
let lastOem = ''
for (const b of data) {
  if (b.oem_id !== lastOem) { console.log(`\n=== ${b.oem_id} ===`); lastOem = b.oem_id }
  const dImg = (b.image_url_desktop || '').split('/').pop()?.substring(0, 70) || '(none)'
  const mImg = b.image_url_mobile ? (b.image_url_mobile).split('/').pop()?.substring(0, 70) : ''
  const page = (b.page_url || '').replace(/^https?:\/\/[^/]+/, '')
  console.log(`  [${b.position ?? '-'}] "${b.headline}" | D: ${dImg}${mImg ? ` | M: ${mImg}` : ''} | ${page}`)
}
