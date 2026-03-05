/**
 * Seed KGM (SsangYong) banners from kgm.com.au using Puppeteer.
 *
 * KGM's homepage carousel uses layered images (background + text overlay + disclaimer).
 * Since Payload CMS file storage is intermittently broken, we use Puppeteer to
 * screenshot each carousel slide as a flat composited JPEG and upload to Supabase Storage.
 *
 * Run: cd dashboard && node scripts/seed-kgm-banners.mjs
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import puppeteer from 'puppeteer'

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'kgm-au'
const BASE = 'https://www.kgm.com.au'
const BUCKET = 'banners'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
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
    console.log(`Creating storage bucket: ${BUCKET}`)
    const { error } = await sb.storage.createBucket(BUCKET, { public: true })
    if (error && !error.message.includes('already exists')) {
      throw new Error(`Failed to create bucket: ${error.message}`)
    }
  }
}

async function uploadScreenshot(buffer, filename) {
  const storagePath = `kgm/${filename}`
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  const { data } = sb.storage.from(BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

/**
 * Extract per-slide metadata from the DOM.
 * Returns model name, disclaimer, and link for each background-image slide.
 */
async function extractSlideMetadata(page) {
  return page.evaluate((baseUrl) => {
    const results = []
    const bgDivs = document.querySelectorAll('[style*="background-image"]')
    const seenUrls = new Set()

    bgDivs.forEach(div => {
      const style = div.style.backgroundImage || div.getAttribute('style') || ''
      const match = style.match(/url\(["']?([^"')]+)["']?\)/)
      if (!match) return
      const url = match[1]
      if (!url.includes('-desktop')) return
      if (seenUrls.has(url)) return
      seenUrls.add(url)

      // Extract model slug from filename: KGM-Jan26Offers-background-desktop-{model}.webp
      const modelMatch = url.match(/desktop-([^.]+)\.webp/)
      const modelSlug = modelMatch ? modelMatch[1] : null

      // Format model name from slug
      let modelName = null
      if (modelSlug) {
        modelName = modelSlug
          .replace(/-/g, ' ')
          .replace(/\bmy\d+\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/\b\w/g, c => c.toUpperCase())
      }

      // Find the parent slide/container
      const slide = div.closest('[class*="slide"], [class*="carousel-item"], [data-index]') || div.parentElement

      // Find text overlay alt text (may have pricing info)
      let textAlt = null
      if (slide && modelSlug) {
        const textImg = slide.querySelector(`img[src*="${modelSlug}"]`) || slide.querySelector('img[src*="text"]')
        if (textImg) textAlt = textImg.alt || null
      }

      // Find disclaimer
      let disclaimer = null
      if (slide) {
        const disclaimerEl = slide.querySelector(
          '[class*="disclaimer"], [class*="legal"], .text-xs, .text-\\[10px\\], p:last-child'
        )
        if (disclaimerEl) {
          const text = disclaimerEl.textContent.trim()
          if (text.length > 20) disclaimer = text
        }
      }

      // Find link
      let link = null
      if (slide) {
        const linkEl = slide.querySelector('a[href*="/models/"]')
        if (linkEl) link = linkEl.getAttribute('href')
      }

      // Headline: use text overlay alt if it has real content, otherwise use model name
      let headline = null
      if (textAlt && textAlt !== 'Offer' && textAlt.length > 3) {
        headline = textAlt
      } else {
        headline = modelName ? `KGM ${modelName}` : null
      }

      results.push({
        bgUrl: url,
        modelSlug,
        modelName,
        headline,
        textAlt,
        disclaimer,
        link,
      })
    })

    return results
  }, BASE)
}

