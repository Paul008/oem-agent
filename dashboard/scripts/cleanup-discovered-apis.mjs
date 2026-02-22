/**
 * Clean up discovered_apis table — remove tracking pixels, analytics, and other garbage.
 * Keep only verified APIs and potentially useful OEM-domain discovered APIs.
 * Run: node dashboard/scripts/cleanup-discovered-apis.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

// Domains that are always garbage (tracking, analytics, ads, pixels)
const GARBAGE_DOMAINS = [
  'demdex.net',
  'omtrdc.net',
  '2o7.net',
  'omniture.com',
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'doubleclick.net',
  'googlesyndication.com',
  'googleads.g.doubleclick.net',
  'youtube.com',
  'youtu.be',
  'facebook.com',
  'facebook.net',
  'fbcdn.net',
  'connect.facebook.net',
  'hotjar.com',
  'content.hotjar.io',
  'sentry.io',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'bing.com',
  'clarity.ms',
  'onetrust.com',
  'cookielaw.org',
  'go-mpulse.net',
  'spotify.com',
  'pixels.spotify.com',
  'maze.co',
  'convertexperiments.com',
  'widgetinstall.com',
  'mpc2-prod-24-is5qnl632q-uw.a.run.app',
  'challenges.cloudflare.com',
  'googleadservices.com',       // Google Ads conversion pixels
  'vw-tam.lighthouselabs.eu',   // VW personalisation server (not vehicle data)
  'lp.suzuki.com.au',           // Marketo lead forms
  'prompts.maze.co',
]

// URL patterns that are garbage even on OEM domains
const GARBAGE_URL_PATTERNS = [
  '/_bm/get_params',            // Bot management
  '/page-data/sq/d/',           // Gatsby static query hashes
  '/log_event',                 // Event logging
  '/grecaptcha',                // reCAPTCHA
  '/animation/anim.json',       // Lottie animations (Hyundai)
  '/animation/SFIceLottie.json',// Lottie animations (Hyundai)
  '/content/api/au/hyundai/v3/glossary', // Hyundai glossary, not vehicle data
  '/postcodes.modified.json',   // Mitsubishi postcodes variant
  'accessories.html',           // Nissan accessory HTML pages (not API)
]

// Gatsby page-data paths that are NOT vehicle/offer data (LDV)
const LDV_JUNK_PAGES = [
  'about', 'book-a-service', 'change-of-owner', 'connected-app', 'contact',
  'download-brochure', 'financialservices', 'fleet-contact', 'fleet-enquiry',
  'fleet', 'genuine-parts-and-service', 'ldv-stories', 'locate-a-dealer',
  'maintain-ldv', 'privacy', 'reviews', 'roadside', 'index',
  'support', 'warranty',
]

function isGarbage(url) {
  // Check garbage domains
  for (const domain of GARBAGE_DOMAINS) {
    if (url.includes(domain)) return true
  }
  // Check garbage URL patterns
  for (const pattern of GARBAGE_URL_PATTERNS) {
    if (url.includes(pattern)) return true
  }
  // LDV non-data pages
  for (const page of LDV_JUNK_PAGES) {
    if (url.includes(`/page-data/${page}/`)) return true
  }
  return false
}

async function cleanup() {
  // Fetch all discovered (not verified) APIs
  console.log('Fetching all discovered APIs...')
  const { data: all, error } = await supabase
    .from('discovered_apis')
    .select('id, oem_id, url, status, reliability_score, data_type')
    .eq('status', 'discovered')
  if (error) { console.error(error.message); process.exit(1) }
  console.log(`  Found ${all.length} discovered APIs`)

  // Categorize
  const garbage = []
  const keep = []
  for (const api of all) {
    if (isGarbage(api.url)) {
      garbage.push(api)
    } else {
      keep.push(api)
    }
  }

  console.log(`\n  GARBAGE (will delete): ${garbage.length}`)
  console.log(`  KEEP (potentially useful): ${keep.length}`)

  // Show what we're keeping grouped by OEM
  console.log('\n--- Keeping these discovered APIs ---')
  const byOem = {}
  for (const api of keep) {
    if (!byOem[api.oem_id]) byOem[api.oem_id] = []
    byOem[api.oem_id].push(api)
  }
  for (const [oem, apis] of Object.entries(byOem).sort()) {
    console.log(`\n  ${oem} (${apis.length}):`)
    for (const a of apis) {
      const dtype = (a.data_type || '-').padEnd(12)
      console.log(`    [${a.reliability_score || 0}] ${dtype} ${a.url.slice(0, 100)}`)
    }
  }

  // Delete garbage
  if (garbage.length > 0) {
    console.log(`\nDeleting ${garbage.length} garbage APIs...`)
    // Delete in batches of 100 (Supabase limit for IN clauses)
    const batchSize = 100
    let deleted = 0
    for (let i = 0; i < garbage.length; i += batchSize) {
      const batch = garbage.slice(i, i + batchSize).map(g => g.id)
      const { error: delErr } = await supabase
        .from('discovered_apis')
        .delete()
        .in('id', batch)
      if (delErr) {
        console.error(`  Batch error: ${delErr.message}`)
      } else {
        deleted += batch.length
      }
    }
    console.log(`  Deleted ${deleted} garbage APIs`)
  }

  // Final count
  const { count } = await supabase
    .from('discovered_apis')
    .select('*', { count: 'exact', head: true })
  console.log(`\n=== CLEANUP COMPLETE ===`)
  console.log(`  Remaining APIs: ${count}`)

  // Show final breakdown
  const { data: final } = await supabase
    .from('discovered_apis')
    .select('oem_id, status')
  const summary = {}
  for (const f of final) {
    if (!summary[f.oem_id]) summary[f.oem_id] = { verified: 0, discovered: 0 }
    summary[f.oem_id][f.status] = (summary[f.oem_id][f.status] || 0) + 1
  }
  console.log('\n  Final breakdown:')
  for (const [oem, s] of Object.entries(summary).sort()) {
    const total = (s.verified || 0) + (s.discovered || 0)
    console.log(`    ${oem.padEnd(20)} verified=${(s.verified || 0).toString().padStart(2)} discovered=${(s.discovered || 0).toString().padStart(2)} total=${total}`)
  }
}

cleanup().catch(err => { console.error(err); process.exit(1) })
