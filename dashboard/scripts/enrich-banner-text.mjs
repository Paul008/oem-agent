/**
 * Enrich banners with overlay text (headline, sub_headline, cta_text).
 * Text was captured from browser-rendered pages where server-side HTML
 * didn't include the JS-rendered overlay text.
 *
 * Run: cd dashboard && node scripts/enrich-banner-text.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

// Enrichment data captured from browser-rendered pages.
// Keyed by partial image filename match → text data.
const ENRICHMENTS = [
  // ── Nissan homepage & offers (JS-rendered hero carousel) ──
  { match: 'Patrol_RichMedia', headline: 'MY25 Patrol', cta_text: 'Learn More' },
  { match: 'MARCH_RETAIL-hp', headline: 'MY25 X-Trail', sub_headline: 'Currently in runout', cta_text: 'View Offer' },
  { match: 'All-New-Navara-d-hp', headline: 'All-New Nissan Navara', sub_headline: 'Built for the grit shift', cta_text: 'Learn More' },
  { match: 'X-TRAIL-HERO-SURF', headline: 'New X-Trail', cta_text: 'Learn More' },
  { match: 'payrewards-hp', headline: 'Nissan Pay Rewards', cta_text: 'Learn More' },
  // Nissan offers — model tiles with image filenames
  { match: 'JK2PDTIY24', headline: 'Juke', sub_headline: 'Juke MY24' },
  { match: 'QQ-MY25-N-DESIGN', headline: 'Qashqai', sub_headline: 'Qashqai N-Design E-Power MY25' },
  { match: 'champagne silver', headline: 'X-Trail', sub_headline: 'X-Trail MY25 currently in runout' },
  { match: 'P33A_L4', headline: 'X-Trail', sub_headline: 'X-Trail MY26 range' },
  { match: 'Pathy Red', headline: 'Pathfinder', sub_headline: 'Pathfinder Ti-L' },
  { match: 'Ti-L Patrol', headline: 'Patrol', sub_headline: 'Patrol Ti-L' },
  { match: 'Manual-4X4-PRO-4X', headline: 'Navara', sub_headline: 'Navara PRO-4X' },
  { match: 'MY26 NAVARA UTN', headline: 'Navara', sub_headline: 'All-New Navara MY26' },
  { match: 'Z-coupe-black', headline: 'Z', sub_headline: 'Nissan Z Coupe' },
  { match: 'Ariya Copper', headline: 'Ariya', sub_headline: 'Nissan Ariya' },

  // ── Kia offers (JS-rendered offer cards) ──
  { match: 'kia-stonic-pe-s', headline: 'Stonic', sub_headline: 'Drive Away from $29,990', cta_text: 'View Offer' },
  { match: 'kia-sportage-s-hev', headline: 'Sportage', sub_headline: 'Drive Away from $44,490', cta_text: 'View Offer' },
  { match: 'kia-ev3-air', headline: 'EV3', sub_headline: 'Drive Away from $46,990', cta_text: 'View Offer' },
  { match: 'kia-ev3-gt-line', headline: 'EV3 GT-Line', sub_headline: '2.99% p.a. Comparison Rate', cta_text: 'View Offer' },
  { match: 'kia-ev5-air', headline: 'EV5', sub_headline: 'Drive Away estimate', cta_text: 'View Offer' },
  { match: 'kia-ev5-gt-line', headline: 'EV5 GT-Line', sub_headline: 'Drive Away estimate', cta_text: 'View Offer' },
  { match: 'kia-tasman-x-pro', headline: 'Tasman X-Pro', sub_headline: 'Drive Away estimate', cta_text: 'View Offer' },
  { match: 'kia-sorento-hev-s', headline: 'Sorento HEV', sub_headline: 'Drive Away estimate', cta_text: 'View Offer' },
  { match: 'kia-tasman-s', headline: 'Tasman', sub_headline: 'Drive Away estimate', cta_text: 'View Offer' },

  // ── Ford offers (AEM server-rendered but text in JS placeholders) ──
  { match: 'everest-trend-bi-turbo', headline: 'Everest Trend', sub_headline: 'Bi-Turbo 4WD' },
  { match: 'everest-sport-bi-turbo', headline: 'Everest Sport', sub_headline: 'Bi-Turbo 4WD' },
  { match: 'f-150-xlt-lwb-new', headline: 'F-150 XLT', sub_headline: 'Long Wheel Base' },
  { match: 'f-150-lariat-swb', headline: 'F-150 Lariat', sub_headline: 'Short Wheel Base' },
  { match: 'f-150-lariat-lwb-new', headline: 'F-150 Lariat', sub_headline: 'Long Wheel Base' },

  // ── GWM offers (Vue/Storyblok rendered) ──
  { match: '3008x0', headline: 'Special Offers', sub_headline: 'Garage Loyalty and Trade In bonuses available' },

  // ── Isuzu offers (Sitecore rendered header) ──
  { match: 'offers-header-banner.jpg', headline: 'Current Offers', sub_headline: 'Isuzu UTE Australia' },
  { match: 'offers-header-banner_tablet', headline: 'Current Offers', sub_headline: 'Isuzu UTE Australia' },
  { match: 'offers-header-banner_mobile', headline: 'Current Offers', sub_headline: 'Isuzu UTE Australia' },

  // ── KGM homepage (Next.js rendered) ──
  { match: 'KGM-Jan26Offers-background-desktop-musso', headline: 'KGM January Offers', sub_headline: 'Musso MY26' },

  // ── Hyundai homepage (Swiper JS-rendered) ──
  { match: 'IONIQ6N_RYI_Hero_D', headline: 'IONIQ 6 N', sub_headline: 'Performance redefined' },
]

async function main() {
  console.log('=== Banner Text Enrichment ===\n')

  // Fetch all banners without a headline
  const { data: banners, error } = await supabase
    .from('banners')
    .select('id, oem_id, page_url, position, headline, image_url_desktop')
    .is('headline', null)
  if (error) { console.error('Query error:', error.message); process.exit(1) }
  console.log(`Banners without headline: ${banners.length}\n`)

  let updated = 0
  let skipped = 0

  for (const banner of banners) {
    const imgUrl = decodeURIComponent(banner.image_url_desktop || '')
    // Find matching enrichment
    const enrichment = ENRICHMENTS.find(e => imgUrl.includes(e.match))
    if (!enrichment) {
      skipped++
      continue
    }

    const updates = {}
    if (enrichment.headline) updates.headline = enrichment.headline
    if (enrichment.sub_headline) updates.sub_headline = enrichment.sub_headline
    if (enrichment.cta_text) updates.cta_text = enrichment.cta_text
    if (enrichment.cta_url) updates.cta_url = enrichment.cta_url
    updates.updated_at = new Date().toISOString()

    const { error: upErr } = await supabase
      .from('banners')
      .update(updates)
      .eq('id', banner.id)

    if (upErr) {
      console.error(`  ERROR updating ${banner.id}: ${upErr.message}`)
    } else {
      updated++
      console.log(`  Updated ${banner.oem_id} [${banner.position}] → "${enrichment.headline}"`)
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped (no match)`)

  // Final stats
  const { count: total } = await supabase.from('banners').select('*', { count: 'exact', head: true })
  const { count: withHead } = await supabase.from('banners').select('*', { count: 'exact', head: true }).not('headline', 'is', null)
  const { count: withCta } = await supabase.from('banners').select('*', { count: 'exact', head: true }).not('cta_text', 'is', null)
  console.log(`\nFinal: ${total} banners, ${withHead} with headline (${Math.round(withHead/total*100)}%), ${withCta} with CTA`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