async function main() {
  console.log('\n=== KGM Banner Seed (Puppeteer + Screenshots) ===\n')

  await ensureBucket()

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const bannerData = []

  try {
    const page = await browser.newPage()
    await page.setUserAgent(UA)

    // ── DESKTOP ──
    await page.setViewport({ width: 1920, height: 1080 })
    console.log('Navigating to KGM homepage (desktop)...')
    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 })
    await new Promise(r => setTimeout(r, 5000)) // Wait for carousel init

    // Stop autoplay by removing interval timers
    await page.evaluate(() => {
      // Override setInterval to capture and clear any autoplay timers
      const id = setInterval(() => {}, 10000)
      for (let i = 1; i <= id; i++) clearInterval(i)
    })

    const slides = await extractSlideMetadata(page)
    console.log(`  Found ${slides.length} carousel slides\n`)

    for (const s of slides) {
      console.log(`  - ${s.headline || s.modelSlug || '?'} | link: ${s.link || 'none'} | disclaimer: ${s.disclaimer ? 'yes' : 'no'}`)
    }

    // Find the carousel dots/indicators
    const dotSelector = await page.evaluate(() => {
      const candidates = [
        '.flickity-page-dots .dot',
        '.carousel-dots button',
        '[class*="dot"]',
        '[class*="indicator"] button',
        'button[aria-label*="slide"]',
        'button[aria-label*="Go to"]',
        '.slick-dots button',
      ]
      for (const sel of candidates) {
        const els = document.querySelectorAll(sel)
        if (els.length >= 2) return { selector: sel, count: els.length }
      }
      return null
    })

    console.log(`\n  Carousel dots: ${dotSelector ? dotSelector.selector + ' (' + dotSelector.count + ')' : 'none found'}`)

    // Screenshot each slide — desktop
    console.log('\n  Capturing desktop screenshots...')
    for (let i = 0; i < slides.length; i++) {
      // Click the correct dot to navigate
      if (dotSelector) {
        await page.evaluate((sel, idx) => {
          const dots = document.querySelectorAll(sel)
          if (dots[idx]) dots[idx].click()
        }, dotSelector.selector, i)
      }
      await new Promise(r => setTimeout(r, 2000)) // Wait for slide transition

      // Screenshot the carousel area
      const carouselEl = await page.$('[class*="carousel-banner"]')
        || await page.$('[class*="hero-carousel"]')
        || await page.$('[class*="hero"]')

      let screenshot
      if (carouselEl) {
        screenshot = await carouselEl.screenshot({ type: 'jpeg', quality: 90 })
      } else {
        screenshot = await page.screenshot({
          type: 'jpeg', quality: 90,
          clip: { x: 0, y: 0, width: 1920, height: 800 },
        })
      }

      const filename = `kgm-slide-${i}-desktop.jpg`
      const publicUrl = await uploadScreenshot(screenshot, filename)
      console.log(`    [${i}] ${(slides[i].headline || slides[i].modelSlug || '?').substring(0, 40)} → ${filename}`)

      bannerData.push({
        position: i,
        headline: slides[i].headline,
        sub_headline: slides[i].disclaimer,
        link: slides[i].link,
        desktop_url: publicUrl,
        mobile_url: null,
      })
    }

    // ── MOBILE ──
    console.log('\n  Capturing mobile screenshots...')
    await page.setViewport({ width: 390, height: 844 })
    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 })
    await new Promise(r => setTimeout(r, 5000))

    // Stop autoplay again
    await page.evaluate(() => {
      const id = setInterval(() => {}, 10000)
      for (let i = 1; i <= id; i++) clearInterval(i)
    })

    for (let i = 0; i < bannerData.length; i++) {
      if (dotSelector) {
        await page.evaluate((sel, idx) => {
          const dots = document.querySelectorAll(sel)
          if (dots[idx]) dots[idx].click()
        }, dotSelector.selector, i)
      }
      await new Promise(r => setTimeout(r, 2000))

      const carouselEl = await page.$('[class*="carousel-banner"]')
        || await page.$('[class*="hero-carousel"]')
        || await page.$('[class*="hero"]')

      let screenshot
      if (carouselEl) {
        screenshot = await carouselEl.screenshot({ type: 'jpeg', quality: 90 })
      } else {
        screenshot = await page.screenshot({
          type: 'jpeg', quality: 90,
          clip: { x: 0, y: 0, width: 390, height: 600 },
        })
      }

      const filename = `kgm-slide-${i}-mobile.jpg`
      const publicUrl = await uploadScreenshot(screenshot, filename)
      console.log(`    [${i}] mobile → ${filename}`)
      bannerData[i].mobile_url = publicUrl
    }

  } finally {
    await browser.close()
  }

  // Build final banner objects
  const finalBanners = bannerData.map(b => makeBanner(BASE + '/', b.position, {
    desktop: b.desktop_url,
    mobile: b.mobile_url,
    headline: b.headline,
    sub_headline: b.sub_headline,
    cta_text: b.link ? 'View Model' : null,
    cta_url: b.link ? BASE + b.link : null,
  }))

  const valid = finalBanners.filter(b => b.image_url_desktop || b.image_url_mobile)

  console.log(`\n=== Final KGM banners: ${valid.length} ===\n`)
  for (const b of valid) {
    console.log(`  [${b.position}] "${b.headline || '(no headline)'}"`)
    if (b.sub_headline) console.log(`    Disclaimer: ${b.sub_headline.substring(0, 80)}...`)
  }

  if (valid.length === 0) {
    console.log('No banners captured. Exiting.')
    return
  }

  // Delete existing KGM banners
  console.log('\nClearing existing KGM banners...')
  const { error: delErr } = await sb.from('banners').delete().eq('oem_id', OEM_ID)
  if (delErr) { console.error('Delete error:', delErr.message); return }

  const { error: insErr } = await sb.from('banners').insert(valid)
  if (insErr) { console.error('Insert error:', insErr.message); return }

  console.log(`Inserted ${valid.length} KGM banners.`)
  const { count } = await sb.from('banners').select('*', { count: 'exact', head: true }).eq('oem_id', OEM_ID)
  console.log(`KGM banners in database: ${count}`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
