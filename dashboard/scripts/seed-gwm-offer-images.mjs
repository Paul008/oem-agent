/**
 * Seed GWM offer hero images + ABN pricing from Storyblok car-configurator variants.
 *
 * Each AU variant in Storyblok has an `image` field with a product render,
 * plus driveaway_abn_price and driveaway_retail_price for dual pricing.
 *
 * Run: cd dashboard/scripts && node seed-gwm-offer-images.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const TOKEN = 'rII785g9nG3hemzhYNQvQwtt'
const CV = '1771462289'
const BASE = 'https://api.storyblok.com/v2/cdn/stories'
const HEADERS = { Origin: 'https://www.gwmanz.com', Referer: 'https://www.gwmanz.com/' }
const OEM_ID = 'gwm-au'

// ── Fetch all AU variants from Storyblok ──

async function fetchStoryblokVariants() {
  const variants = []
  let page = 1
  while (true) {
    const url = `${BASE}?starts_with=car-configurator/models/&per_page=100&page=${page}&token=${TOKEN}&cv=${CV}`
    const res = await fetch(url, { headers: HEADERS })
    const json = await res.json()
    if (!json.stories?.length) break
    for (const s of json.stories) {
      if (s.content?.component === 'AUModel') {
        const imageUrl = typeof s.content.image === 'object'
          ? s.content.image?.filename
          : s.content.image
        variants.push({
          slug: s.full_slug,
          name: s.name,
          image: imageUrl || null,
          driveawayAbn: parseFloat(s.content.driveaway_abn_price) || null,
          driveawayRetail: parseFloat(s.content.driveaway_retail_price) || null,
          showOffer: s.content.show_special_offer || false,
        })
      }
    }
    if (json.stories.length < 100) break
    page++
  }
  return variants
}

// ── Normalize name for matching ──

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/\b\d{4}\b/g, '')          // strip year like "2025"
    .replace(/- save \$[\d,]+/gi, '')    // strip "- Save $X,XXX"
    .replace(/driveaway/gi, '')          // strip "Driveaway"
    .replace(/single cc/gi, 'single-cab')
    .replace(/dual cc/gi, 'dual-cab')
    .replace(/\([^)]*\)/g, '')           // strip parenthetical codes
    .replace(/[^a-z0-9]+/g, ' ')        // collapse non-alphanum to space
    .trim()
    .replace(/\s+/g, ' ')
}

// Score how well two normalized names match
function matchScore(offerNorm, variantNorm) {
  if (offerNorm === variantNorm) return 1.0

  const offerWords = offerNorm.split(' ')
  const variantWords = variantNorm.split(' ')
  let matches = 0
  for (const w of offerWords) {
    if (variantWords.includes(w)) matches++
  }
  return matches / Math.max(offerWords.length, variantWords.length)
}

// ── Main ──

async function main() {
  console.log('Fetching Storyblok AU variants...')
  const variants = await fetchStoryblokVariants()
  console.log(`  Found ${variants.length} AU variants`)

  console.log('Fetching GWM offers from Supabase...')
  const { data: offers, error } = await supabase
    .from('offers')
    .select('id, title, price_amount, abn_price_amount, hero_image_r2_key')
    .eq('oem_id', OEM_ID)
    .order('title')
  if (error) throw error
  console.log(`  Found ${offers.length} offers`)

  // Build match table
  const updates = []
  const unmatched = []

  for (const offer of offers) {
    const offerNorm = normalize(offer.title)

    let bestMatch = null
    let bestScore = 0

    for (const v of variants) {
      const vNorm = normalize(v.name)
      const score = matchScore(offerNorm, vNorm)

      // Also boost if driveaway price matches
      const priceMatch = offer.price_amount && v.driveawayAbn
        && Math.abs(offer.price_amount - v.driveawayAbn) < 1
        ? 0.15 : 0

      const total = score + priceMatch
      if (total > bestScore) {
        bestScore = total
        bestMatch = v
      }
    }

    if (bestMatch && bestScore >= 0.5 && bestMatch.image) {
      updates.push({
        offerId: offer.id,
        offerTitle: offer.title,
        variantName: bestMatch.name,
        image: bestMatch.image,
        abnPrice: bestMatch.driveawayAbn,
        retailPrice: bestMatch.driveawayRetail,
        score: bestScore,
        alreadyHasImage: !!offer.hero_image_r2_key,
        alreadyHasAbnPrice: offer.abn_price_amount != null,
      })
    } else {
      unmatched.push({
        title: offer.title,
        bestMatch: bestMatch?.name,
        bestScore: bestScore.toFixed(2),
      })
    }
  }

  console.log(`\nMatched: ${updates.length} / ${offers.length}`)
  console.log('Unmatched:', unmatched.length)

  // Print match table
  console.log('\n── Match Table ──')
  for (const u of updates) {
    const priceDiff = u.retailPrice && u.abnPrice && u.retailPrice !== u.abnPrice
      ? ` | retail=$${u.retailPrice} abn=$${u.abnPrice}`
      : ` | same=$${u.retailPrice || u.abnPrice}`
    console.log(`  ${u.score.toFixed(2)} | ${u.offerTitle} → ${u.variantName}${priceDiff}`)
  }
  if (unmatched.length) {
    console.log('\n── Unmatched ──')
    for (const u of unmatched) {
      console.log(`  ${u.bestScore} | ${u.title} → best: ${u.bestMatch}`)
    }
  }

  // Apply updates — images + ABN pricing + retail pricing from Storyblok
  const toUpdate = updates.filter(u => !u.alreadyHasImage || !u.alreadyHasAbnPrice)
  if (!toUpdate.length) {
    console.log('\nNo updates needed — all matched offers already have images and ABN pricing.')
    return
  }

  console.log(`\nUpdating ${toUpdate.length} offers...`)
  let success = 0
  for (const u of toUpdate) {
    const patch = { updated_at: new Date().toISOString() }
    if (!u.alreadyHasImage) patch.hero_image_r2_key = u.image
    if (u.abnPrice) patch.abn_price_amount = u.abnPrice
    // Also update retail price from Storyblok (more accurate source)
    if (u.retailPrice) patch.price_amount = u.retailPrice

    const { error: upErr } = await supabase
      .from('offers')
      .update(patch)
      .eq('id', u.offerId)
    if (upErr) {
      console.error(`  ✗ ${u.offerTitle}: ${upErr.message}`)
    } else {
      success++
    }
  }

  console.log(`\n✓ Updated ${success} / ${toUpdate.length} offers with images + pricing`)
}

main().catch(console.error)
