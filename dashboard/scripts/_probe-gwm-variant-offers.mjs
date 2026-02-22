#!/usr/bin/env node

/**
 * Probe GWM variant offers from Storyblok CDN API.
 * Fetches ALL car-configurator variant stories and extracts offer-related fields.
 * Compares with 35 GWM offers in Supabase.
 *
 * Run: cd dashboard/scripts && node _probe-gwm-variant-offers.mjs
 */

const STORYBLOK_API = 'https://api.storyblok.com/v2/cdn/stories';
const TOKEN = 'rII785g9nG3hemzhYNQvQwtt';
const CV = '1771462289';
const HEADERS = {
  'Origin': 'https://www.gwmanz.com',
  'Referer': 'https://www.gwmanz.com/',
};

const SUPABASE_URL = 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc';

// --- Storyblok helpers ---

async function storyblokFetch(params = {}) {
  const qs = new URLSearchParams({
    token: TOKEN,
    cv: CV,
    version: 'published',
    per_page: '100',
    ...params,
  });
  const url = `${STORYBLOK_API}?${qs}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Storyblok ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const total = parseInt(res.headers.get('total') || json.stories?.length || 0, 10);
  return { stories: json.stories || [], total };
}

async function fetchAllVariants() {
  const allStories = [];
  let page = 1;
  let total = Infinity;

  while (allStories.length < total) {
    const result = await storyblokFetch({
      starts_with: 'car-configurator/models/',
      language: 'au',
      page: String(page),
    });
    if (result.stories.length === 0) break;
    allStories.push(...result.stories);
    total = result.total;
    console.log(`  Fetched page ${page}: ${result.stories.length} stories (${allStories.length}/${total} total)`);
    page++;
    await new Promise(r => setTimeout(r, 200));
  }
  return allStories;
}

// --- Supabase helpers ---

async function fetchOffers() {
  const url = `${SUPABASE_URL}/rest/v1/offers?select=id,title,oem_id,price_amount,saving_amount,external_key&oem_id=eq.gwm-au&limit=100`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase offers: ${res.status}`);
  return res.json();
}

// --- Analysis helpers ---

function findOfferFields(content) {
  const result = {};
  if (!content || typeof content !== 'object') return result;
  for (const [key, val] of Object.entries(content)) {
    const lk = key.toLowerCase();
    if (lk.includes('offer') || lk.includes('banner') || lk.includes('image') ||
        lk.includes('hero') || lk.includes('listing') || lk.includes('thumbnail') ||
        lk.includes('driveaway') || lk.includes('price') || lk.includes('special')) {
      result[key] = val;
    }
  }
  return result;
}

function truncate(str, len = 50) {
  if (!str) return '—';
  const s = String(str);
  return s.length > len ? s.slice(0, len) + '...' : s;
}

