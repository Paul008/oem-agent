/**
 * Seed banners from OEM homepages and offers pages.
 * Fetches HTML, extracts hero/banner data, inserts into `banners` table.
 *
 * Run: cd dashboard && node scripts/seed-banners.mjs
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const TIMEOUT = 15000
const DELAY = 1200

// ── OEM page definitions ──

const OEM_PAGES = [
  // Toyota — Next.js, __NEXT_DATA__ has HomepageBannerJSSAdapter
  { oem: 'toyota-au', type: 'homepage', url: 'https://www.toyota.com.au', extract: 'nextjs' },
  { oem: 'toyota-au', type: 'offers', url: 'https://www.toyota.com.au/current-offers', extract: 'dom' },

  // Hyundai — AEM/Swiper, background-image in swiper slides
  { oem: 'hyundai-au', type: 'homepage', url: 'https://www.hyundai.com/au/en', extract: 'html' },
  { oem: 'hyundai-au', type: 'offers', url: 'https://www.hyundai.com/au/en/offers', extract: 'html' },

  // Ford — AEM billboard carousel
  { oem: 'ford-au', type: 'homepage', url: 'https://www.ford.com.au', extract: 'html' },
  { oem: 'ford-au', type: 'offers', url: 'https://www.ford.com.au/latest-offers/', extract: 'html' },

  // Kia — AEM, picture elements in hero
  { oem: 'kia-au', type: 'homepage', url: 'https://www.kia.com/au', extract: 'html' },
  { oem: 'kia-au', type: 'offers', url: 'https://www.kia.com/au/shopping-tools/offers/car-offers.html', extract: 'html' },

  // Nissan — Sitecore
  { oem: 'nissan-au', type: 'homepage', url: 'https://www.nissan.com.au', extract: 'html' },
  { oem: 'nissan-au', type: 'offers', url: 'https://www.nissan.com.au/offers.html', extract: 'html' },

  // Mazda — React hydration
  { oem: 'mazda-au', type: 'homepage', url: 'https://www.mazda.com.au', extract: 'html' },
  { oem: 'mazda-au', type: 'offers', url: 'https://www.mazda.com.au/offers/', extract: 'html' },

  // Mitsubishi — standard HTML
  { oem: 'mitsubishi-au', type: 'homepage', url: 'https://www.mitsubishi-motors.com.au', extract: 'html' },
  { oem: 'mitsubishi-au', type: 'offers', url: 'https://www.mitsubishi-motors.com.au/offers', extract: 'html' },

  // Subaru — standard HTML
  { oem: 'subaru-au', type: 'homepage', url: 'https://www.subaru.com.au', extract: 'html' },
  { oem: 'subaru-au', type: 'offers', url: 'https://www.subaru.com.au/offers', extract: 'html' },

  // Suzuki — standard HTML
  { oem: 'suzuki-au', type: 'homepage', url: 'https://www.suzuki.com.au', extract: 'html' },
  { oem: 'suzuki-au', type: 'offers', url: 'https://www.suzuki.com.au/offers', extract: 'html' },

  // GWM — Storyblok/Vue
  { oem: 'gwm-au', type: 'homepage', url: 'https://www.gwmanz.com', extract: 'html' },
  { oem: 'gwm-au', type: 'offers', url: 'https://www.gwmanz.com/au/offers', extract: 'html' },

  // Isuzu — Sitecore
  { oem: 'isuzu-au', type: 'homepage', url: 'https://www.isuzuute.com.au', extract: 'html' },
  { oem: 'isuzu-au', type: 'offers', url: 'https://www.isuzuute.com.au/offers', extract: 'html' },

  // VW — Nuxt 3
  { oem: 'volkswagen-au', type: 'homepage', url: 'https://www.volkswagen.com.au', extract: 'html' },
  { oem: 'volkswagen-au', type: 'offers', url: 'https://www.volkswagen.com.au/en/offers.html', extract: 'html' },

  // LDV — standard HTML
  { oem: 'ldv-au', type: 'homepage', url: 'https://www.ldvautomotive.com.au', extract: 'html' },
  { oem: 'ldv-au', type: 'offers', url: 'https://www.ldvautomotive.com.au/offers', extract: 'html' },

  // KGM — Payload CMS / Next.js
  { oem: 'kgm-au', type: 'homepage', url: 'https://www.kgm.com.au', extract: 'html' },
  { oem: 'kgm-au', type: 'offers', url: 'https://www.kgm.com.au/offers', extract: 'html' },
]

// ── Helpers ──

function cleanUrl(url, baseUrl) {
  if (!url) return null
  url = url.trim()
  if (url.startsWith('data:')) return null
  if (url.startsWith('//')) url = 'https:' + url
  if (url.startsWith('/')) {
    try { url = new URL(baseUrl).origin + url } catch {}
  }
  try { const u = new URL(url); return u.origin + u.pathname }
  catch { return url.split('?')[0] }
}

async function fetchPage(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-AU,en;q=0.9' },
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return { ok: false, status: res.status, html: '' }
    return { ok: true, status: res.status, finalUrl: res.url, html: await res.text() }
  } catch (e) {
    clearTimeout(timer)
    return { ok: false, status: 0, error: e.message, html: '' }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Extractors ──

function extractFromHtml(html, baseUrl) {
  const banners = []

  // 1. OG meta as fallback hero banner
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)

  // 2. <picture> elements — most reliable hero images
  const picRe = /<picture[^>]*>([\s\S]*?)<\/picture>/gi
  let pm, pos = 0
  while ((pm = picRe.exec(html)) !== null && pos < 10) {
    const ph = pm[1]
    const sources = []
    const srcRe = /<source[^>]+srcset=["']([^"']+)["'][^>]*/gi
    let sm
    while ((sm = srcRe.exec(ph)) !== null) {
      const mediaM = sm[0].match(/media=["']([^"']+)["']/i)
      sources.push({ srcset: cleanUrl(sm[1].split(',')[0].trim().split(' ')[0], baseUrl), media: mediaM?.[1] })
    }
    const imgM = ph.match(/<img[^>]+src=["']([^"']+)["']/i)
    const altM = ph.match(/<img[^>]+alt=["']([^"']*?)["']/i)
    const src = imgM ? cleanUrl(imgM[1], baseUrl) : (sources[0]?.srcset || null)
    if (src && !src.includes('.svg') && !src.includes('logo') && !src.includes('icon') && !src.includes('favicon')) {
      // Find desktop source (largest)
      const desktop = sources.find(s => s.media?.includes('1024') || s.media?.includes('1025') || s.media?.includes('min-width')) || sources[0]
      const mobile = sources.find(s => s.media?.includes('320') || s.media?.includes('max-width'))
      banners.push({
        headline: altM?.[1] || null,
        image_url_desktop: desktop?.srcset || src,
        image_url_mobile: mobile?.srcset || null,
      })
      pos++
    }
  }

  // 3. Hero/banner section background images
  const heroRe = /<(?:section|div)[^>]*class=["'][^"']*(?:hero|banner|carousel|slider|billboard|masthead|kv-carousel|main-visual|feature-hero)[^"']*["'][^>]*>([\s\S]*?)(?:<\/(?:section|div)>)/gi
  let hm
  while ((hm = heroRe.exec(html)) !== null) {
    const sec = hm[1].substring(0, 8000)
    // Background images
    const bgR = /(?:background(?:-image)?)\s*:\s*url\(["']?([^"')]+)["']?\)/gi
    let bm
    while ((bm = bgR.exec(sec)) !== null) {
      const src = cleanUrl(bm[1], baseUrl)
      if (src && !src.includes('data:') && !src.includes('.svg')) {
        banners.push({ image_url_desktop: src })
      }
    }
    // Headings within hero sections
    const hRe = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi
    let headM
    while ((headM = hRe.exec(sec)) !== null) {
      const text = headM[2].replace(/<[^>]+>/g, '').trim()
      if (text && text.length > 2 && banners.length > 0) {
        // Attach headline to last banner that doesn't have one
        const target = [...banners].reverse().find(b => !b.headline)
        if (target) target.headline = text
      }
    }
    // CTA links
    const ctaR = /<a[^>]+(?:class=["'][^"']*(?:cta|btn|button)[^"']*["']|href=["']([^"']+)["'])[^>]*>([\s\S]*?)<\/a>/gi
    let ctaM
    while ((ctaM = ctaR.exec(sec)) !== null) {
      const text = ctaM[2].replace(/<[^>]+>/g, '').trim()
      const hrefM = ctaM[0].match(/href=["']([^"']+)["']/i)
      if (text && text.length > 1 && banners.length > 0) {
        const target = [...banners].reverse().find(b => !b.cta_text)
        if (target) {
          target.cta_text = text
          target.cta_url = hrefM ? cleanUrl(hrefM[1], baseUrl) : null
        }
      }
    }
  }

  // 4. Large hero images (width >= 1000 or hero-class)
  const largeImgRe = /<img[^>]+(?:class=["'][^"']*(?:hero|banner|billboard|main-image|cover)[^"']*["']|width=["'](?:1[0-9]{3}|[2-9][0-9]{3}))[^>]+src=["']([^"']+)["'][^>]*/gi
  let lm
  while ((lm = largeImgRe.exec(html.substring(0, Math.floor(html.length * 0.4)))) !== null) {
    const src = cleanUrl(lm[1], baseUrl)
    const altM = lm[0].match(/alt=["']([^"']*?)["']/i)
    if (src && !src.includes('.svg') && !src.includes('logo')) {
      banners.push({ headline: altM?.[1] || null, image_url_desktop: src })
    }
  }
  // Also match src before class/width
  const largeImgRe2 = /<img[^>]+src=["']([^"']+)["'][^>]+(?:class=["'][^"']*(?:hero|banner|billboard|main-image|cover)[^"']*["']|width=["'](?:1[0-9]{3}|[2-9][0-9]{3}))[^>]*/gi
  while ((lm = largeImgRe2.exec(html.substring(0, Math.floor(html.length * 0.4)))) !== null) {
    const src = cleanUrl(lm[1], baseUrl)
    const altM = lm[0].match(/alt=["']([^"']*?)["']/i)
    if (src && !src.includes('.svg') && !src.includes('logo')) {
      banners.push({ headline: altM?.[1] || null, image_url_desktop: src })
    }
  }

  // 5. __NEXT_DATA__ — extract hero/banner components from Sitecore JSS
  const nextM = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (nextM) {
    try {
      const data = JSON.parse(nextM[1])
      const main = data.props?.pageProps?.layoutData?.sitecore?.route?.placeholders?.['jss-main'] || []
      for (const comp of main) {
        const name = (comp.componentName || '').toLowerCase()
        if (name.includes('banner') || name.includes('hero')) {
          const f = comp.fields || {}
          banners.push({
            headline: f.heading?.value || f.title?.value || null,
            sub_headline: f.subheading?.value || f.description?.value || null,
            cta_text: f.ctaButtonText?.value || f.ctaText?.value || null,
            cta_url: cleanUrl(f.ctaButton?.value?.href || f.ctaUrl?.value?.href, baseUrl),
            image_url_desktop: cleanUrl(f.desktopImage?.value?.src || f.image?.value?.src, baseUrl),
            image_url_mobile: cleanUrl(f.mobileImage?.value?.src, baseUrl),
          })
        }
      }
    } catch {}
  }

  // If no banners found, use OG image as fallback
  if (banners.length === 0 && ogImage?.[1]) {
    banners.push({
      headline: ogTitle?.[1] || null,
      sub_headline: ogDesc?.[1] || null,
      image_url_desktop: cleanUrl(ogImage[1], baseUrl),
    })
  }

  // Dedupe by desktop image URL
  const seen = new Set()
  return banners.filter(b => {
    if (!b.image_url_desktop) return false
    if (seen.has(b.image_url_desktop)) return false
    seen.add(b.image_url_desktop)
    return true
  })
}

// ── Main ──

async function main() {
  console.log('=== Banner Seed Script ===\n')

  const allBanners = []
  let pageIndex = 0

  for (const page of OEM_PAGES) {
    pageIndex++
    console.log(`[${pageIndex}/${OEM_PAGES.length}] ${page.oem} ${page.type}: ${page.url}`)

    const resp = await fetchPage(page.url)
    if (!resp.ok) {
      console.log(`  ERROR: ${resp.error || 'HTTP ' + resp.status}`)
      await sleep(DELAY)
      continue
    }

    const baseUrl = resp.finalUrl || page.url
    const banners = extractFromHtml(resp.html, baseUrl)

    console.log(`  Found ${banners.length} banners (${Math.round(resp.html.length / 1024)}KB HTML)`)

    for (let i = 0; i < banners.length; i++) {
      const b = banners[i]
      allBanners.push({
        oem_id: page.oem,
        page_url: baseUrl.split('?')[0],
        position: i,
        headline: b.headline?.substring(0, 255) || null,
        sub_headline: b.sub_headline?.substring(0, 500) || null,
        cta_text: b.cta_text?.substring(0, 100) || null,
        cta_url: b.cta_url || null,
        image_url_desktop: b.image_url_desktop || null,
        image_url_mobile: b.image_url_mobile || null,
        last_seen_at: new Date().toISOString(),
      })
    }

    await sleep(DELAY)
  }

  console.log(`\n--- Total banners extracted: ${allBanners.length} ---`)

  if (allBanners.length === 0) {
    console.log('No banners found. Exiting.')
    return
  }

  // Summary by OEM
  const byOem = {}
  for (const b of allBanners) {
    byOem[b.oem_id] = (byOem[b.oem_id] || 0) + 1
  }
  console.log('\nBanners per OEM:')
  for (const [oem, count] of Object.entries(byOem).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${oem}: ${count}`)
  }

  // Delete existing banners and insert fresh
  console.log('\nClearing existing banners...')
  const { error: delErr } = await supabase.from('banners').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delErr) {
    console.error('Delete error:', delErr.message)
    return
  }

  // Insert in batches of 50
  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < allBanners.length; i += BATCH) {
    const batch = allBanners.slice(i, i + BATCH)
    const { error: insErr } = await supabase.from('banners').insert(batch)
    if (insErr) {
      console.error(`Insert error at batch ${i}:`, insErr.message)
      continue
    }
    inserted += batch.length
  }

  console.log(`\nInserted ${inserted} banners into database.`)

  // Verify
  const { count } = await supabase.from('banners').select('*', { count: 'exact', head: true })
  console.log(`Database now has ${count} banners.`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
