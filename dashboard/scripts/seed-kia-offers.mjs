/**
 * Seed Kia offers from kia.com.au offers pages (two-tier scraping).
 *
 * Tier 1: Main offers page — model-level offers with hero images
 *   URL: https://www.kia.com/au/shopping-tools/offers/car-offers.html
 *
 * Tier 2: Detail pages — grade/variant pricing per model (driveaway offers only)
 *   URL: https://www.kia.com/au/shopping-tools/offers/car-offers/{model}.html
 *
 * CMS: Adobe Experience Manager (KWCMS) — server-rendered HTML, no auth needed.
 *
 * Run: cd dashboard/scripts && node seed-kia-offers.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'kia-au'
const BASE = 'https://www.kia.com'
const OFFERS_URL = `${BASE}/au/shopping-tools/offers/car-offers.html`

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

/** Decode HTML entities like &nbsp; &#34; &amp; etc. */
function decodeEntities(str) {
  if (!str) return str
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extract text between an opening class marker and the next tag close */
function extractByClass(html, className) {
  const re = new RegExp(`class="${className}"[^>]*>([^<]+)<`, 'i')
  const m = html.match(re)
  return m ? m[1].trim() : null
}

/** Parse price text like "$29,990" or "$44,490$45,490 (WA)" */
function parsePrice(text) {
  if (!text) return { price: null, waPrice: null }
  const prices = [...text.matchAll(/\$([0-9,]+)/g)].map(m => Number(m[1].replace(/,/g, '')))
  const waMatch = text.match(/\(WA\)/)
  if (prices.length >= 2 && waMatch) {
    return { price: prices[0], waPrice: prices[1] }
  }
  return { price: prices[0] || null, waPrice: null }
}

/** Classify offer type from the full card text */
function classifyOffer(text) {
  if (/comparison rate|annual percentage rate|finance/i.test(text)) return 'finance'
  if (/complimentary|accessory pack|value/i.test(text)) return 'value_add'
  if (/drive away/i.test(text)) return 'driveaway'
  return 'driveaway'
}

/** Extract validity end date from disclaimer text */
function extractValidity(text) {
  // Look for patterns like "Ends 28 February 2026", "28/2/26", "received by 28/2/26"
  const m1 = text.match(/(?:ends?|until|by)\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)
  if (m1) {
    const months = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' }
    return `${m1[3]}-${months[m1[2].toLowerCase()]}-${m1[1].padStart(2, '0')}`
  }
  const m2 = text.match(/(?:ends?|until|by)\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i)
  if (m2) {
    const yr = m2[3].length === 2 ? `20${m2[3]}` : m2[3]
    return `${yr}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════
// TIER 1: Scrape main offers page
// ═══════════════════════════════════════════════════════════════════

async function scrapeMainOffers() {
  console.log(`Fetching main offers page: ${OFFERS_URL}`)
  const res = await fetch(OFFERS_URL, { headers: HEADERS })
  if (!res.ok) throw new Error(`Main page returned ${res.status}`)
  const html = await res.text()
  console.log(`  HTML size: ${(html.length / 1024).toFixed(0)}KB`)

  // Split by <li to get individual offer cards
  // The offer list uses class="resultList"
  const listMatch = html.match(/class="resultList"[^>]*>([\s\S]*?)<\/ul>/i)
  if (!listMatch) throw new Error('Could not find resultList in HTML')

  const listHtml = listMatch[1]
  const items = listHtml.split(/<li\b/i).slice(1) // skip first empty split

  const offers = []
  for (const item of items) {
    const fullText = item.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (fullText.includes('NO OFFERS WERE FOUND')) continue

    // Extract fields using class selectors
    const model = decodeEntities(extractByClass(item, 'carName'))
    const grade = decodeEntities(extractByClass(item, 'carTream'))
    const priceText = decodeEntities(extractByClass(item, 'carPrice'))

    // Extract hero image
    const imgMatch = item.match(/src="([^"]*\/offer[^"]*\.(?:webp|jpg|png))/i)
      || item.match(/src="([^"]*\/images\/[^"]*\.(?:webp|jpg|png))/i)
    const imgPath = imgMatch ? imgMatch[1] : null

    // Extract detail page link
    const detailMatch = item.match(/href="(\/au\/shopping-tools\/offers\/car-offers\/[^"]+)"/i)
    const detailPath = detailMatch ? detailMatch[1] : null

    // Extract description
    const descMatch = item.match(/class="carTxt"[^>]*>([\s\S]*?)<\/(?:div|span|p)/i)
    const description = descMatch
      ? decodeEntities(descMatch[1].replace(/<[^>]+>/g, ' ')).substring(0, 500)
      : null

    if (!model) continue

    const { price, waPrice } = parsePrice(priceText)
    const offerType = classifyOffer(fullText)

    offers.push({
      model: model.replace(/^New\s+/i, ''),
      rawModel: model,
      grade,
      price,
      waPrice,
      offerType,
      imgUrl: imgPath ? `${BASE}${imgPath}` : null,
      detailPath,
      description,
      fullText: fullText.substring(0, 300),
    })
  }

  console.log(`  Found ${offers.length} main offers`)
  return offers
}

// ═══════════════════════════════════════════════════════════════════
// TIER 2: Scrape detail pages for variant/grade pricing
// ═══════════════════════════════════════════════════════════════════

async function scrapeDetailPage(detailPath) {
  const url = `${BASE}${detailPath}`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) {
    console.log(`    Detail page ${detailPath} returned ${res.status}, skipping`)
    return []
  }
  const html = await res.text()

  // Look for Model Range section with grade slides
  const variants = []

  // Split by modelSlide_item class
  const slideMatches = html.split(/class="modelSlide_item"/i).slice(1)
  if (slideMatches.length === 0) return []

  for (const slide of slideMatches) {
    // Extract grade name from item_title
    const titleMatch = slide.match(/class="item_title"[^>]*>([\s\S]*?)<\/span>/i)
    const gradeName = titleMatch
      ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, ' '))
      : null

    // Extract price from item_offers_from
    const priceMatch = slide.match(/class="item_offers_from"[^>]*>\s*(\$[0-9,]+)/i)
    const priceText = priceMatch ? priceMatch[1] : null
    const price = priceText ? Number(priceText.replace(/[$,]/g, '')) : null

    // Check for WA pricing
    const waPriceMatch = slide.match(/\$([0-9,]+)\s*\(WA\)/i)
    const waPrice = waPriceMatch ? Number(waPriceMatch[1].replace(/,/g, '')) : null

    // Extract features
    const features = []
    const featureMatches = slide.matchAll(/<li[^>]*>([^<]+(?:<[^>]*>[^<]*)*)<\/li>/gi)
    for (const fm of featureMatches) {
      const feat = fm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (feat && feat.length > 3) features.push(feat)
    }

    // Extract Build & Price link for grade slug
    const bpMatch = slide.match(/href="[^"]*build-and-price[^"]*"/i)

    if (gradeName) {
      variants.push({ gradeName, price, waPrice, features: features.slice(0, 5) })
    }
  }

  // Extract disclaimer text from the detail page
  const disclaimerMatch = html.match(/class="specdata_txt"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/<h3[^>]*>\[A\][^<]*Drive Away[^<]*<\/h3>\s*(?:<[^>]*>)?\s*([\s\S]*?)<\/(?:div|p)/i)
  const disclaimer = disclaimerMatch
    ? disclaimerMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500)
    : null

  // Extract validity from the page text
  const pageText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const validityEnd = extractValidity(pageText)

  return variants.map(v => ({ ...v, disclaimer, validityEnd }))
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  // 1. Get vehicle models from DB for linking
  const { data: dbModels } = await supabase
    .from('vehicle_models')
    .select('id, slug, name')
    .eq('oem_id', OEM_ID)
  const modelLookup = {}
  for (const m of dbModels) {
    modelLookup[m.slug] = m.id
    modelLookup[m.name.toLowerCase()] = m.id
  }
  console.log(`DB models: ${dbModels.length} (${dbModels.map(m => m.slug).join(', ')})`)

  // 2. Scrape Tier 1 — main offers
  const mainOffers = await scrapeMainOffers()

  // 3. Build offer rows
  const now = new Date().toISOString()
  const offerRows = []
  const scrapedDetailPages = new Set() // avoid duplicate variant scraping

  for (const offer of mainOffers) {
    // Match to a vehicle model — try progressively broader matching
    const modelSlug = slugify(offer.model)
    const modelId = modelLookup[modelSlug]
      || modelLookup[offer.model.toLowerCase()]
      || modelLookup[modelSlug.replace(/-hybrid$/, '') + '-hybrid']
      // "K4 Hatch & Sedan" → try k4-hatch then k4
      || modelLookup[modelSlug.split('-')[0] + '-' + modelSlug.split('-')[1]]
      || modelLookup[modelSlug.split('-')[0]]
      // "Tasman Single Cab Chassis" / "Tasman Pick-up" → tasman
      || modelLookup[modelSlug.replace(/-(single|dual|pick|selected).*$/, '')]
      || null

    // Create the main (Tier 1) offer row
    const mainKey = `kia-offer-${slugify(offer.rawModel)}-${slugify(offer.grade || offer.offerType)}`

    offerRows.push({
      oem_id: OEM_ID,
      external_key: mainKey,
      source_url: OFFERS_URL,
      title: `${offer.rawModel} ${offer.grade || ''}`.trim() + (offer.price ? ` - $${offer.price.toLocaleString()}` : ''),
      description: offer.description,
      offer_type: offer.offerType === 'driveaway' ? 'Driveaway' : offer.offerType === 'finance' ? 'Finance' : 'Value Add',
      applicable_models: modelId ? dbModels.find(m => m.id === modelId)?.slug || modelSlug : modelSlug,
      price_amount: offer.price,
      price_currency: 'AUD',
      price_type: offer.offerType === 'driveaway' ? 'driveaway' : offer.offerType,
      saving_amount: null,
      validity_start: null,
      validity_end: null,
      validity_raw: null,
      cta_text: 'View Details',
      cta_url: offer.detailPath ? `${BASE}${offer.detailPath}` : null,
      hero_image_r2_key: offer.imgUrl,
      disclaimer_text: null,
      model_id: modelId,
      content_hash: null,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    })

    // 4. Scrape Tier 2 — variant pricing from detail pages (driveaway offers only)
    if (offer.offerType === 'driveaway' && offer.detailPath && !scrapedDetailPages.has(offer.detailPath)) {
      scrapedDetailPages.add(offer.detailPath)
      console.log(`  Scraping detail: ${offer.detailPath}`)
      const variants = await scrapeDetailPage(offer.detailPath)

      if (variants.length > 0) {
        console.log(`    Found ${variants.length} grade variants`)

        // Update validity on the main offer if found
        if (variants[0].validityEnd) {
          offerRows[offerRows.length - 1].validity_end = variants[0].validityEnd
        }
        if (variants[0].disclaimer) {
          offerRows[offerRows.length - 1].disclaimer_text = variants[0].disclaimer
        }

        for (const variant of variants) {
          // Skip the variant that matches the main offer price (avoid duplicate)
          if (variant.price === offer.price && variants.length > 1) continue

          const variantKey = `kia-offer-${slugify(offer.rawModel)}-${slugify(variant.gradeName)}`

          offerRows.push({
            oem_id: OEM_ID,
            external_key: variantKey,
            source_url: `${BASE}${offer.detailPath}`,
            title: `${offer.model} ${variant.gradeName} - $${variant.price?.toLocaleString() || '?'}`,
            description: variant.features.length > 0 ? variant.features.join(' | ') : null,
            offer_type: 'Driveaway',
            applicable_models: modelId ? dbModels.find(m => m.id === modelId)?.slug || modelSlug : modelSlug,
            price_amount: variant.price,
            price_currency: 'AUD',
            price_type: 'driveaway',
            saving_amount: null,
            validity_start: null,
            validity_end: variant.validityEnd,
            validity_raw: null,
            cta_text: 'Build & Price',
            cta_url: `${BASE}/au/shopping-tools/build-and-price.trim.${modelSlug}.html`,
            hero_image_r2_key: offer.imgUrl, // reuse parent offer's hero image
            disclaimer_text: variant.disclaimer,
            model_id: modelId,
            content_hash: null,
            last_seen_at: now,
            created_at: now,
            updated_at: now,
          })
        }
      }

      // Rate limit between detail page fetches
      await new Promise(r => setTimeout(r, 500))
    } else if (offer.offerType === 'driveaway' && offer.detailPath && scrapedDetailPages.has(offer.detailPath)) {
      console.log(`  Skipping duplicate detail: ${offer.detailPath}`)
    } else if (offer.offerType === 'finance' && offer.detailPath) {
      // For finance offers, scrape the detail page for validity dates
      console.log(`  Scraping finance detail: ${offer.detailPath}`)
      const url = `${BASE}${offer.detailPath}`
      const res = await fetch(url, { headers: HEADERS })
      if (res.ok) {
        const html = await res.text()
        const pageText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
        const validityEnd = extractValidity(pageText)
        if (validityEnd) {
          offerRows[offerRows.length - 1].validity_end = validityEnd
          offerRows[offerRows.length - 1].validity_raw = `Ends ${validityEnd}`
        }
        // Extract finance-specific description
        const finDescMatch = html.match(/class="offers_detail_top"[\s\S]*?class="[^"]*txt[^"]*"[^>]*>([\s\S]*?)<\//i)
        if (finDescMatch) {
          const finDesc = finDescMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          if (finDesc.length > 10) offerRows[offerRows.length - 1].description = finDesc.substring(0, 500)
        }
      }
      await new Promise(r => setTimeout(r, 500))
    }
  }

  // 5. Summary
  console.log(`\nPrepared ${offerRows.length} total offers:`)
  const tier1 = offerRows.filter(o => o.source_url === OFFERS_URL)
  const tier2 = offerRows.filter(o => o.source_url !== OFFERS_URL)
  console.log(`  Tier 1 (main): ${tier1.length}`)
  console.log(`  Tier 2 (variants): ${tier2.length}`)
  for (const o of offerRows) {
    const p = o.price_amount ? `$${o.price_amount.toLocaleString()}` : '-'
    const m = o.model_id ? 'linked' : 'NO-MODEL'
    const v = o.validity_end || '-'
    console.log(`  ${o.offer_type.padEnd(10)} | ${o.title.substring(0, 55).padEnd(55)} | ${p.padStart(8)} | ${m} | ends:${v}`)
  }

  // 6. Delete existing Kia offers and insert
  console.log('\nDeleting existing Kia offers...')
  const { error: delErr } = await supabase
    .from('offers')
    .delete()
    .eq('oem_id', OEM_ID)
  if (delErr) console.error('Delete error:', delErr.message)

  console.log(`Inserting ${offerRows.length} offers...`)
  // Insert in batches of 50
  for (let i = 0; i < offerRows.length; i += 50) {
    const batch = offerRows.slice(i, i + 50)
    const { data: inserted, error: insErr } = await supabase
      .from('offers')
      .insert(batch)
      .select('id, title, price_amount')
    if (insErr) {
      console.error(`Insert error (batch ${i}):`, insErr.message)
      process.exit(1)
    }
    console.log(`  Batch ${i}: inserted ${inserted.length} rows`)
  }

  console.log(`\nDone! Inserted ${offerRows.length} Kia offers (${tier1.length} main + ${tier2.length} variant)`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
