/**
 * Seed LDV banners from ldvautomotive.com.au using Puppeteer.
 *
 * LDV's site is a Gatsby/React app on the i-motor CMS platform.
 * The hero carousel is client-side rendered, so we need a headless browser.
 * Images are hosted on cdn.cms-uploads.i-motor.me.
 *
 * Run: cd dashboard && node scripts/seed-ldv-banners.mjs
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import puppeteer from 'puppeteer'

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const CDN_HOST = 'cdn.cms-uploads.i-motor.me'
const HOMEPAGE_URL = 'https://www.ldvautomotive.com.au/'
const OFFERS_URL = 'https://www.ldvautomotive.com.au/special-offers/'

const now = new Date().toISOString()

function banner(page_url, position, data) {
  return {
    id: crypto.randomUUID(),
    oem_id: 'ldv-au',
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

/**
 * Extract carousel slides from a rendered page.
 * Looks for <picture> elements with i-motor CDN sources.
 */
async function extractSlides(page) {
  return page.evaluate((cdnHost) => {
    const results = []
    const pictures = document.querySelectorAll('picture')

    pictures.forEach(pic => {
      const sources = pic.querySelectorAll('source')
      const img = pic.querySelector('img')
      let desktop = null, mobile = null

      sources.forEach(src => {
        if (src.srcset && src.srcset.includes(cdnHost)) {
          if (src.media && src.media.includes('max-width')) {
            mobile = src.srcset.trim()
          } else {
            desktop = src.srcset.trim()
          }
        }
      })

      // Also check img src directly
      if (!desktop && img?.src?.includes(cdnHost)) {
        desktop = img.src.trim()
      }

      if (!desktop && !mobile) return

      // Find parent link
      let link = null
      let el = pic.parentElement
      while (el && el.tagName !== 'BODY') {
        if (el.tagName === 'A') { link = el.href; break }
        el = el.parentElement
      }

      // Find nearby heading text
      let headline = img?.alt || null
      if (!headline) {
        const parent = pic.closest('[class*="hero"], [class*="banner"], [class*="carousel"], [class*="slide"]')
        if (parent) {
          const h = parent.querySelector('h1, h2, h3')
          if (h) headline = h.textContent.trim()
        }
      }

      // Find CTA text
      let ctaText = null, ctaUrl = null
      const parent = pic.closest('[class*="hero"], [class*="banner"], [class*="carousel"], [class*="slide"]')
      if (parent) {
        const cta = parent.querySelector('a[class*="btn"], a[class*="cta"], a[class*="button"]')
        if (cta) {
          ctaText = cta.textContent.trim()
          ctaUrl = cta.href
        }
      }

      results.push({ desktop, mobile, alt: headline, link, ctaText, ctaUrl })
    })

    return results
  }, CDN_HOST)
}

async function main() {
  console.log('\n=== LDV Banner Seed (Puppeteer) ===\n')

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const banners = []

  try {
    const page = await browser.newPage()
    await page.setUserAgent(UA)
    await page.setViewport({ width: 1920, height: 1080 })

    // ── Homepage ──
    console.log('Navigating to LDV homepage...')
    await page.goto(HOMEPAGE_URL, { waitUntil: 'networkidle2', timeout: 60000 })
    await new Promise(r => setTimeout(r, 3000))

    const homeSlides = await extractSlides(page)
    console.log(`  Found ${homeSlides.length} picture elements on homepage`)

    // Filter to hero slides (link to /vehicles/* or /special-offers/)
    const heroSlides = homeSlides.filter(s => {
      if (!s.link) return true
      try {
        const path = new URL(s.link).pathname
        return path.startsWith('/vehicles/') || path.startsWith('/special-offers')
      } catch { return true }
    })
    console.log(`  Hero carousel slides: ${heroSlides.length}`)

    for (let i = 0; i < heroSlides.length; i++) {
      const s = heroSlides[i]
      banners.push(banner(HOMEPAGE_URL, i, {
        desktop: s.desktop,
        mobile: s.mobile,
        headline: s.alt,
        cta_text: s.ctaText,
        cta_url: s.link || s.ctaUrl,
      }))
      console.log(`    [${i}] ${s.alt || '(no alt)'} → ${s.desktop?.substring(0, 80)}...`)
    }

    // ── Offers page ──
    console.log('\nNavigating to LDV offers page...')
    try {
      await page.goto(OFFERS_URL, { waitUntil: 'networkidle2', timeout: 60000 })
      await new Promise(r => setTimeout(r, 3000))

      const offersSlides = await extractSlides(page)
      console.log(`  Found ${offersSlides.length} picture elements on offers page`)

      for (let i = 0; i < offersSlides.length; i++) {
        const s = offersSlides[i]
        banners.push(banner(OFFERS_URL, i, {
          desktop: s.desktop,
          mobile: s.mobile,
          headline: s.alt,
          cta_text: s.ctaText,
          cta_url: s.link || s.ctaUrl,
        }))
        console.log(`    [${i}] ${s.alt || '(no alt)'} → ${s.desktop?.substring(0, 80)}...`)
      }
    } catch (err) {
      console.log(`  Offers page failed: ${err.message}`)
    }

  } finally {
    await browser.close()
  }

  console.log(`\n--- Total LDV banners: ${banners.length} ---`)

  if (banners.length === 0) {
    console.log('No banners found. Exiting.')
    return
  }

  // Delete existing LDV banners
  console.log('\nClearing existing LDV banners...')
  const { error: delErr } = await sb.from('banners').delete().eq('oem_id', 'ldv-au')
  if (delErr) {
    console.error('Delete error:', delErr.message)
    return
  }

  // Insert new banners
  const { error: insErr } = await sb.from('banners').insert(banners)
  if (insErr) {
    console.error('Insert error:', insErr.message)
    return
  }

  console.log(`Inserted ${banners.length} LDV banners.`)

  // Verify
  const { count } = await sb.from('banners').select('*', { count: 'exact', head: true }).eq('oem_id', 'ldv-au')
  console.log(`LDV banners in database: ${count}`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
