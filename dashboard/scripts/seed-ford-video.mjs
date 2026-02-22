/**
 * Update Ford banner with Brightcove video details.
 * 
 * Ford uses Brightcove Video Cloud for hero videos.
 * - Account: 4082198814001
 * - Player: H1RIrS7kf  
 * - Policy Key: BCpkADawqM3OA4B-vfeXkwN3iXb7CyA4OXQG3HnV_7QiY4oVvJiq3qZaR9_QEfCSXPT0FcResTPflRZJ6ftutqNfXexdtRjzhA8bfzdRvRt8X6aCpQ2Yd_4rs8G0znPmWcl5gUHnI6zKN0bA
 * 
 * The mp4 URLs use Fastly signed tokens that expire.
 * We store the Brightcove video ID in meta so we can fetch fresh URLs at runtime.
 * For the dashboard, we fetch a fresh mp4 URL now and store it.
 *
 * Run: cd dashboard && node scripts/seed-ford-video.mjs
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const ACCOUNT_ID = '4082198814001'
const POLICY_KEY = 'BCpkADawqM3OA4B-vfeXkwN3iXb7CyA4OXQG3HnV_7QiY4oVvJiq3qZaR9_QEfCSXPT0FcResTPflRZJ6ftutqNfXexdtRjzhA8bfzdRvRt8X6aCpQ2Yd_4rs8G0znPmWcl5gUHnI6zKN0bA'

// Step 1: Get video ID from homepage (we know it's 6389171468112 currently)
// In the future, a scraper would extract data-video-id from the page
const VIDEO_ID = '6389171468112'

// Step 2: Fetch fresh mp4 URL from Brightcove Playback API
const resp = await fetch(
  `https://edge.api.brightcove.com/playback/v1/accounts/${ACCOUNT_ID}/videos/${VIDEO_ID}`,
  { headers: { 'Accept': `application/json;pk=${POLICY_KEY}` } }
)
const data = await resp.json()
console.log('Brightcove video:', data.name, `(${data.duration}ms)`)

const mp4s = (data.sources || []).filter(s => s.container === 'MP4' && s.src?.startsWith('https'))
const mp4Url = mp4s[0]?.src
const posterUrl = data.poster

console.log('MP4:', mp4Url?.substring(0, 80) + '...')
console.log('Poster:', posterUrl)

// Step 3: Find the Ford homepage banner that's the video slide (Slide 1 — "Retail Ranger")
// The first billboard-item is the video hero
const { data: fordBanners, error: qErr } = await sb
  .from('banners')
  .select('id, headline, position, image_url_desktop')
  .eq('oem_id', 'ford-au')
  .eq('page_url', 'https://www.ford.com.au/')
  .order('position')

if (qErr) {
  console.error('Query error:', qErr.message)
  process.exit(1)
}

console.log(`\nFound ${fordBanners.length} Ford homepage banners:`)
for (const b of fordBanners) {
  console.log(`  [${b.position}] ${b.headline}`)
}

// Update the first banner (position 0) with video
const target = fordBanners.find(b => b.position === 0)
if (!target) {
  console.error('No position-0 banner found')
  process.exit(1)
}

const { error: uErr } = await sb
  .from('banners')
  .update({
    video_url_desktop: mp4Url,
    // Store poster as desktop image if not already set
    image_url_desktop: target.image_url_desktop || posterUrl,
  })
  .eq('id', target.id)

if (uErr) {
  console.error('Update error:', uErr.message)
} else {
  console.log(`\nUpdated Ford banner "${target.headline}" with video URL`)
}

// Verify
const { data: updated } = await sb
  .from('banners')
  .select('oem_id, headline, video_url_desktop, image_url_desktop')
  .not('video_url_desktop', 'is', null)

console.log(`\nAll banners with video: ${updated?.length}`)
for (const b of updated || []) {
  console.log(`  ${b.oem_id}: ${b.headline}`)
}
