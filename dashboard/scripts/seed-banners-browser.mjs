/**
 * Insert banners extracted via browser session (client-side rendered sites).
 * Supplements seed-banners-v2.mjs which handles server-rendered sites.
 *
 * Run: cd dashboard && node scripts/seed-banners-browser.mjs
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const now = new Date().toISOString()

function banner(oem_id, page_url, position, data) {
  return {
    id: crypto.randomUUID(),
    oem_id,
    page_url,
    position,
    headline: data.headline || null,
    sub_headline: data.sub_headline || null,
    cta_text: data.cta_text || null,
    cta_url: data.cta_url || null,
    image_url_desktop: data.desktop || null,
    image_url_mobile: data.mobile || null,
    last_seen_at: now,
    created_at: now,
    updated_at: now,
  }
}

const NISSAN_CDN = 'https://www-asia.nissan-cdn.net'
const NISSAN_DAM = '/content/dam/Nissan/AU/Images/homepage'
const NISSAN_NZ_DAM = '/content/dam/Nissan/new-zealand/images/homepage'

const banners = [
  // ── Hyundai (1 hero banner — client-side rendered) ───
  banner('hyundai-au', 'https://www.hyundai.com/au/en', 0, {
    desktop: 'https://www.hyundai.com/content/dam/hyundai/au/en/homepage/2025/ELEXIO_Hero_D_1920x720.jpg',
    headline: 'The all-new ELEXIO.',
    sub_headline: 'With an introductory price of $59,990 driveaway*.',
    cta_url: 'https://www.hyundai.com/au/en/cars/eco/elexio',
  }),

  // ── Nissan (5 unique hero slides — replace the 1 from v2 script) ───
  banner('nissan-au', 'https://www.nissan.com.au/', 0, {
    desktop: `${NISSAN_CDN}${NISSAN_DAM}/AU21-P00000234-07_Nissan_MY25_Patrol_RichMedia_1920X1080_v1_hero_d_r7.jpg.ximg.full.hero.jpg`,
    mobile: `${NISSAN_CDN}${NISSAN_DAM}/Patrol_hp_m_r21.jpg.ximg.c1m.hero.jpg`,
    headline: 'Nissan Patrol',
  }),
  banner('nissan-au', 'https://www.nissan.com.au/', 1, {
    desktop: `${NISSAN_CDN}${NISSAN_DAM}/AU21-P00000240-40-FY24_Q4_MARCH_RETAIL-hp-d-r5.jpg.ximg.full.hero.jpg`,
    mobile: `${NISSAN_CDN}${NISSAN_DAM}/AU21-P00000240-40-FY24_Q4_MARCH_RETAIL-hp-m-r2.jpg.ximg.c1m.hero.jpg`,
    headline: 'MY25 X-TRAIL',
  }),
  banner('nissan-au', 'https://www.nissan.com.au/', 2, {
    desktop: `${NISSAN_CDN}${NISSAN_DAM}/All-New-Navara-d-hp-r1.jpg.ximg.full.hero.jpg`,
    mobile: `${NISSAN_CDN}${NISSAN_NZ_DAM}/2026NissanNavaraPRO-4X003-home-hero-m.jpg.ximg.c1m.hero.jpg`,
    headline: 'Built for the grit shift — ALL-NEW NISSAN NAVARA',
  }),
  banner('nissan-au', 'https://www.nissan.com.au/', 3, {
    desktop: `${NISSAN_CDN}${NISSAN_DAM}/X-TRAIL-HERO-SURF-FINAL-WIDE-hp-d-r2.jpg.ximg.full.hero.jpg`,
    mobile: `${NISSAN_CDN}${NISSAN_DAM}/X-TRAIL-HERO-SURF-FINAL-WIDE-hp-m.jpg.ximg.c1m.hero.jpg`,
    headline: 'NEW X-TRAIL',
  }),
  banner('nissan-au', 'https://www.nissan.com.au/', 4, {
    desktop: `${NISSAN_CDN}${NISSAN_DAM}/payrewards-hp-d-r2.jpg.ximg.full.hero.jpg`,
    mobile: `${NISSAN_CDN}${NISSAN_DAM}/payrewards-hp-m.jpg.ximg.c1m.hero.jpg`,
    headline: 'Nissan Pay Rewards',
  }),

  // ── Toyota (1 hero banner — Cloudflare protected) ───
  banner('toyota-au', 'https://www.toyota.com.au/', 0, {
    desktop: 'https://www.toyota.com.au/-/media/project/toyota/toyota/homepage/image/homepage-banner-hilux/hilux-2025-hero-desktop.jpg',
    mobile: 'https://www.toyota.com.au/-/media/project/toyota/toyota/homepage/image/homepage-banner-hilux/hilux-2025-hero-mobile.jpg',
    headline: 'New HiLux',
    cta_url: 'https://www.toyota.com.au/hilux',
  }),
]

async function main() {
  console.log(`Inserting ${banners.length} browser-extracted banners...\n`)

  // Delete existing Nissan banners (replacing the 1 from v2 with 5 unique)
  const { error: delNissan } = await sb.from('banners').delete().eq('oem_id', 'nissan-au')
  if (delNissan) console.error('Delete Nissan error:', delNissan.message)
  else console.log('Deleted existing Nissan banners')

  // Insert all
  const { error } = await sb.from('banners').insert(banners)
  if (error) {
    console.error('Insert error:', error.message)
  } else {
    console.log(`Inserted ${banners.length} banners`)
  }

  // Final count
  const { count } = await sb.from('banners').select('*', { count: 'exact', head: true })
  console.log(`\nTotal banners in DB: ${count}`)

  // By OEM
  const { data: all } = await sb.from('banners').select('oem_id')
  const counts = {}
  for (const b of all || []) counts[b.oem_id] = (counts[b.oem_id] || 0) + 1
  console.log('\nBy OEM:')
  for (const [oem, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${oem}: ${c}`)
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
