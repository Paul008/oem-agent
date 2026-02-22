/**
 * Deep debug for failing OEM banner extractors.
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

// === FORD ===
console.log('\n========== FORD ==========')
{
  const html = await fetchPage('https://www.ford.com.au/')
  const $ = cheerio.load(html)

  // Check billboard-item structure
  console.log('billboard-item count:', $('.billboard-item').length)
  console.log('billboard-wrapper count:', $('.billboard-wrapper').length)
  console.log('.billboard count:', $('.billboard').length)

  // What's inside billboard structure?
  $('.billboard-item').each((i, el) => {
    if (i > 3) return
    const $el = $(el)
    console.log(`\n  billboard-item[${i}]:`)
    console.log(`    classes: ${$el.attr('class')}`)
    // Find images
    const imgs = $el.find('img')
    imgs.each((j, img) => {
      const src = $(img).attr('src')
      const alt = $(img).attr('alt')
      const dataImage = $(img).attr('data-image')
      console.log(`    img[${j}]: src="${src?.substring(0, 80)}" alt="${alt}" data-image="${dataImage?.substring(0, 80)}"`)
    })
    // Find data-image attributes
    $el.find('[data-image]').each((j, el2) => {
      const di = $(el2).attr('data-image')
      console.log(`    data-image[${j}]: ${di?.substring(0, 100)}`)
    })
    // Find links
    const link = $el.find('a').first()
    if (link.length) console.log(`    link: href="${link.attr('href')}"`)
    // Headlines
    const h = $el.find('h1, h2, h3, .billboard-headline').first()
    if (h.length) console.log(`    headline: "${h.text().trim().substring(0, 60)}"`)
  })
}

// === HYUNDAI ===
console.log('\n\n========== HYUNDAI ==========')
{
  const html = await fetchPage('https://www.hyundai.com/au/en')
  const $ = cheerio.load(html)

  // Check hero blade structure
  const heroSection = $('.multipurpose-hero-blade-pcm2').first()
  console.log('Hero section found:', heroSection.length > 0)
  console.log('Hero section children:', heroSection.children().length)

  // What's inside the hero?
  if (heroSection.length) {
    heroSection.find('picture').each((i, el) => {
      console.log(`\n  picture[${i}]:`)
      $(el).find('source').each((j, src) => {
        const srcset = $(src).attr('srcset')
        const media = $(src).attr('media')
        console.log(`    source: media="${media}" srcset="${srcset?.substring(0, 100)}"`)
      })
      const img = $(el).find('img')
      console.log(`    img: src="${img.attr('src')?.substring(0, 100)}" alt="${img.attr('alt')}"`)
    })

    // Background images
    heroSection.find('[style*="background"]').each((i, el) => {
      const style = $(el).attr('style')
      console.log(`  bg-style[${i}]: ${style?.substring(0, 150)}`)
    })

    // data attributes
    heroSection.find('[data-desktop-image], [data-mobile-image]').each((i, el) => {
      console.log(`  data-desktop: ${$(el).attr('data-desktop-image')?.substring(0, 100)}`)
      console.log(`  data-mobile: ${$(el).attr('data-mobile-image')?.substring(0, 100)}`)
    })

    // mp-hero-blade background
    heroSection.find('.mp-hero-blade--background-image').each((i, el) => {
      console.log(`  mp-hero-bg[${i}] class: ${$(el).attr('class')}`)
      console.log(`  mp-hero-bg[${i}] style: ${$(el).attr('style')?.substring(0, 200)}`)
      // Check inner img/picture
      $(el).find('img, picture, source').each((j, inner) => {
        console.log(`    inner[${j}]: tag=${inner.tagName} src="${$(inner).attr('src')?.substring(0, 100)}" srcset="${$(inner).attr('srcset')?.substring(0, 100)}"`)
      })
    })
  }

  // Also check: what does the Swiper hero area look like?
  console.log('\n  Swiper slide images in hero area:')
  heroSection.find('.swiper-slide').each((i, el) => {
    if (i > 3) return
    const $sl = $(el)
    const img = $sl.find('img').first()
    console.log(`  swiper-slide[${i}]: img="${img.attr('src')?.substring(0, 100)}"`)
  })
}

// === KGM ===
console.log('\n\n========== KGM ==========')
{
  const html = await fetchPage('https://www.kgm.com.au/')
  const $ = cheerio.load(html)

  // carousel-banner
  const cb = $('[class*="carousel-banner"]').first()
  console.log('carousel-banner found:', cb.length > 0)
  if (cb.length) {
    console.log('  class:', cb.attr('class'))
    console.log('  children count:', cb.children().length)

    // Look for slides
    cb.children().each((i, el) => {
      if (i > 4) return
      const $child = $(el)
      console.log(`\n  child[${i}]: tag=${el.tagName} class="${$child.attr('class')?.substring(0, 80)}"`)

      // Background images in style
      const style = $child.attr('style')
      if (style && style.includes('background')) {
        console.log(`    style: ${style.substring(0, 200)}`)
      }

      // Images
      $child.find('img').each((j, img) => {
        console.log(`    img: src="${$(img).attr('src')?.substring(0, 100)}" alt="${$(img).attr('alt')}"`)
      })

      // Inner divs with background
      $child.find('[style*="background"]').each((j, bgEl) => {
        const s = $(bgEl).attr('style')
        console.log(`    bg-div: ${s?.substring(0, 200)}`)
      })
    })
  }

  // Check offer images
  console.log('\n  Images from payload.therefinerydesign.com:')
  $('img[src*="payload.therefinerydesign"]').each((i, el) => {
    if (i > 3) return
    console.log(`  [${i}] src="${$(el).attr('src')?.substring(0, 100)}" alt="${$(el).attr('alt')?.substring(0, 60)}"`)
  })
}

// === SUBARU ===
console.log('\n\n========== SUBARU ==========')
{
  const html = await fetchPage('https://www.subaru.com.au/')
  const $ = cheerio.load(html)

  // What's in the carousel?
  const carousel = $('.react-multi-carousel-list').first()
  console.log('carousel found:', carousel.length > 0)
  if (carousel.length) {
    console.log('  class:', carousel.attr('class'))
    const items = carousel.find('.react-multi-carousel-item')
    console.log('  items:', items.length)
    items.each((i, el) => {
      if (i > 3) return
      const $item = $(el)
      console.log(`\n  item[${i}]:`)
      $item.find('img').each((j, img) => {
        console.log(`    img: src="${$(img).attr('src')?.substring(0, 100)}" alt="${$(img).attr('alt')?.substring(0, 40)}"`)
      })
      $item.find('a').each((j, a) => {
        if (j > 0) return
        console.log(`    link: href="${$(a).attr('href')}" text="${$(a).text().trim().substring(0, 40)}"`)
      })
      // Background images
      $item.find('[style*="background"]').each((j, bgEl) => {
        console.log(`    bg: ${$(bgEl).attr('style')?.substring(0, 200)}`)
      })
    })
  }

  // Also check for non-carousel hero
  console.log('\n  All img[src*="hero"], img[src*="banner"]:')
  $('img').each((i, el) => {
    const src = $(el).attr('src') || ''
    if (src.includes('hero') || src.includes('banner') || src.includes('1920') || src.includes('slider')) {
      console.log(`  [${i}] src="${src.substring(0, 100)}" alt="${$(el).attr('alt')?.substring(0, 40)}"`)
    }
  })

  // Check for JSON data in scripts
  const scripts = $('script:not([src])').toArray()
  for (const s of scripts) {
    const text = $(s).html() || ''
    if (text.includes('carousel') || text.includes('hero') || text.includes('slider')) {
      console.log(`  Script with carousel/hero/slider data: ${text.substring(0, 200)}...`)
      break
    }
  }
}

// === SUZUKI ===
console.log('\n\n========== SUZUKI ==========')
{
  const html = await fetchPage('https://www.suzuki.com.au/')
  const $ = cheerio.load(html)

  // Video element
  $('video').each((i, el) => {
    const $vid = $(el)
    console.log(`video[${i}]: poster="${$vid.attr('poster')}" src="${$vid.attr('src')}"`)
    $vid.find('source').each((j, src) => {
      console.log(`  source: src="${$(src).attr('src')?.substring(0, 100)}" type="${$(src).attr('type')}"`)
    })
  })

  // All images
  console.log('\n  All images (first 10):')
  $('img').each((i, el) => {
    if (i > 10) return
    const src = $(el).attr('src') || ''
    console.log(`  [${i}] src="${src.substring(0, 100)}" alt="${$(el).attr('alt')?.substring(0, 40) || ''}"`)
  })

  // Background images
  $('[style*="background-image"]').each((i, el) => {
    if (i > 5) return
    console.log(`  bg[${i}]: ${$(el).attr('style')?.substring(0, 200)}`)
  })
}

// === VW ===
console.log('\n\n========== VW ==========')
{
  const html = await fetchPage('https://www.volkswagen.com.au/en.html')
  const $ = cheerio.load(html)

  // ContentSlider pictures
  console.log('ContentSlider sections:', $('[class*="ContentSlider"]').length)

  // Get first few picture elements with actual srcset
  let realPicCount = 0
  $('picture').each((i, el) => {
    if (realPicCount > 5) return
    const $pic = $(el)
    const sources = $pic.find('source')
    const hasReal = sources.toArray().some(s => {
      const srcset = $(s).attr('srcset') || $(s).attr('srcSet') || ''
      return srcset && !srcset.startsWith('data:')
    })
    if (hasReal) {
      console.log(`\n  Real picture[${i}]:`)
      sources.each((j, src) => {
        const srcset = $(src).attr('srcset') || $(src).attr('srcSet')
        const media = $(src).attr('media')
        if (srcset && !srcset.startsWith('data:'))
          console.log(`    source: media="${media}" srcset="${srcset?.substring(0, 120)}"`)
      })
      const img = $pic.find('img')
      const imgSrc = img.attr('src')
      if (imgSrc && !imgSrc.startsWith('data:'))
        console.log(`    img: src="${imgSrc?.substring(0, 120)}" alt="${img.attr('alt')?.substring(0, 40)}"`)
      realPicCount++
    }
  })

  // Check for srcSet (capital S — React/styled-components)
  const srcSetCount = (html.match(/srcSet="/gi) || []).length
  const srcsetCount = (html.match(/srcset="/gi) || []).length
  console.log(`\n  srcSet (capital): ${srcSetCount}, srcset (lower): ${srcsetCount}`)
}
