/**
 * Probe OEM homepages for video elements and extract URLs.
 */
import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function fetchPage(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-AU,en;q=0.9' },
    redirect: 'follow',
  })
  return await resp.text()
}

function abs(url, base) {
  if (!url) return null
  url = url.trim()
  if (url.startsWith('//')) return 'https:' + url
  if (url.startsWith('http')) return url
  if (url.startsWith('/')) return new URL(url, base).href
  return new URL(url, base).href
}

const sites = [
  { id: 'kia-au', url: 'https://www.kia.com/au/main.html' },
  { id: 'suzuki-au', url: 'https://www.suzuki.com.au/' },
  { id: 'volkswagen-au', url: 'https://www.volkswagen.com.au/en.html' },
  // GWM may have videos from Storyblok — check HTML too
  { id: 'gwm-au', url: 'https://www.gwmanz.com/au/' },
  { id: 'nissan-au', url: 'https://www.nissan.com.au/' },
  { id: 'hyundai-au', url: 'https://www.hyundai.com/au/en' },
  { id: 'ford-au', url: 'https://www.ford.com.au/' },
  { id: 'isuzu-au', url: 'https://www.isuzuute.com.au/' },
  { id: 'mazda-au', url: 'https://www.mazda.com.au/' },
]

for (const site of sites) {
  console.log(`\n=== ${site.id} ===`)
  const html = await fetchPage(site.url)
  const $ = cheerio.load(html)

  const videos = $('video')
  console.log(`  Video elements: ${videos.length}`)

  videos.each((i, el) => {
    const $vid = $(el)
    const poster = $vid.attr('poster')
    const src = $vid.attr('src')
    const autoplay = $vid.attr('autoplay') !== undefined
    const muted = $vid.attr('muted') !== undefined

    console.log(`\n  video[${i}]: autoplay=${autoplay}, muted=${muted}`)
    if (poster) console.log(`    poster: ${abs(poster, site.url)}`)
    if (src) console.log(`    src: ${abs(src, site.url)}`)

    // Check source elements
    $vid.find('source').each((j, srcEl) => {
      const srcUrl = $(srcEl).attr('src')
      const type = $(srcEl).attr('type')
      const media = $(srcEl).attr('media')
      console.log(`    source[${j}]: ${abs(srcUrl, site.url)} type=${type || '?'} media=${media || 'all'}`)
    })

    // Context: what's the parent?
    const parent = $vid.closest('[class*="hero"], [class*="carousel"], [class*="slider"], [class*="banner"], [class*="billboard"], section').first()
    if (parent.length) {
      console.log(`    parent: ${parent.attr('class')?.substring(0, 80)}`)
      const h = parent.find('h1, h2, h3, [class*="headline"], [class*="title"]').first()
      if (h.length) console.log(`    text: "${h.text().trim().substring(0, 60)}"`)
    }
  })
}