// --- Main ---

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  GWM Storyblok Variant Offers Probe');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Fetch all variant stories
  console.log('1. Fetching all car-configurator/models/ stories from Storyblok...\n');
  const allStories = await fetchAllVariants();
  console.log(`\n   Total stories fetched: ${allStories.length}`);

  // 2. Filter for AU variants
  const auVariants = allStories.filter(s => {
    const slug = s.full_slug || '';
    return slug.includes('/au/') || slug.endsWith('/au');
  });
  const nonAuStories = allStories.filter(s => !auVariants.includes(s));

  console.log(`   AU variants: ${auVariants.length}`);
  console.log(`   Non-AU / other stories: ${nonAuStories.length}\n`);

  // Component types
  const componentTypes = {};
  for (const s of allStories) {
    const comp = s.content?.component || 'unknown';
    componentTypes[comp] = (componentTypes[comp] || 0) + 1;
  }
  console.log('   Component types:');
  for (const [comp, count] of Object.entries(componentTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${comp}: ${count}`);
  }

  // 3. Detailed analysis of each AU variant
  console.log('\n\n2. Detailed AU Variant Analysis');
  console.log('─'.repeat(80));

  const variantSummaries = [];

  for (const s of auVariants) {
    const c = s.content || {};
    const offerFields = findOfferFields(c);

    console.log(`\n  [${s.full_slug}]`);
    console.log(`    Name: ${s.name}`);
    console.log(`    Component: ${c.component || '?'}`);
    console.log(`    UUID: ${s.uuid}`);

    // Target fields
    const targetFields = {
      image: c.image,
      offer_text_abn: c.offer_text_abn,
      offer_text_retail: c.offer_text_retail,
      show_special_offer: c.show_special_offer,
      special_offer_heading: c.special_offer_heading,
      offer_listing_banner_text: c.offer_listing_banner_text,
      banner_colour: c.banner_colour,
      driveaway_abn_price: c.driveaway_abn_price,
      driveaway_retail_price: c.driveaway_retail_price,
      offer: c.offer,
    };

    for (const [key, val] of Object.entries(targetFields)) {
      if (val !== undefined && val !== null && val !== '' && val !== false) {
        if (Array.isArray(val)) {
          console.log(`    ${key}: [${val.length} items]`);
          if (val.length > 0 && typeof val[0] === 'object') {
            console.log(`      first item keys: ${Object.keys(val[0]).join(', ')}`);
            for (const [ik, iv] of Object.entries(val[0])) {
              if (typeof iv === 'string' && iv.length > 0 && iv.length < 200 && ik !== '_uid') {
                console.log(`        ${ik}: ${iv}`);
              } else if (typeof iv === 'object' && iv !== null) {
                console.log(`        ${ik}: ${JSON.stringify(iv).slice(0, 150)}`);
              }
            }
          }
        } else if (typeof val === 'object') {
          console.log(`    ${key}: ${JSON.stringify(val).slice(0, 200)}`);
        } else {
          console.log(`    ${key}: ${truncate(String(val), 120)}`);
        }
      }
    }

    // Additional offer/banner/image fields not in the target list
    const extraFields = {};
    for (const [key, val] of Object.entries(offerFields)) {
      if (!(key in targetFields) && val !== undefined && val !== null && val !== '' && val !== false) {
        extraFields[key] = val;
      }
    }
    if (Object.keys(extraFields).length > 0) {
      console.log('    --- Extra offer/banner/image fields ---');
      for (const [key, val] of Object.entries(extraFields)) {
        if (typeof val === 'string') {
          console.log(`    ${key}: ${truncate(val, 120)}`);
        } else if (typeof val === 'object') {
          console.log(`    ${key}: ${JSON.stringify(val).slice(0, 200)}`);
        } else {
          console.log(`    ${key}: ${val}`);
        }
      }
    }

    // All content keys for first few variants
    if (variantSummaries.length < 3) {
      console.log(`    --- ALL content keys ---`);
      console.log(`    ${Object.keys(c).join(', ')}`);
    }

    variantSummaries.push({
      slug: s.full_slug,
      name: s.name,
      hasOffer: !!(c.show_special_offer || c.offer_text_abn || (c.offer && c.offer.length > 0)),
      offerText: c.offer_text_abn || c.offer_text_retail || c.special_offer_heading || '',
      image: (c.image && c.image.filename) ? c.image.filename : (typeof c.image === 'string' ? c.image : ''),
      driveawayAbn: c.driveaway_abn_price || '',
      driveawayRetail: c.driveaway_retail_price || '',
      bannerColour: c.banner_colour || '',
      showSpecialOffer: c.show_special_offer || false,
    });
  }

  // 4. Non-AU stories with offers (brief)
  console.log('\n\n3. Non-AU Stories with Offer Data (brief scan)');
  console.log('─'.repeat(80));
  let nonAuWithOffers = 0;
  for (const s of nonAuStories) {
    const c = s.content || {};
    const hasOffer = c.show_special_offer || c.offer_text_abn || (c.offer && c.offer.length > 0);
    if (hasOffer) {
      nonAuWithOffers++;
      if (nonAuWithOffers <= 5) {
        console.log(`  [${s.full_slug}] ${s.name} — offer_text_abn: ${truncate(c.offer_text_abn, 60)}`);
      }
    }
  }
  console.log(`  Total non-AU stories with offers: ${nonAuWithOffers}`);

  // 5. Fetch Supabase offers and compare
  console.log('\n\n4. Supabase Offer Comparison');
  console.log('─'.repeat(80));

  const offers = await fetchOffers();
  console.log(`  Supabase GWM offers: ${offers.length}\n`);

  function normalize(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const matchResults = [];
  for (const offer of offers) {
    const offerNorm = normalize(offer.title);
    let bestMatch = null;
    let bestScore = 0;

    for (const v of variantSummaries) {
      const vNorm = normalize(v.name);
      if (offerNorm.includes(vNorm) || vNorm.includes(offerNorm)) {
        bestMatch = v;
        bestScore = 1.0;
        break;
      }
      const offerWords = offerNorm.split(' ');
      const vWords = vNorm.split(' ');
      const overlap = offerWords.filter(w => vWords.includes(w)).length;
      const score = overlap / Math.max(offerWords.length, vWords.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = v;
      }
    }

    matchResults.push({
      offerTitle: offer.title,
      matched: bestScore >= 0.5,
      matchScore: bestScore,
      variantName: bestMatch?.name || '—',
      variantSlug: bestMatch?.slug || '—',
      hasStoryblokOffer: bestMatch?.hasOffer || false,
      driveawayAbn: bestMatch?.driveawayAbn || '—',
      image: bestMatch?.image || '—',
    });
  }

  // Print match table
  console.log('  ' + 'Offer Title'.padEnd(50) + 'Matched Variant'.padEnd(40) + 'Score  SB-Offer  Driveaway');
  console.log('  ' + '─'.repeat(130));
  for (const m of matchResults.sort((a, b) => b.matchScore - a.matchScore)) {
    const offerStr = truncate(m.offerTitle, 47).padEnd(50);
    const varStr = truncate(m.variantName, 37).padEnd(40);
    const scoreStr = m.matchScore.toFixed(2).padEnd(7);
    const sbOffer = (m.hasStoryblokOffer ? 'YES' : 'no').padEnd(10);
    const driveaway = truncate(m.driveawayAbn, 20);
    console.log(`  ${offerStr}${varStr}${scoreStr}${sbOffer}${driveaway}`);
  }

  // 6. Summary table
  console.log('\n\n5. Full Variant Summary Table');
  console.log('═'.repeat(140));
  console.log(
    '  ' +
    'Variant Name'.padEnd(45) +
    'Has Offer'.padEnd(12) +
    'Offer Text (first 50 chars)'.padEnd(55) +
    'Driveaway ABN'.padEnd(18) +
    'Image'
  );
  console.log('  ' + '─'.repeat(136));

  for (const v of variantSummaries) {
    const name = truncate(v.name, 42).padEnd(45);
    const hasOffer = (v.hasOffer ? 'YES' : 'no').padEnd(12);
    const offerText = truncate(v.offerText, 50).padEnd(55);
    const driveaway = truncate(v.driveawayAbn, 15).padEnd(18);
    const image = truncate(v.image, 60);
    console.log(`  ${name}${hasOffer}${offerText}${driveaway}${image}`);
  }

  // 7. Stats
  const withOffers = variantSummaries.filter(v => v.hasOffer).length;
  const withImages = variantSummaries.filter(v => v.image).length;
  const withDriveaway = variantSummaries.filter(v => v.driveawayAbn).length;

  console.log('\n\n6. Statistics');
  console.log('─'.repeat(60));
  console.log(`  Total AU variants: ${variantSummaries.length}`);
  console.log(`  With offer data: ${withOffers} (${((withOffers / variantSummaries.length) * 100).toFixed(1)}%)`);
  console.log(`  With images: ${withImages} (${((withImages / variantSummaries.length) * 100).toFixed(1)}%)`);
  console.log(`  With driveaway ABN price: ${withDriveaway} (${((withDriveaway / variantSummaries.length) * 100).toFixed(1)}%)`);
  console.log(`  Supabase offers: ${offers.length}`);
  console.log(`  Matched to variants: ${matchResults.filter(m => m.matched).length}`);
  console.log(`  Unmatched offers: ${matchResults.filter(m => !m.matched).length}`);

  const unmatchedOffers = matchResults.filter(m => !m.matched);
  if (unmatchedOffers.length > 0) {
    console.log('\n  Unmatched Supabase offers:');
    for (const m of unmatchedOffers) {
      console.log(`    - ${m.offerTitle} (best match: ${m.variantName}, score: ${m.matchScore.toFixed(2)})`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Done.');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
