/**
 * Update banners with video URLs where applicable.
 * 
 * Known video banners:
 * - Suzuki: desktop-new.mp4 / mobile-new.mp4 (hero video, autoplay muted)
 * - GWM: Two video sections (ORA + Tank 300) — not hero banners, skip
 * - VW: T-Roc video loaded client-side, no src in HTML — skip for now
 * - Kia: Videos client-side rendered — need browser session
 * 
 * Run: cd dashboard && node scripts/seed-banner-videos.mjs
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

// Suzuki — the homepage hero is a fullscreen video, not an image
const { data: suzukiBanners, error: sErr } = await sb
  .from('banners')
  .select('id, headline, sub_headline')
  .eq('oem_id', 'suzuki-au')
  .eq('page_url', 'https://www.suzuki.com.au/')

if (sErr) {
  console.error('Suzuki query error:', sErr.message)
} else {
  console.log(`Found ${suzukiBanners.length} Suzuki homepage banner(s)`)
  
  for (const b of suzukiBanners) {
    const { error: uErr } = await sb
      .from('banners')
      .update({
        video_url_desktop: 'https://www.suzuki.com.au/wp-content/themes/suzuki/dist/video/landing-page/desktop-new.mp4',
        video_url_mobile: 'https://www.suzuki.com.au/wp-content/themes/suzuki/dist/video/landing-page/mobile-new.mp4',
        // Clean up the workaround sub_headline if it had the video URL
        sub_headline: b.sub_headline?.startsWith('Video:') ? null : b.sub_headline,
      })
      .eq('id', b.id)
    
    if (uErr) console.error(`  Update error for ${b.id}:`, uErr.message)
    else console.log(`  Updated Suzuki banner: ${b.headline || '(no headline)'}`)
  }
}

// Verify
const { data: updated } = await sb
  .from('banners')
  .select('oem_id, headline, video_url_desktop, video_url_mobile')
  .not('video_url_desktop', 'is', null)

console.log(`\nBanners with video URLs: ${updated?.length || 0}`)
for (const b of updated || []) {
  console.log(`  ${b.oem_id}: ${b.headline || '(no headline)'}`)
  console.log(`    desktop: ${b.video_url_desktop}`)
  console.log(`    mobile: ${b.video_url_mobile}`)
}
