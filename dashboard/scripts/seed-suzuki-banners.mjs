/**
 * Seed Suzuki banners for /home/ (hero carousel) and /latest-offers/ (hero banner).
 *
 * /home/ has 3 slick carousel slides (e VITARA, JIMNY, Swift Hybrid) with desktop+mobile bg images.
 * /latest-offers/ has 1 hero banner (Vitara "SPACETACULAR") with responsive images.
 *
 * Also updates the existing root `/` banner page_url to `/` (video landing) and keeps video.
 *
 * Run: cd dashboard && node scripts/seed-suzuki-banners.mjs
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const BASE = 'https://www.suzuki.com.au'
const now = new Date().toISOString()

// === /home/ hero carousel — 3 slides ===
const homeSlides = [
  {
    oem_id: 'suzuki-au',
    page_url: `${BASE}/home/`,
    position: 0,
    headline: 'e VITARA',
    sub_headline: '100% ELECTRIC ADVENTURE',
    cta_text: 'REGISTER YOUR INTEREST',
    cta_url: `${BASE}/vehicles/electric/e-vitara/ryi`,
    image_url_desktop: `${BASE}/wp-content/uploads/2026/02/Group-325-2280x1600.webp`,
    image_url_mobile: `${BASE}/wp-content/uploads/2026/02/image-185-1280x1380.webp`,
    last_seen_at: now,
  },
  {
    oem_id: 'suzuki-au',
    page_url: `${BASE}/home/`,
    position: 1,
    headline: 'JIMNY',
    sub_headline: 'JIMNY GOES WHERE JIMNY WANTS',
    cta_text: 'EXPLORE JIMNY',
    cta_url: `${BASE}/vehicles/4x4/jimny/`,
    image_url_desktop: `${BASE}/wp-content/uploads/2023/08/SUZ895-WebsiteBanner-Desktop-2280x1600-Jimny-v1.1-2280x1600.webp`,
    image_url_mobile: `${BASE}/wp-content/uploads/2023/08/SUZ895-WebsiteBanner-Mobile-1280x1380-Jimny-v1.1-1280x1380.webp`,
    last_seen_at: now,
  },
  {
    oem_id: 'suzuki-au',
    page_url: `${BASE}/home/`,
    position: 2,
    headline: 'Swift Hybrid',
    sub_headline: 'WHAT DRIVES A CHAMPION?',
    cta_text: 'FIND OUT HOW',
    cta_url: `${BASE}/vehicles/hatch/swift-hybrid/`,
    image_url_desktop: `${BASE}/wp-content/uploads/2025/06/2280x1600-3-2280x1600.webp`,
    image_url_mobile: `${BASE}/wp-content/uploads/2025/06/1280x1380-5-1280x1380.webp`,
    last_seen_at: now,
  },
]

// === /latest-offers/ hero banner ===
const offersBanner = {
  oem_id: 'suzuki-au',
  page_url: `${BASE}/latest-offers/`,
  position: 0,
  headline: 'SPACETACULAR',
  sub_headline: 'EVEN MADE UP WORDS CANNOT DESCRIBE VITARA.',
  cta_text: 'BOOK A TEST DRIVE',
  cta_url: `${BASE}/book-test-drive/`,
  image_url_desktop: `${BASE}/wp-content/uploads/2025/05/Latest-Offer-Desktop-1920x768.webp`,
  image_url_mobile: `${BASE}/wp-content/uploads/2023/08/Latest-Offer-Mobile-1200x675.webp`,
  last_seen_at: now,
}

// Delete existing /home/ and /latest-offers/ banners
console.log('Deleting existing Suzuki /home/ and /latest-offers/ banners...')
const { error: delErr1 } = await sb
  .from('banners')
  .delete()
  .eq('oem_id', 'suzuki-au')
  .eq('page_url', `${BASE}/home/`)

const { error: delErr2 } = await sb
  .from('banners')
  .delete()
  .eq('oem_id', 'suzuki-au')
  .eq('page_url', `${BASE}/latest-offers/`)

if (delErr1) console.error('Delete /home/ error:', delErr1.message)
if (delErr2) console.error('Delete /latest-offers/ error:', delErr2.message)

// Insert /home/ slides
const { data: homeData, error: homeErr } = await sb
  .from('banners')
  .insert(homeSlides)
  .select('id, position, headline')

if (homeErr) {
  console.error('Insert /home/ error:', homeErr.message)
} else {
  console.log(`Inserted ${homeData.length} /home/ banners:`)
  for (const b of homeData) console.log(`  [${b.position}] ${b.headline}`)
}

// Insert /latest-offers/ banner
const { data: offData, error: offErr } = await sb
  .from('banners')
  .insert([offersBanner])
  .select('id, position, headline')

if (offErr) {
  console.error('Insert /latest-offers/ error:', offErr.message)
} else {
  console.log(`Inserted ${offData.length} /latest-offers/ banner:`)
  for (const b of offData) console.log(`  [${b.position}] ${b.headline}`)
}

// Verify totals
const { count } = await sb
  .from('banners')
  .select('*', { count: 'exact', head: true })
  .eq('oem_id', 'suzuki-au')

console.log(`\nTotal Suzuki banners: ${count}`)

// Show all
const { data: all } = await sb
  .from('banners')
  .select('page_url, position, headline, image_url_desktop, video_url_desktop')
  .eq('oem_id', 'suzuki-au')
  .order('page_url, position')

for (const b of all || []) {
  const vid = b.video_url_desktop ? ' [VIDEO]' : ''
  console.log(`  ${b.page_url} [${b.position}] ${b.headline}${vid}`)
}
