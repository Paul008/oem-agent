/**
 * Deep probe VW and Kia for video URLs
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

// VW - look deeper at video element and any data attributes
console.log('=== VW ===')
{
  const html = await fetchPage('https://www.volkswagen.com.au/en.html')
  const $ = cheerio.load(html)
  
  $('video').each((i, el) => {
    const $vid = $(el)
    console.log(`\nvideo[${i}] attributes:`)
    const attrs = el.attribs || {}
    for (const [k, v] of Object.entries(attrs)) {
      console.log(`  ${k}: ${v?.substring?.(0, 200) || v}`)
    }
    $vid.find('source').each((j, src) => {
      console.log(`  source[${j}]:`, $(src).attr('src'), $(src).attr('type'), $(src).attr('media'))
    })
    // Check parent for data-* attrs
    const parent = $vid.parent()
    console.log(`  parent tag: ${parent.prop('tagName')}, class: ${parent.attr('class')?.substring(0, 100)}`)
    for (const [k, v] of Object.entries(parent.prop('attribs') || {})) {
      if (k.startsWith('data-')) console.log(`  parent ${k}: ${v?.substring?.(0, 200)}`)
    }
  })
  
  // Check for video URLs in script tags or data attributes
  const videoUrlMatches = html.match(/https?:\/\/[^"'\s]+\.(mp4|webm)/gi) || []
  console.log(`\nVideo URLs in HTML: ${videoUrlMatches.length}`)
  for (const url of [...new Set(videoUrlMatches)].slice(0, 10)) {
    console.log(`  ${url}`)
  }
}

// Kia - check for video sources
console.log('\n\n=== KIA ===')
{
  const html = await fetchPage('https://www.kia.com/au/main.html')
  const $ = cheerio.load(html)
  
  $('video').each((i, el) => {
    const $vid = $(el)
    console.log(`\nvideo[${i}] attributes:`)
    const attrs = el.attribs || {}
    for (const [k, v] of Object.entries(attrs)) {
      console.log(`  ${k}: ${v?.substring?.(0, 200) || v}`)
    }
    $vid.find('source').each((j, src) => {
      console.log(`  source[${j}]:`, $(src).attr('src'), $(src).attr('type'))
    })
  })
  
  // Check for video URLs in HTML
  const videoUrlMatches = html.match(/https?:\/\/[^"'\s]+\.(mp4|webm)/gi) || []
  console.log(`\nVideo URLs in HTML: ${videoUrlMatches.length}`)
  for (const url of [...new Set(videoUrlMatches)].slice(0, 10)) {
    console.log(`  ${url}`)
  }
}
