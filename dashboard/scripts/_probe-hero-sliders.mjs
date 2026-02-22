/**
 * Quick probe of OEM homepages to find hero slider/carousel structures.
 * Only checks sites that respond to fetch (not Cloudflare/Akamai blocked).
 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const SITES = [
  { id: 'mitsubishi-au', url: 'https://www.mitsubishi-motors.com.au/' },
  { id: 'subaru-au', url: 'https://www.subaru.com.au/' },
  { id: 'suzuki-au', url: 'https://www.suzuki.com.au/' },
  { id: 'volkswagen-au', url: 'https://www.volkswagen.com.au/en.html' },
  { id: 'mazda-au', url: 'https://www.mazda.com.au/' },
  { id: 'isuzu-au', url: 'https://www.isuzuute.com.au/' },
  { id: 'ldv-au', url: 'https://www.ldv.com.au/' },
  { id: 'kia-au', url: 'https://www.kia.com/au/main.html' },
  { id: 'nissan-au', url: 'https://www.nissan.com.au/' },
  { id: 'hyundai-au', url: 'https://www.hyundai.com/au/en' },
  { id: 'ford-au', url: 'https://www.ford.com.au/' },
  { id: 'toyota-au', url: 'https://www.toyota.com.au/' },
  { id: 'kgm-au', url: 'https://www.kgm.com.au/' },
  { id: 'gwm-au', url: 'https://www.gwmanz.com/au/' },
]

for (const site of SITES) {
  console.log(`\n=== ${site.id} (${site.url}) ===`)
  try {
    const resp = await fetch(site.url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      redirect: 'follow',
    })
    const html = await resp.text()
    console.log(`  Status: ${resp.status}, Size: ${(html.length / 1024).toFixed(0)}KB`)

    if (html.length < 1000) {
      console.log(`  BLOCKED or empty: ${html.substring(0, 200)}`)
      continue
    }

    // Check for hero/carousel patterns
    const patterns = {
      swiper: /class="[^"]*swiper[^"]*"/gi,
      carousel: /class="[^"]*carousel[^"]*"/gi,
      hero: /class="[^"]*hero[^"]*"/gi,
      slider: /class="[^"]*slider[^"]*"/gi,
      banner: /class="[^"]*banner[^"]*"/gi,
      splide: /class="[^"]*splide[^"]*"/gi,
      slick: /class="[^"]*slick[^"]*"/gi,
      owl: /class="[^"]*owl[^"]*"/gi,
      glide: /class="[^"]*glide[^"]*"/gi,
    }

    for (const [name, re] of Object.entries(patterns)) {
      const matches = html.match(re)
      if (matches) {
        const unique = [...new Set(matches)].slice(0, 5)
        console.log(`  ${name}: ${unique.length} unique (${unique.join(' | ')})`)
      }
    }

    // Check for video elements
    const videos = html.match(/<video[^>]*>[\s\S]*?<\/video>/gi)
    if (videos) {
      console.log(`  VIDEOS: ${videos.length} video elements found`)
      for (const v of videos.slice(0, 3)) {
        const src = v.match(/src="([^"]+)"/)?.[1] || v.match(/<source[^>]*src="([^"]+)"/)?.[1]
        const poster = v.match(/poster="([^"]+)"/)?.[1]
        console.log(`    src: ${src?.substring(0, 80) || '(none)'}, poster: ${poster?.substring(0, 80) || '(none)'}`)
      }
    }

    // Check for picture elements with media queries
    const pictures = html.match(/<picture[\s\S]*?<\/picture>/gi)
    if (pictures) {
      console.log(`  PICTURE elements: ${pictures.length}`)
      // Show first 2 picture structures
      for (const p of pictures.slice(0, 2)) {
        const sources = p.match(/<source[^>]*>/gi) || []
        console.log(`    Sources: ${sources.length}`)
        for (const s of sources.slice(0, 3)) {
          const media = s.match(/media="([^"]+)"/)?.[1] || ''
          const srcset = s.match(/srcset="([^"]+)"/)?.[1]?.split('/').pop() || ''
          console.log(`      media="${media}" → ${srcset.substring(0, 60)}`)
        }
      }
    }

    // Check for __NEXT_DATA__ (Next.js)
    if (html.includes('__NEXT_DATA__')) console.log('  HAS __NEXT_DATA__ (Next.js SSR)')
    // Check for __NUXT__ or __NUXT_DATA__
    if (html.includes('__NUXT__') || html.includes('__NUXT_DATA__')) console.log('  HAS __NUXT__ (Nuxt SSR)')

  } catch (e) {
    console.log(`  ERROR: ${e.message}`)
  }
}
