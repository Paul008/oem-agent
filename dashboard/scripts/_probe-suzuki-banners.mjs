/**
 * Probe Suzuki homepage and offers page for banners.
 * User says: homepage at /home/ and offers at /latest-offers/
 */
import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function fetchPage(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-AU,en;q=0.9' },
    redirect: 'follow',
  })
  console.log(`${url} → ${resp.status} (${resp.url})`)
  return await resp.text()
}

// === Homepage /home/ ===
console.log('\n=== SUZUKI /home/ ===')
{
  const html = await fetchPage('https://www.suzuki.com.au/home/')
  const $ = cheerio.load(html)

  // Videos
  $('video').each((i, el) => {
    const $vid = $(el)
    console.log(`\nvideo[${i}]: poster="${$vid.attr('poster') || 'none'}" autoplay=${$vid.attr('autoplay') !== undefined}`)
    $vid.find('source').each((j, src) => {
      console.log(`  source[${j}]: src="${$(src).attr('src')}" type="${$(src).attr('type')}" media="${$(src).attr('media') || 'all'}"`)
    })
  })

  // Hero images
  console.log('\nHero/banner images:')
  $('img').each((i, el) => {
    const src = $(el).attr('src') || ''
    if (src.includes('hero') || src.includes('banner') || src.includes('slider') || src.includes('1920') || src.includes('offer')) {
      console.log(`  img: src="${src.substring(0, 120)}" alt="${$(el).attr('alt')?.substring(0, 50) || ''}"`)
    }
  })

  // Background images
  $('[style*="background-image"]').each((i, el) => {
    if (i > 5) return
    const style = $(el).attr('style')
    console.log(`  bg[${i}]: ${style?.substring(0, 200)}`)
  })
}

// === Offers /latest-offers/ ===
console.log('\n\n=== SUZUKI /latest-offers/ ===')
{
  const html = await fetchPage('https://www.suzuki.com.au/latest-offers/')
  const $ = cheerio.load(html)

  // Videos
  const vids = $('video')
  console.log(`Videos: ${vids.length}`)

  // Hero/banner area
  console.log('\nHero/banner images:')
  $('img').each((i, el) => {
    const src = $(el).attr('src') || ''
    const alt = $(el).attr('alt') || ''
    if (src.includes('hero') || src.includes('banner') || src.includes('offer') || src.includes('1920') || src.includes('slider') || alt.toLowerCase().includes('offer')) {
      console.log(`  img: src="${src.substring(0, 120)}" alt="${alt.substring(0, 60)}"`)
    }
  })

  // All images in first section
  console.log('\nFirst 15 images:')
  $('img').each((i, el) => {
    if (i > 14) return
    const src = $(el).attr('src') || ''
    const alt = $(el).attr('alt') || ''
    console.log(`  [${i}] src="${src.substring(0, 100)}" alt="${alt.substring(0, 50)}"`)
  })

  // Background images  
  $('[style*="background-image"]').each((i, el) => {
    if (i > 5) return
    console.log(`  bg[${i}]: ${$(el).attr('style')?.substring(0, 200)}`)
  })

  // Offer cards
  const cards = $('[class*="offer"], [class*="special"], [class*="deal"]')
  console.log(`\nOffer elements: ${cards.length}`)
  cards.each((i, el) => {
    if (i > 5) return
    const $c = $(el)
    const img = $c.find('img').first()
    const h = $c.find('h2, h3, h4, [class*="title"]').first()
    console.log(`  [${i}] class="${$c.attr('class')?.substring(0, 60)}" img="${img.attr('src')?.substring(0, 80) || 'none'}" heading="${h.text().trim().substring(0, 50)}"`)
  })
}
