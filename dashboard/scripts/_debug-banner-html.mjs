/**
 * Debug banner extractors — dump HTML structure for failing OEMs.
 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function fetchPage(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-AU,en;q=0.9' },
    redirect: 'follow',
  })
  return { status: resp.status, html: await resp.text() }
}

const targets = [
  { name: 'Ford', url: 'https://www.ford.com.au/' },
  { name: 'Hyundai', url: 'https://www.hyundai.com/au/en' },
  { name: 'KGM', url: 'https://www.kgm.com.au/' },
  { name: 'Subaru', url: 'https://www.subaru.com.au/' },
  { name: 'Suzuki', url: 'https://www.suzuki.com.au/' },
  { name: 'VW', url: 'https://www.volkswagen.com.au/en.html' },
  { name: 'Mitsubishi', url: 'https://www.mitsubishi-motors.com.au/' },
]

for (const t of targets) {
  console.log(`\n========== ${t.name} (${t.url}) ==========`)
  const { status, html } = await fetchPage(t.url)
  console.log(`Status: ${status}, Size: ${(html.length / 1024).toFixed(0)}KB`)

  if (html.length < 1000) {
    console.log(`TOO SHORT: ${html.substring(0, 300)}`)
    continue
  }

  // Check for key patterns
  const checks = [
    { label: 'billboard', re: /class="[^"]*billboard[^"]*"/gi },
    { label: 'hero', re: /class="[^"]*hero[^"]*"/gi },
    { label: 'carousel', re: /class="[^"]*carousel[^"]*"/gi },
    { label: 'slider', re: /class="[^"]*slider[^"]*"/gi },
    { label: 'banner', re: /class="[^"]*banner[^"]*"/gi },
    { label: 'swiper', re: /class="[^"]*swiper[^"]*"/gi },
    { label: 'slick', re: /class="[^"]*slick[^"]*"/gi },
    { label: 'picture', re: /<picture/gi },
    { label: 'video', re: /<video/gi },
    { label: 'source_srcset', re: /srcset="/gi },
    { label: 'data-desktop', re: /data-desktop/gi },
    { label: 'data-image', re: /data-image/gi },
    { label: 'background-image', re: /background-image/gi },
    { label: '__NEXT_DATA__', re: /__NEXT_DATA__/g },
    { label: '__NUXT', re: /__NUXT/g },
    { label: 'multipurpose-hero', re: /multipurpose-hero/gi },
    { label: 'ContentSlider', re: /ContentSlider/gi },
    { label: 'Stage', re: /class="[^"]*[Ss]tage[^"]*"/gi },
  ]

  for (const c of checks) {
    const m = html.match(c.re)
    if (m) {
      const unique = [...new Set(m)].slice(0, 4)
      console.log(`  ${c.label}: ${m.length}x → ${unique.join(' | ')}`)
    }
  }

  // Extract first few img srcs near hero/carousel/banner/slider areas
  const imgMatches = html.match(/<img[^>]*src="([^"]+)"[^>]*>/gi) || []
  const heroImgs = imgMatches.filter(m =>
    /hero|banner|carousel|slider|billboard|stage|1920|cover/i.test(
      html.substring(Math.max(0, html.indexOf(m) - 500), html.indexOf(m) + m.length)
    )
  )
  if (heroImgs.length) {
    console.log(`  Hero-adjacent imgs: ${heroImgs.length}`)
    for (const img of heroImgs.slice(0, 3)) {
      const src = img.match(/src="([^"]+)"/)?.[1]
      const alt = img.match(/alt="([^"]+)"/)?.[1]
      console.log(`    src="${src?.substring(0, 80)}" alt="${alt?.substring(0, 40) || ''}"`)
    }
  }

  // For KGM: dump __NEXT_DATA__ keys
  if (t.name === 'KGM') {
    const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
    if (nd) {
      try {
        const data = JSON.parse(nd)
        const pp = data.props?.pageProps || {}
        console.log(`  __NEXT_DATA__ pageProps keys: ${Object.keys(pp).join(', ')}`)
        // Look for any array-like structures
        for (const [k, v] of Object.entries(pp)) {
          if (Array.isArray(v)) console.log(`    ${k}: Array[${v.length}]`)
          else if (v && typeof v === 'object') console.log(`    ${k}: Object with keys [${Object.keys(v).slice(0, 8).join(', ')}]`)
        }
      } catch (e) {
        console.log(`  __NEXT_DATA__ parse error: ${e.message}`)
      }
    }
  }

  // For Hyundai: check Swiper patterns
  if (t.name === 'Hyundai') {
    const swiperSlides = html.match(/class="swiper-slide[^"]*"/gi) || []
    console.log(`  Swiper slides: ${swiperSlides.length}`)
    // Check for data-swiper attributes
    const dataSwiper = html.match(/data-swiper[^=]*="[^"]*"/gi) || []
    if (dataSwiper.length) console.log(`  data-swiper attrs: ${dataSwiper.length}`)
    // Check for any lazyload or data-src
    const lazySrcs = html.match(/data-src="[^"]*\.(jpg|png|webp)[^"]*"/gi) || []
    if (lazySrcs.length) console.log(`  data-src images: ${lazySrcs.length}`)
  }

  // For VW: check for specific patterns
  if (t.name === 'VW') {
    // Check for specific VW component classes
    const vwComps = html.match(/class="[^"]*(?:stage|slider|hero|teaser|billboard|module|content)[^"]*"/gi) || []
    if (vwComps.length) {
      const unique = [...new Set(vwComps)].slice(0, 8)
      console.log(`  VW components: ${unique.join(' | ')}`)
    }
  }
}
