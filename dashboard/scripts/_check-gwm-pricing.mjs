/**
 * Check GWM AU driveaway pricing from Storyblok CDN API.
 *
 * Fetches all AUModel variant stories and prints:
 *  - name, driveaway_abn_price, driveaway_retail_price, whether they differ
 *  - offer_text_abn / offer_text_retail (plain text from rich text)
 *  - Summary: how many have different ABN vs retail prices
 *
 * Run: cd dashboard/scripts && node _check-gwm-pricing.mjs
 */

const TOKEN = 'rII785g9nG3hemzhYNQvQwtt'
const CV = '1771462289'
const BASE = 'https://api.storyblok.com/v2/cdn/stories'
const HEADERS = { Origin: 'https://www.gwmanz.com', Referer: 'https://www.gwmanz.com/' }

/**
 * Extract plain text from Storyblok rich text doc.
 * Walks paragraph nodes and concatenates text content.
 */
function richTextToPlain(rt) {
  if (!rt || typeof rt === 'string') return rt || ''
  if (rt.type !== 'doc' || !Array.isArray(rt.content)) return ''
  const lines = []
  for (const block of rt.content) {
    if (block.type === 'paragraph' && Array.isArray(block.content)) {
      lines.push(block.content.map(n => n.text || '').join(''))
    }
  }
  return lines.filter(Boolean).join(' ')
}

async function fetchPage(page) {
  const params = new URLSearchParams({
    cv: CV,
    starts_with: 'car-configurator/models/',
    'filter_query[component][in]': 'AUModel',
    language: 'au',
    per_page: '100',
    page: String(page),
    token: TOKEN,
    version: 'published',
  })
  const url = `${BASE}?${params}`
  const r = await fetch(url, { headers: HEADERS })
  if (!r.ok) throw new Error(`Storyblok ${r.status}: ${await r.text()}`)
  return r.json()
}

async function main() {
  console.log('=== GWM AU Driveaway Pricing Check (Storyblok) ===\n')

  // Paginate to get all AUModel stories
  let allStories = []
  for (let page = 1; page <= 10; page++) {
    const data = await fetchPage(page)
    allStories = allStories.concat(data.stories)
    console.log(`  Page ${page}: ${data.stories.length} stories (total: ${allStories.length})`)
    if (data.stories.length < 100) break
  }

  console.log(`\nTotal variants: ${allStories.length}\n`)
  console.log('-'.repeat(120))

  let diffCount = 0
  let sameCount = 0
  let noPrice = 0
  const byModel = {}

  for (const s of allStories) {
    const c = s.content
    const abnPrice = c.driveaway_abn_price || null
    const retailPrice = c.driveaway_retail_price || null
    const hasPricing = abnPrice || retailPrice
    const differs = abnPrice !== retailPrice

    if (!hasPricing) {
      noPrice++
    } else if (differs) {
      diffCount++
    } else {
      sameCount++
    }

    // Extract model from path: car-configurator/models/{model}/au/...
    const pathParts = s.full_slug.split('/')
    const modelSlug = pathParts[2] || 'unknown'
    if (!byModel[modelSlug]) byModel[modelSlug] = []
    byModel[modelSlug].push({
      name: s.name,
      abnPrice,
      retailPrice,
      differs,
      offerAbn: richTextToPlain(c.offer_text_abn),
      offerRetail: richTextToPlain(c.offer_text_retail),
      stateAbn: c.driveaway_state_abn_prices,
      stateRetail: c.driveaway_state_retail_prices,
    })
  }

  // Print grouped by model
  for (const [model, variants] of Object.entries(byModel).sort()) {
    console.log(`\n  ${model.toUpperCase()}`)
    console.log(`  ${'─'.repeat(model.length + 2)}`)
    for (const v of variants) {
      const marker = v.differs ? ' ** DIFFERS **' : ''
      const abn = v.abnPrice ? `$${Number(v.abnPrice).toLocaleString()}` : '(none)'
      const ret = v.retailPrice ? `$${Number(v.retailPrice).toLocaleString()}` : '(none)'
      console.log(`    ${v.name}`)
      console.log(`      ABN:    ${abn}`)
      console.log(`      Retail: ${ret}${marker}`)

      if (v.offerAbn) {
        console.log(`      Offer (ABN):    ${v.offerAbn}`)
      }
      if (v.offerRetail && v.offerRetail !== v.offerAbn) {
        console.log(`      Offer (Retail): ${v.offerRetail}`)
      } else if (v.offerRetail && v.offerRetail === v.offerAbn) {
        console.log(`      Offer (Retail): (same as ABN)`)
      }

      // State pricing if present
      if (v.stateAbn && v.stateAbn.length > 0) {
        console.log(`      State ABN prices: ${JSON.stringify(v.stateAbn)}`)
      }
      if (v.stateRetail && v.stateRetail.length > 0) {
        console.log(`      State Retail prices: ${JSON.stringify(v.stateRetail)}`)
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(120))
  console.log('\n  SUMMARY')
  console.log(`  Total variants:          ${allStories.length}`)
  console.log(`  With pricing:            ${sameCount + diffCount}`)
  console.log(`  No pricing:              ${noPrice}`)
  console.log(`  ABN == Retail:           ${sameCount}`)
  console.log(`  ABN != Retail (differ):  ${diffCount}`)
  console.log(`  Models:                  ${Object.keys(byModel).length}`)

  if (diffCount > 0) {
    console.log('\n  Variants where ABN differs from Retail:')
    for (const [model, variants] of Object.entries(byModel).sort()) {
      for (const v of variants) {
        if (v.differs) {
          console.log(`    - ${v.name}: ABN $${Number(v.abnPrice).toLocaleString()} vs Retail $${Number(v.retailPrice).toLocaleString()}`)
        }
      }
    }
  }

  console.log()
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
