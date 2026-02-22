/**
 * Seed banners v2 — Focused on homepage hero sliders + offers page headers only.
 *
 * Per-OEM extractors using cheerio for HTML parsing.
 * Scope: front-page carousel slides + offers page header banners.
 *
 * Run: cd dashboard && node scripts/seed-banners-v2.mjs
 */
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import crypto from 'crypto'

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function fetchPage(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-AU,en;q=0.9',
    },
    redirect: 'follow',
  })
  if (!resp.ok && resp.status !== 403) return null
  const html = await resp.text()
  if (html.length < 500) return null
  return html
}

function abs(url, base) {
  if (!url) return null
  url = url.trim()
  if (url.startsWith('//')) return 'https:' + url
  if (url.startsWith('http')) return url
  if (url.startsWith('/')) return new URL(url, base).href
  return new URL(url, base).href
}

function uuid() {
  return crypto.randomUUID()
}

function banner(oem_id, page_url, position, data) {
  return {
    id: uuid(),
    oem_id,
    page_url,
    position,
    headline: data.headline || null,
    sub_headline: data.sub_headline || null,
    cta_text: data.cta_text || null,
    cta_url: data.cta_url ? abs(data.cta_url, page_url) : null,
    image_url_desktop: data.desktop ? abs(data.desktop, page_url) : null,
    image_url_mobile: data.mobile ? abs(data.mobile, page_url) : null,
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

// ── Per-OEM Extractors ───────────────────────────────────

async function extractIsuzu() {
  const banners = []
  const BASE = 'https://www.isuzuute.com.au'

  // Homepage hero carousel
  const homeHtml = await fetchPage(BASE + '/')
  if (homeHtml) {
    const $ = cheerio.load(homeHtml)
    $('.hero-banner-carousel .carousel-item').each((i, el) => {
      const $el = $(el)
      const picture = $el.find('picture')
      const desktop = picture.find('source[media*="min-width: 993"]').attr('srcset')?.split(' ')[0]
        || picture.find('source[media*="min-width"]').last().attr('srcset')?.split(' ')[0]
      const mobile = picture.find('source[media*="max-width: 767"]').attr('srcset')?.split(' ')[0]
      const headline = $el.find('.hero-carousel__heading, h1, h2').first().text().trim()
      const sub = $el.find('.hero-carousel__subtext, .hero-carousel__description, p').first().text().trim()
      const ctaEl = $el.find('.hero-carousel__cta a, a.btn').first()
      banners.push(banner('isuzu-au', BASE + '/', i, {
        desktop, mobile, headline,
        sub_headline: sub || null,
        cta_text: ctaEl.text().trim() || null,
        cta_url: ctaEl.attr('href') || null,
      }))
    })
  }

  // Offers page header
  const offersHtml = await fetchPage(BASE + '/offers/current-offers')
  if (offersHtml) {
    const $ = cheerio.load(offersHtml)
    const headerPic = $('.hero-banner-carousel .carousel-item').first().find('picture')
    if (headerPic.length) {
      const desktop = headerPic.find('source[media*="min-width: 993"]').attr('srcset')?.split(' ')[0]
        || headerPic.find('source[media*="min-width"]').last().attr('srcset')?.split(' ')[0]
      const mobile = headerPic.find('source[media*="max-width: 767"]').attr('srcset')?.split(' ')[0]
      const headline = $('.hero-carousel__heading, h1, h2').first().text().trim()
      banners.push(banner('isuzu-au', BASE + '/offers/current-offers', 0, {
        desktop, mobile, headline: headline || 'Current Offers',
      }))
    }
  }

  return banners
}

async function extractKia() {
  const banners = []
  const BASE = 'https://www.kia.com/au'

  // Homepage hero carousel — picture elements inside main hero
  const homeHtml = await fetchPage(BASE + '/main.html')
  if (homeHtml) {
    const $ = cheerio.load(homeHtml)
    // Kia uses .cmp-hero__visual with picture+video pairs
    $('picture').each((i, el) => {
      const $pic = $(el)
      // Only hero pictures — check parent context
      const parent = $pic.closest('.cmp-hero__visual, .cmp-hero, .hero-visual, [class*="hero"]')
      if (!parent.length && i > 10) return // Skip non-hero pictures

      const desktop = $pic.find('source[media*="min-width: 1024"]').attr('srcset')?.split(' ')[0]
        || $pic.find('source[media*="min-width: 768"]').attr('srcset')?.split(' ')[0]
      const mobile = $pic.find('source[media*="max-width"], source[media*="min-width: 320"]').attr('srcset')?.split(' ')[0]
      const img = $pic.find('img').attr('src')

      if (!desktop && !img) return

      // Get nearby text
      const heroSection = $pic.closest('[class*="hero"], .cmp-hero, section').first()
      const headline = heroSection.find('h1, h2, [class*="headline"], [class*="title"]').first().text().trim()
      const sub = heroSection.find('p, [class*="description"]').first().text().trim()
      const ctaEl = heroSection.find('a[class*="cta"], a.btn, a[class*="button"]').first()

      // Only keep first 4-6 hero slides
      if (banners.filter(b => b.page_url.includes('main.html')).length >= 6) return

      banners.push(banner('kia-au', BASE + '/main.html', banners.filter(b => b.page_url.includes('main.html')).length, {
        desktop: desktop || img, mobile,
        headline: headline || null,
        sub_headline: sub?.length > 5 ? sub : null,
        cta_text: ctaEl.text().trim() || null,
        cta_url: ctaEl.attr('href') || null,
      }))
    })

    // Also check for video heroes
    $('video').each((i, el) => {
      const $vid = $(el)
      const heroSection = $vid.closest('[class*="hero"], section').first()
      if (!heroSection.length) return
      const poster = $vid.attr('poster')
      const src = $vid.find('source').attr('src') || $vid.attr('src')
      if (!poster && !src) return
      // Skip if we already have too many
      if (banners.filter(b => b.page_url.includes('main.html')).length >= 6) return
    })
  }

  // Offers page header
  const offersHtml = await fetchPage(BASE + '/shopping-tools/offers/car-offers.html')
  if (offersHtml) {
    const $ = cheerio.load(offersHtml)
    // Look for the main header banner
    const heroPic = $('[class*="hero"] picture, .cmp-hero picture, .offer-banner picture').first()
    if (heroPic.length) {
      const desktop = heroPic.find('source[media*="min-width: 1024"]').attr('srcset')?.split(' ')[0]
        || heroPic.find('source[media*="min-width"]').last().attr('srcset')?.split(' ')[0]
      const mobile = heroPic.find('source[media*="max-width"], source[media*="min-width: 320"]').attr('srcset')?.split(' ')[0]
      const img = heroPic.find('img').attr('src')
      banners.push(banner('kia-au', BASE + '/shopping-tools/offers/car-offers.html', 0, {
        desktop: desktop || img, mobile,
        headline: 'Current Offers',
      }))
    }
  }

  return banners
}

async function extractFord() {
  const banners = []
  const BASE = 'https://www.ford.com.au'

  // Homepage hero carousel — billboard-item elements with img tags
  const homeHtml = await fetchPage(BASE + '/')
  if (homeHtml) {
    const $ = cheerio.load(homeHtml)
    $('.billboard-item').each((i, el) => {
      const $el = $(el)
      const imgs = $el.find('img')
      if (imgs.length === 0) return

      // Ford uses separate desktop/mobile img tags, identified by filename
      let desktop = null, mobile = null
      imgs.each((j, img) => {
        const src = $(img).attr('src')
        if (!src) return
        if (src.includes('-desktop')) desktop = src
        else if (src.includes('-mobile')) mobile = src
        else if (!desktop) desktop = src
      })

      if (!desktop) return

      const alt = imgs.first().attr('alt') || ''
      const ctaEl = $el.find('a').first()

      banners.push(banner('ford-au', BASE + '/', banners.length, {
        desktop, mobile,
        headline: alt || null,
        cta_url: ctaEl.attr('href') || null,
      }))
    })
  }

  // Offers page header
  const offersHtml = await fetchPage(BASE + '/latest-offers/')
  if (offersHtml) {
    const $ = cheerio.load(offersHtml)
    // Ford offers page also uses billboard-item
    const firstBillboard = $('.billboard-item').first()
    if (firstBillboard.length) {
      let desktop = null, mobile = null
      firstBillboard.find('img').each((j, img) => {
        const src = $(img).attr('src')
        if (!src) return
        if (src.includes('-desktop')) desktop = src
        else if (src.includes('-mobile')) mobile = src
        else if (!desktop) desktop = src
      })
      if (desktop) {
        banners.push(banner('ford-au', BASE + '/latest-offers/', 0, {
          desktop, mobile,
          headline: firstBillboard.find('img').first().attr('alt') || 'Latest Offers',
        }))
      }
    }
  }

  return banners
}

async function extractNissan() {
  const banners = []
  const BASE = 'https://www.nissan.com.au'

  // Homepage hero carousel
  const homeHtml = await fetchPage(BASE + '/')
  if (homeHtml) {
    const $ = cheerio.load(homeHtml)
    // Nissan uses .hero-carousel with .carousel-slide items
    $('.hero-carousel .carousel-slide, .hero.homepage-hero .carousel-slide').each((i, el) => {
      const $el = $(el)
      if ($el.hasClass('hidden') && i > 0) return // Skip hidden duplicates but keep first

      const picture = $el.find('picture').first()
      const desktop = picture.find('source[media*="60.0em"]').attr('srcset')?.split(' ')[0]
        || picture.find('source').first().attr('srcset')?.split(' ')[0]
      const mobile = picture.find('source[media*="1.0em"]').attr('srcset')?.split(' ')[0]
        || picture.find('source').last().attr('srcset')?.split(' ')[0]
      const img = picture.find('img').attr('src')

      if (!desktop && !img) return

      const headline = $el.find('h1, h2, .heading, [class*="heading"]').first().text().trim()
      const sub = $el.find('p, .description, [class*="description"]').first().text().trim()
      const ctaEl = $el.find('a.cta, a[class*="cta"], a.btn').first()

      banners.push(banner('nissan-au', BASE + '/', i, {
        desktop: desktop || img, mobile: mobile !== desktop ? mobile : null,
        headline: headline || null,
        sub_headline: sub?.length > 3 ? sub : null,
        cta_text: ctaEl.text().trim() || null,
        cta_url: ctaEl.attr('href') || null,
      }))
    })
  }

  // Offers page header — look for the editorial hero, not the model tiles
  const offersHtml = await fetchPage(BASE + '/offers.html')
  if (offersHtml) {
    const $ = cheerio.load(offersHtml)
    // Only get the first editorial hero banner, NOT the model offer tiles
    const heroSection = $('.editorialHero, .editorialhero, [class*="editorialHero"]').first()
    if (heroSection.length) {
      const picture = heroSection.find('picture').first()
      const desktop = picture.find('source[media*="60.0em"]').attr('srcset')?.split(' ')[0]
        || picture.find('source').first().attr('srcset')?.split(' ')[0]
      const mobile = picture.find('source[media*="1.0em"]').attr('srcset')?.split(' ')[0]
      const img = picture.find('img').attr('src')
      const headline = heroSection.find('h1, h2, [class*="heading"]').first().text().trim()
      banners.push(banner('nissan-au', BASE + '/offers.html', 0, {
        desktop: desktop || img, mobile: mobile !== desktop ? mobile : null,
        headline: headline || 'Current Offers',
      }))
    }
  }

  return banners
}

async function extractHyundai() {
  // Hyundai hero images are loaded client-side (JS background toggle)
  // Server HTML has the hero container but no image URLs
  // Will need browser session — return empty for now
  console.log('  Hyundai hero is client-side rendered — needs browser session')
  return []
}

async function extractGwm() {
  const banners = []
  const BASE = 'https://www.gwmanz.com'

  // GWM uses Storyblok — we can get carousel data from the API
  const token = 'rII785g9nG3hemzhYNQvQwtt'
  const headers = {
    'Origin': BASE,
    'Referer': BASE + '/',
  }

  // Homepage hero carousel from Storyblok
  try {
    const resp = await fetch(
      `https://api.storyblok.com/v2/cdn/stories/au?token=${token}&version=published`,
      { headers }
    )
    const data = await resp.json()
    const body = data.story?.content?.body || []

    // Find hero/carousel blocks
    for (const block of body) {
      if (block.component === 'hero' || block.component === 'heroCarousel' || block.component === 'carousel') {
        const slides = block.slides || block.items || [block]
        for (let i = 0; i < slides.length; i++) {
          const slide = slides[i]
          const desktop = slide.image?.filename || slide.desktop_image?.filename || slide.background_image?.filename
          const mobile = slide.mobile_image?.filename
          if (!desktop) continue
          banners.push(banner('gwm-au', BASE + '/au/', i, {
            desktop, mobile,
            headline: slide.heading || slide.title || null,
            sub_headline: slide.subheading || slide.description || null,
            cta_text: slide.cta_text || slide.button_text || null,
            cta_url: slide.cta_link?.url || slide.button_link?.cached_url || null,
          }))
        }
      }
    }
  } catch (e) {
    console.log(`  GWM Storyblok API error: ${e.message}`)
  }

  // If Storyblok didn't give us the carousel, fall back to HTML parsing
  if (banners.filter(b => b.page_url.includes('/au/')).length === 0) {
    const homeHtml = await fetchPage(BASE + '/au/')
    if (homeHtml) {
      const $ = cheerio.load(homeHtml)
      // Swiper slides in the hero section
      $('.swiper-slide.swiper__item').each((i, el) => {
        const $el = $(el)
        const picture = $el.find('picture').first()
        const desktop = picture.find('source[media*="min-width"]').attr('srcset')?.split(' ')[0]
          || picture.find('img').attr('src')
          || $el.find('img').first().attr('src')
        const mobile = picture.find('source[media*="max-width"]').attr('srcset')?.split(' ')[0]

        if (!desktop) return

        const headline = $el.find('h1, h2, [class*="heading"]').first().text().trim()
        const sub = $el.find('[class*="sub-heading"], p').first().text().trim()
        const ctaEl = $el.find('a[class*="cta"], a.btn').first()

        banners.push(banner('gwm-au', BASE + '/au/', i, {
          desktop, mobile,
          headline: headline || null,
          sub_headline: sub?.length > 3 ? sub : null,
          cta_text: ctaEl.text().trim() || null,
          cta_url: ctaEl.attr('href') || null,
        }))
      })
    }
  }

  // Offers page
  const offersHtml = await fetchPage(BASE + '/au/offers/')
  if (offersHtml) {
    const $ = cheerio.load(offersHtml)
    const heroPic = $('.hero picture, [class*="hero"] picture').first()
    if (heroPic.length) {
      const desktop = heroPic.find('source[media*="min-width"]').attr('srcset')?.split(' ')[0]
        || heroPic.find('img').attr('src')
      const mobile = heroPic.find('source[media*="max-width"]').attr('srcset')?.split(' ')[0]
      const headline = $('.hero h1, .hero h2, [class*="hero"] h1').first().text().trim()
      banners.push(banner('gwm-au', BASE + '/au/offers/', 0, {
        desktop, mobile,
        headline: headline || 'Current Offers',
      }))
    }
  }

  return banners
}

async function extractKgm() {
  const banners = []
  const BASE = 'https://www.kgm.com.au'

  // KGM uses carousel-banner with background-image divs (desktop/mobile pairs)
  // and text overlay images with descriptive alt text
  const homeHtml = await fetchPage(BASE + '/')
  if (homeHtml) {
    const $ = cheerio.load(homeHtml)
    const cb = $('[class*="carousel-banner"]').first()
    if (cb.length) {
      // Extract background-image URLs from style attributes
      const bgDivs = cb.find('[style*="background-image"]')
      const seen = new Set()
      let pos = 0

      bgDivs.each((i, el) => {
        const style = $(el).attr('style') || ''
        const urlMatch = style.match(/background-image:\s*url\(([^)]+)\)/)
        if (!urlMatch) return
        const url = urlMatch[1].replace(/['"]/g, '')
        if (!url.includes('-desktop')) return // Only process desktop variants
        if (seen.has(url)) return
        seen.add(url)

        const mobileUrl = url.replace('-desktop', '-mobile')
        // Find the corresponding text overlay img (adjacent img with alt text)
        // KGM has text overlay images alongside background images
        // Extract slide name from filename: KGM-Jan26Offers-background-desktop-{model}.webp
        const modelMatch = url.match(/desktop-([^.]+)\.webp/)
        const modelSlug = modelMatch ? modelMatch[1] : null

        // Find text img for this model
        let headline = null
        if (modelSlug) {
          const textImg = cb.find(`img[src*="${modelSlug}"]`).first()
          headline = textImg.attr('alt') || null
        }

        banners.push(banner('kgm-au', BASE + '/', pos++, {
          desktop: url,
          mobile: mobileUrl,
          headline,
        }))
      })
    }
  }

  // Offers page (same carousel structure)
  const offersHtml = await fetchPage(BASE + '/offers')
  if (offersHtml) {
    const $ = cheerio.load(offersHtml)
    const cb = $('[class*="carousel-banner"]').first()
    if (cb.length) {
      const bgDiv = cb.find('[style*="background-image"]').first()
      const style = bgDiv.attr('style') || ''
      const urlMatch = style.match(/background-image:\s*url\(([^)]+)\)/)
      if (urlMatch) {
        const desktop = urlMatch[1].replace(/['"]/g, '')
        const mobile = desktop.replace('-desktop', '-mobile')
        banners.push(banner('kgm-au', BASE + '/offers', 0, {
          desktop, mobile,
          headline: 'Current Offers',
        }))
      }
    }
  }

  return banners
}

async function extractMitsubishi() {
  const banners = []
  const BASE = 'https://www.mitsubishi-motors.com.au'

  // Mitsubishi homepage has a notification banner and vehicle carousel (no hero slider)
  // Skip homepage — the "alert.png" is just an icon notification banner
  // Only extract offers page
  const homeHtml = await fetchPage(BASE + '/')
  if (homeHtml) {
    const $ = cheerio.load(homeHtml)
    // Check for any actual hero/billboard picture elements (not notification icons)
    $('picture').each((i, el) => {
      const $pic = $(el)
      const desktop = $pic.find('source').last().attr('srcset')?.split(' ')[0]
      const img = $pic.find('img').attr('src')
      const src = desktop || img || ''
      // Skip icons, logos, build-and-price thumbnails, notification banners
      if (src.includes('alert') || src.includes('logo') || src.includes('icon')
        || src.includes('build-and-price') || src.includes('dnd-')) return
      // Must be a reasonable hero-sized image
      if (src.includes('hero') || src.includes('banner') || src.includes('1920') || src.includes('billboard')) {
        const parent = $pic.closest('section, [class*="billboard"], [class*="hero"]')
        const headline = parent.find('h1, h2').first().text().trim()
        if (banners.filter(b => b.page_url === BASE + '/').length >= 3) return
        banners.push(banner('mitsubishi-au', BASE + '/', banners.length, {
          desktop: src, headline: headline || null,
        }))
      }
    })
  }

  // Offers page
  const offersHtml = await fetchPage(BASE + '/offers.html')
  if (offersHtml) {
    const $ = cheerio.load(offersHtml)
    // Look for the header hero image
    $('picture').each((i, el) => {
      if (banners.filter(b => b.page_url.includes('offers')).length >= 1) return
      const $pic = $(el)
      const desktop = $pic.find('source').last().attr('srcset')?.split(' ')[0]
      const img = $pic.find('img').attr('src')
      const src = desktop || img || ''
      if (src.includes('alert') || src.includes('logo') || src.includes('icon')
        || src.includes('build-and-price') || src.includes('dnd-')) return
      // Get the first significant picture
      if (src.includes('offer') || src.includes('hero') || src.includes('banner')) {
        banners.push(banner('mitsubishi-au', BASE + '/offers.html', 0, {
          desktop: src, headline: 'Current Offers',
        }))
      }
    })
    // Fallback: first large image
    if (banners.filter(b => b.page_url.includes('offers')).length === 0) {
      const heroImg = $('img[src*="offer"], img[src*="hero"], img[src*="banner"]').first()
      if (heroImg.length) {
        banners.push(banner('mitsubishi-au', BASE + '/offers.html', 0, {
          desktop: heroImg.attr('src'), headline: 'Current Offers',
        }))
      }
    }
  }

  return banners
}

async function extractMazda() {
  const banners = []
  const BASE = 'https://www.mazda.com.au'

  const homeHtml = await fetchPage(BASE + '/')
  if (homeHtml) {
    const $ = cheerio.load(homeHtml)
    // Mazda uses .Hero class with .Glider carousel
    $('[class*="Hero"] img, .hero img, [class*="Glider"] img').each((i, el) => {
      const src = $(el).attr('src')
      if (!src) return
      // Skip small icons/logos
      if (src.includes('logo') || src.includes('icon') || src.includes('svg')) return

      const parent = $(el).closest('[class*="Hero"], [class*="Glider"], section').first()
      const headline = parent.find('h1, h2, [class*="Heading"], [class*="Title"]').first().text().trim()
      const ctaEl = parent.find('a[class*="Cta"], a[class*="Button"], a.btn').first()

      if (banners.filter(b => b.page_url === BASE + '/').length >= 5) return

      banners.push(banner('mazda-au', BASE + '/', banners.filter(b => b.page_url === BASE + '/').length, {
        desktop: src,
        headline: headline || null,
        cta_text: ctaEl.text().trim() || null,
        cta_url: ctaEl.attr('href') || null,
      }))
    })
  }

  return banners
}

async function extractSubaru() {
  // Subaru carousel is React client-side rendered (react-multi-carousel)
  // Server HTML has carousel container but 0 items — images loaded via JS
  // Will need browser session — return empty for now
  console.log('  Subaru carousel is client-side rendered — needs browser session')
  return []
}

async function extractSuzuki() {
  const banners = []
  const BASE = 'https://www.suzuki.com.au'

  const homeHtml = await fetchPage(BASE + '/')
  if (homeHtml) {
    const $ = cheerio.load(homeHtml)
    // Suzuki homepage is a full-screen video with desktop/mobile sources
    $('video').each((i, el) => {
      const $vid = $(el)
      let desktopSrc = null, mobileSrc = null
      $vid.find('source').each((j, src) => {
        const s = $(src).attr('src')
        if (!s) return
        if (s.includes('desktop')) desktopSrc = s
        else if (s.includes('mobile')) mobileSrc = s
        else if (!desktopSrc) desktopSrc = s
      })
      const poster = $vid.attr('poster')

      if (!desktopSrc && !poster) return

      banners.push(banner('suzuki-au', BASE + '/', i, {
        desktop: poster || abs(desktopSrc, BASE),
        mobile: mobileSrc ? abs(mobileSrc, BASE) : null,
        headline: 'Suzuki Australia',
        // Store video URL in sub_headline for reference
        sub_headline: desktopSrc ? `Video: ${abs(desktopSrc, BASE)}` : null,
      }))
    })
  }

  return banners
}

async function extractVW() {
  const banners = []
  const BASE = 'https://www.volkswagen.com.au'

  const homeHtml = await fetchPage(BASE + '/en.html')
  if (homeHtml) {
    const $ = cheerio.load(homeHtml)
    // VW uses ContentSlider with picture elements using aspect-ratio media queries
    // Only get pictures with real srcset URLs (not data: SVG placeholders)
    const seen = new Set()
    $('picture').each((i, el) => {
      const $pic = $(el)
      const sources = $pic.find('source')
      // Find real (non-data:) srcset
      let desktop = null, mobile = null
      sources.each((j, src) => {
        const srcset = $(src).attr('srcset') || $(src).attr('srcSet') || ''
        const media = $(src).attr('media') || ''
        if (srcset.startsWith('data:')) return
        if (media.includes('min-aspect-ratio')) desktop = srcset.split(' ')[0]
        else if (media.includes('max-aspect-ratio')) mobile = srcset.split(' ')[0]
        else if (!desktop) desktop = srcset.split(' ')[0]
      })

      if (!desktop) return
      if (desktop.includes('logo') || desktop.includes('icon')) return
      if (seen.has(desktop)) return
      seen.add(desktop)

      const img = $pic.find('img')
      const alt = img.attr('alt') || ''

      if (banners.filter(b => b.page_url.includes('en.html')).length >= 5) return

      banners.push(banner('volkswagen-au', BASE + '/en.html', banners.filter(b => b.page_url.includes('en.html')).length, {
        desktop, mobile,
        headline: alt || null,
      }))
    })

    // Video hero
    $('video').each((i, el) => {
      const $vid = $(el)
      const src = $vid.find('source').attr('src') || $vid.attr('src')
      const poster = $vid.attr('poster')
      if (!src && !poster) return
      if (banners.filter(b => b.page_url.includes('en.html')).length >= 5) return
      const parent = $vid.closest('[class*="ContentSlider"], section').first()
      const alt = parent.find('img').first().attr('alt') || ''
      banners.push(banner('volkswagen-au', BASE + '/en.html', banners.filter(b => b.page_url.includes('en.html')).length, {
        desktop: poster || null,
        headline: alt || null,
        sub_headline: src ? `Video: ${abs(src, BASE)}` : null,
      }))
    })
  }

  return banners
}

async function extractLdv() {
  // LDV seems to be down/placeholder — try anyway
  const banners = []
  const BASE = 'https://www.ldv.com.au'

  const homeHtml = await fetchPage(BASE + '/')
  if (homeHtml && homeHtml.length > 1000) {
    const $ = cheerio.load(homeHtml)
    $('[class*="hero"] picture, [class*="slider"] picture, [class*="banner"] picture').each((i, el) => {
      const $pic = $(el)
      const desktop = $pic.find('source[media*="min-width"]').last().attr('srcset')?.split(' ')[0]
        || $pic.find('source').last().attr('srcset')?.split(' ')[0]
      const mobile = $pic.find('source[media*="max-width"]').first().attr('srcset')?.split(' ')[0]
      const img = $pic.find('img').attr('src')
      if (!desktop && !img) return

      banners.push(banner('ldv-au', BASE + '/', i, {
        desktop: desktop || img, mobile,
        headline: $pic.find('img').attr('alt') || null,
      }))
    })
  } else {
    console.log('  LDV site appears to be down/placeholder — skipping')
  }

  return banners
}

async function extractToyota() {
  // Toyota is Cloudflare-protected — needs browser session
  // Return empty — will be supplemented via Chrome MCP
  console.log('  Toyota requires browser session (Cloudflare) — skipping for now')
  return []
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  console.log('=== Banner Seed v2 ===\n')
  console.log('Scope: Homepage hero sliders + Offers page headers only\n')

  // Delete all existing banners
  const { count: existing } = await sb.from('banners').select('*', { count: 'exact', head: true })
  console.log(`Existing banners: ${existing}`)
  const { error: delErr } = await sb.from('banners').delete().gte('created_at', '2000-01-01')
  if (delErr) { console.error('Delete error:', delErr.message); process.exit(1) }
  console.log('Deleted all existing banners\n')

  const extractors = [
    { name: 'Isuzu', fn: extractIsuzu },
    { name: 'Kia', fn: extractKia },
    { name: 'Ford', fn: extractFord },
    { name: 'Nissan', fn: extractNissan },
    { name: 'Hyundai', fn: extractHyundai },
    { name: 'GWM', fn: extractGwm },
    { name: 'KGM', fn: extractKgm },
    { name: 'Mitsubishi', fn: extractMitsubishi },
    { name: 'Mazda', fn: extractMazda },
    { name: 'Subaru', fn: extractSubaru },
    { name: 'Suzuki', fn: extractSuzuki },
    { name: 'VW', fn: extractVW },
    { name: 'LDV', fn: extractLdv },
    { name: 'Toyota', fn: extractToyota },
  ]

  const allBanners = []

  for (const { name, fn } of extractors) {
    console.log(`--- ${name} ---`)
    try {
      const result = await fn()
      // Filter out banners without any image
      const valid = result.filter(b => b.image_url_desktop || b.image_url_mobile)
      console.log(`  Extracted: ${valid.length} banners (${result.length - valid.length} skipped - no image)`)
      for (const b of valid) {
        const imgFile = (b.image_url_desktop || '').split('/').pop()?.substring(0, 50) || '(mobile only)'
        console.log(`    [${b.position}] "${b.headline || '(no text)'}" | ${imgFile}`)
      }
      allBanners.push(...valid)
    } catch (e) {
      console.error(`  ERROR: ${e.message}`)
    }
  }

  console.log(`\n--- Inserting ${allBanners.length} banners ---`)

  // Insert in batches of 50
  for (let i = 0; i < allBanners.length; i += 50) {
    const batch = allBanners.slice(i, i + 50)
    const { error } = await sb.from('banners').insert(batch)
    if (error) {
      console.error(`Insert error at batch ${i}: ${error.message}`)
    }
  }

  // Final stats
  const { count: total } = await sb.from('banners').select('*', { count: 'exact', head: true })
  console.log(`\nDone! ${total} banners in database`)

  // Summary by OEM
  const { data: summary } = await sb.from('banners').select('oem_id')
  const byCounts = {}
  for (const b of summary || []) {
    byCounts[b.oem_id] = (byCounts[b.oem_id] || 0) + 1
  }
  console.log('\nBy OEM:')
  for (const [oem, count] of Object.entries(byCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${oem}: ${count}`)
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
