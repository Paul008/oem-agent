/**
 * Re-seed Isuzu banners from isuzuute.com.au using Puppeteer screenshots.
 *
 * Isuzu's CDN is behind Cloudflare bot protection, so static fetch returns
 * challenge pages. We use Puppeteer to render the page and screenshot each
 * carousel slide, then upload to Supabase Storage.
 *
 * Run: cd dashboard && node scripts/_reseed-isuzu-banners.mjs
 */
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import crypto from 'crypto'
import puppeteer from 'puppeteer'

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'isuzu-au'
const BASE = 'https://www.isuzuute.com.au'
const BUCKET = 'banners'
const now = new Date().toISOString()

function makeBanner(page_url, position, data) {
  return {
    id: crypto.randomUUID(),
    oem_id: OEM_ID,
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

async function ensureBucket() {
  const { data: buckets } = await sb.storage.listBuckets()
  if (!buckets?.find(b => b.name === BUCKET)) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: true })
    if (error && !error.message.includes('already exists')) {
      throw new Error(`Failed to create bucket: ${error.message}`)
    }
  }
}

async function uploadScreenshot(buffer, filename) {
  const storagePath = `isuzu/${filename}`
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  const { data } = sb.storage.from(BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

async function main() {
  console.log('=== Re-seed Isuzu Banners (Puppeteer) ===\n')

  await ensureBucket()

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const banners = []

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1920, height: 1080 })

    // ── Homepage ──
    console.log('Navigating to Isuzu homepage...')
    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 })
    await new Promise(r => setTimeout(r, 4000))

    // Extract slide metadata
    const slides = await page.evaluate(() => {
      const results = []
      document.querySelectorAll('.hero-banner-carousel .carousel-item').forEach((item, i) => {
        const headline = (item.querySelector('.hero-carousel__heading, h1, h2')?.textContent || '').trim()
        const sub = (item.querySelector('.hero-carousel__subtext, .hero-carousel__description, p')?.textContent || '').trim()
        const ctaEl = item.querySelector('.hero-carousel__cta a, a.btn')
        results.push({
          headline: headline || null,
          sub_headline: sub || null,
          cta_text: ctaEl?.textContent?.trim() || null,
          cta_url: ctaEl?.getAttribute('href') || null,
        })
      })
      return results
    })

    console.log(`  Found ${slides.length} homepage slides`)

    // Stop autoplay
    await page.evaluate(() => {
      const id = setInterval(() => {}, 99999)
      for (let i = 1; i <= id; i++) clearInterval(i)
    })

    // Find carousel navigation
    const navInfo = await page.evaluate(() => {
      const indicators = document.querySelectorAll('.hero-banner-carousel .carousel-indicators button, .hero-banner-carousel .carousel-indicators li')
      const nextBtn = document.querySelector('.hero-banner-carousel .carousel-control-next, .hero-banner-carousel [data-bs-slide="next"]')
      return {
        indicatorCount: indicators.length,
        hasNext: !!nextBtn,
      }
    })

    console.log(`  Carousel nav: ${navInfo.indicatorCount} indicators, next button: ${navInfo.hasNext}`)

    // Desktop screenshots
    for (let i = 0; i < slides.length; i++) {
      // Navigate to slide
      await page.evaluate((idx) => {
        const indicators = document.querySelectorAll('.hero-banner-carousel .carousel-indicators button, .hero-banner-carousel .carousel-indicators li')
        if (indicators[idx]) {
          indicators[idx].click()
          return
        }
        // Try Bootstrap carousel API
        const carousel = document.querySelector('.hero-banner-carousel .carousel')
        if (carousel && typeof bootstrap !== 'undefined') {
          bootstrap.Carousel.getInstance(carousel)?.to(idx)
        }
      }, i)
      await new Promise(r => setTimeout(r, 1500))

      const heroEl = await page.$('.hero-banner-carousel')
      let screenshot
      if (heroEl) {
        screenshot = await heroEl.screenshot({ type: 'jpeg', quality: 90 })
      } else {
        screenshot = await page.screenshot({
          type: 'jpeg', quality: 90,
          clip: { x: 0, y: 0, width: 1920, height: 700 },
        })
      }

      const filename = `isuzu-homepage-slide-${i}-desktop.jpg`
      const desktopUrl = await uploadScreenshot(screenshot, filename)
      console.log(`    [${i}] "${(slides[i].headline || '?').substring(0, 40)}" → ${filename}`)

      banners.push({
        position: i,
        headline: slides[i].headline,
        sub_headline: slides[i].sub_headline,
        cta_text: slides[i].cta_text,
        cta_url: slides[i].cta_url ? (slides[i].cta_url.startsWith('/') ? BASE + slides[i].cta_url : slides[i].cta_url) : null,
        page_url: BASE + '/',
        desktop_url: desktopUrl,
        mobile_url: null,
      })
    }

    // Mobile screenshots
    console.log('\n  Capturing mobile screenshots...')
    await page.setViewport({ width: 390, height: 844 })
    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 })
    await new Promise(r => setTimeout(r, 4000))

    await page.evaluate(() => {
      const id = setInterval(() => {}, 99999)
      for (let i = 1; i <= id; i++) clearInterval(i)
    })

    for (let i = 0; i < banners.length; i++) {
      await page.evaluate((idx) => {
        const indicators = document.querySelectorAll('.hero-banner-carousel .carousel-indicators button, .hero-banner-carousel .carousel-indicators li')
        if (indicators[idx]) indicators[idx].click()
      }, i)
      await new Promise(r => setTimeout(r, 1500))

      const heroEl = await page.$('.hero-banner-carousel')
      let screenshot
      if (heroEl) {
        screenshot = await heroEl.screenshot({ type: 'jpeg', quality: 90 })
      } else {
        screenshot = await page.screenshot({
          type: 'jpeg', quality: 90,
          clip: { x: 0, y: 0, width: 390, height: 500 },
        })
      }

      const filename = `isuzu-homepage-slide-${i}-mobile.jpg`
      const mobileUrl = await uploadScreenshot(screenshot, filename)
      console.log(`    [${i}] mobile → ${filename}`)
      banners[i].mobile_url = mobileUrl
    }

    // ── Offers page ──
    console.log('\n  Fetching Isuzu offers page...')
    await page.setViewport({ width: 1920, height: 1080 })
    await page.goto(BASE + '/offers/current-offers', { waitUntil: 'networkidle2', timeout: 60000 })
    await new Promise(r => setTimeout(r, 3000))

    const offersHero = await page.$('.hero-banner-carousel')
    if (offersHero) {
      const screenshot = await offersHero.screenshot({ type: 'jpeg', quality: 90 })
      const desktopUrl = await uploadScreenshot(screenshot, 'isuzu-offers-desktop.jpg')
      console.log(`    Offers page hero captured`)

      // Mobile
      await page.setViewport({ width: 390, height: 844 })
      await page.goto(BASE + '/offers/current-offers', { waitUntil: 'networkidle2', timeout: 60000 })
      await new Promise(r => setTimeout(r, 3000))
      const offersHeroMobile = await page.$('.hero-banner-carousel')
      let mobileUrl = null
      if (offersHeroMobile) {
        const mScreenshot = await offersHeroMobile.screenshot({ type: 'jpeg', quality: 90 })
        mobileUrl = await uploadScreenshot(mScreenshot, 'isuzu-offers-mobile.jpg')
      }

      banners.push({
        position: 0,
        headline: 'Current Offers',
        page_url: BASE + '/offers/current-offers',
        desktop_url: desktopUrl,
        mobile_url: mobileUrl,
      })
    }

  } finally {
    await browser.close()
  }

  // Build final banner objects
  const finalBanners = banners.map(b => makeBanner(b.page_url, b.position, {
    desktop: b.desktop_url,
    mobile: b.mobile_url,
    headline: b.headline,
    sub_headline: b.sub_headline,
    cta_text: b.cta_text,
    cta_url: b.cta_url,
  }))

  const valid = finalBanners.filter(b => b.image_url_desktop || b.image_url_mobile)
  console.log(`\nValid Isuzu banners: ${valid.length}`)

  if (valid.length === 0) {
    console.log('No banners captured. Exiting.')
    return
  }

  console.log('\nClearing existing Isuzu banners...')
  await sb.from('banners').delete().eq('oem_id', OEM_ID)

  const { error } = await sb.from('banners').insert(valid)
  if (error) { console.error('Insert error:', error.message); return }

  console.log(`Inserted ${valid.length} Isuzu banners.`)
  const { count } = await sb.from('banners').select('*', { count: 'exact', head: true }).eq('oem_id', OEM_ID)
  console.log(`Isuzu banners in database: ${count}`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
