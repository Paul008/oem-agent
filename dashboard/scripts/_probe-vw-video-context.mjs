import * as cheerio from 'cheerio'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const html = await (await fetch('https://www.volkswagen.com.au/en.html', { headers: { 'User-Agent': UA } })).text()
const $ = cheerio.load(html)

// Find all video-related containers
$('[class*="video"]').each((i, el) => {
  if (i > 5) return
  const $el = $(el)
  const tag = el.tagName
  if (tag === 'video') return // skip video elements themselves
  const cls = $el.attr('class')?.substring(0, 100)
  const video = $el.find('video')
  if (video.length === 0) return
  
  console.log(`\n[${i}] ${tag}.${cls}`)
  // Find nearby heading
  const h = $el.closest('section, [class*="Stage"], [class*="slider"], [class*="hero"]').find('h1, h2, h3, [class*="headline"]').first()
  if (h.length) console.log(`  heading: "${h.text().trim().substring(0, 60)}"`)
  
  // Find source URLs in surrounding HTML
  const parentHtml = $el.html() || ''
  const mp4s = parentHtml.match(/https?:\/\/[^"'\s]+\.mp4/gi) || []
  for (const url of [...new Set(mp4s)]) {
    console.log(`  mp4: ${url}`)
  }
})

// Also check: which ContentSlider or hero section contains video?
$('video').each((i, el) => {
  const $vid = $(el)
  const section = $vid.closest('section, [class*="Stage"], [class*="ContentSlider"], [class*="hero"]')
  console.log(`\nvideo[${i}] in section: ${section.attr('class')?.substring(0, 120)}`)
  const ariaLabel = $vid.attr('aria-label')
  console.log(`  aria-label: ${ariaLabel}`)
  
  // Check if there's a poster or source
  const poster = $vid.attr('poster')
  console.log(`  poster: ${poster || 'none'}`)
  
  // Look for source URLs in data attributes on parent elements
  let parent = $vid.parent()
  for (let depth = 0; depth < 5; depth++) {
    const attrs = parent.prop('attribs') || {}
    for (const [k, v] of Object.entries(attrs)) {
      if (typeof v === 'string' && v.includes('.mp4')) {
        console.log(`  parent[${depth}] ${k}: ${v.substring(0, 200)}`)
      }
    }
    parent = parent.parent()
  }
})

// The video URL from assets.volkswagen.com — find it in context
const idx = html.indexOf('assets.volkswagen.com/is/content')
if (idx > -1) {
  console.log('\n\nVW video URL context:')
  console.log(html.substring(Math.max(0, idx - 300), idx + 200))
}
