/**
 * Seed Suzuki banners from suzuki.com.au using Puppeteer.
 *
 * Suzuki's hero carousel is client-rendered (JS injects bg-image styles).
 * /home/ has a slick carousel (hb-2025-refresh) with desktop+mobile bg images.
 * /latest-offers/ has a hero image and offer cards.
 *
 * Run: cd dashboard && node scripts/seed-suzuki-banners.mjs
 */
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer'

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const BASE = 'https://www.suzuki.com.au'
const now = new Date().toISOString()

async function scrapeHomepage(page) {
  console.log('Navigating to Suzuki /home/...')
  await page.goto(`${BASE}/home/`, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise(r => setTimeout(r, 4000))

  const slides = await page.evaluate((base) => {
    const results = []
    document.querySelectorAll('.hb-2025-refresh__item').forEach((item, i) => {
      // Desktop + mobile bg-image divs
      const bgDivs = item.querySelectorAll('.bg-image, [style*="background-image"]')
      let desktop = null, mobile = null
      bgDivs.forEach(div => {
        const style = div.getAttribute('style') || ''
        const match = style.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/)
        if (!match) return
        const url = match[1].startsWith('http') ? match[1] : base + match[1]
        // First bg-image is desktop (wider), second is mobile (taller)
        if (!desktop) desktop = url
        else if (!mobile) mobile = url
      })

      const h = item.querySelector('h1, h2, .hb-2025-refresh__title')
      const sub = item.querySelector('.hb-2025-refresh__subtitle, .hb-2025-refresh__text p')
      const cta = item.querySelector('a.btn, a[class*="cta"], a[class*="button"]')

      if (desktop || mobile) {
        results.push({
          position: i,
          headline: h?.textContent?.trim() || null,
          sub_headline: sub?.textContent?.trim() || null,
          cta_text: cta?.textContent?.trim() || null,
          cta_url: cta?.href || null,
          image_url_desktop: desktop,
          image_url_mobile: mobile,
        })
      }
    })
    return results
  }, BASE)

  console.log(`  Found ${slides.length} hero slides`)
  return slides.map(s => ({
    oem_id: 'suzuki-au',
    page_url: `${BASE}/home/`,
    ...s,
    last_seen_at: now,
  }))
}

async function scrapeOffers(page) {
  console.log('Navigating to Suzuki /latest-offers/...')
  await page.goto(`${BASE}/latest-offers/`, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise(r => setTimeout(r, 3000))

  const banners = await page.evaluate((base) => {
    const results = []
    // Hero banner — largest image on the page
    const imgs = [...document.querySelectorAll('img')]
      .filter(i => i.src?.includes('wp-content/uploads') && i.naturalHeight > 400)
      .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight))

    if (imgs.length > 0) {
      const hero = imgs[0]
      const parent = hero.closest('section, [class*="hero"], [class*="banner"]')
      const h = parent?.querySelector('h1, h2')
      results.push({
        position: 0,
        headline: h?.textContent?.trim() || hero.alt || 'Latest Offers',
        image_url_desktop: hero.src,
      })
    }
    return results
  }, BASE)

  console.log(`  Found ${banners.length} offers banners`)
  return banners.map(b => ({
    oem_id: 'suzuki-au',
    page_url: `${BASE}/latest-offers/`,
    ...b,
    last_seen_at: now,
  }))
}

async function main() {
  console.log('\n=== Suzuki Banner Seed (Puppeteer) ===\n')

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  let allBanners = []

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1920, height: 1080 })

    const homeBanners = await scrapeHomepage(page)
    const offersBanners = await scrapeOffers(page)
    allBanners = [...homeBanners, ...offersBanners]
  } finally {
    await browser.close()
  }

  if (allBanners.length === 0) {
    console.log('No banners found — aborting.')
    return
  }

  // Verify all images load before inserting
  console.log('\nVerifying image URLs...')
  let broken = 0
  for (const b of allBanners) {
    for (const field of ['image_url_desktop', 'image_url_mobile']) {
      const url = b[field]
      if (!url) continue
      try {
        const res = await fetch(url, { method: 'HEAD' })
        const ok = res.status === 200
        console.log(`  ${ok ? '✓' : '✗ ' + res.status} ${field === 'image_url_desktop' ? 'desk' : 'mob '} ${b.headline || '(none)'}`)
        if (!ok) { b[field] = null; broken++ }
      } catch { b[field] = null; broken++ }
    }
  }
  if (broken) console.log(`  ${broken} broken URLs nulled out`)

  // Filter out banners with no images at all
  allBanners = allBanners.filter(b => b.image_url_desktop || b.image_url_mobile)

  // Delete ALL existing Suzuki banners and re-insert
  console.log('\nDeleting all existing Suzuki banners...')
  const { data: deleted } = await sb.from('banners').delete().eq('oem_id', 'suzuki-au').select('id')
  console.log(`  Deleted ${deleted?.length || 0} old banners`)

  console.log(`Inserting ${allBanners.length} fresh banners...`)
  const { error: insErr } = await sb.from('banners').insert(allBanners)
  if (insErr) {
    console.error('Insert error:', insErr.message)
    return
  }

  // Verify
  const { data: final } = await sb.from('banners')
    .select('page_url, position, headline, image_url_desktop, image_url_mobile, updated_at')
    .eq('oem_id', 'suzuki-au')
    .order('page_url').order('position')

  console.log(`\n=== ${final.length} Suzuki banners in DB ===`)
  for (const b of final) {
    const d = b.image_url_desktop ? '✓desk' : '✗desk'
    const m = b.image_url_mobile ? '✓mob' : '✗mob'
    console.log(`  ${b.page_url.replace(BASE, '')} #${b.position} ${(b.headline || '').padEnd(25)} ${d} ${m} ${b.updated_at?.substring(0, 19)}`)
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
