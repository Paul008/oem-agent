#!/usr/bin/env node
/**
 * Deep probe of KGM Payload CMS for structured offer data.
 * Targets: /api/pages (offers slug), /api/models, /api/globals
 */

const BASE = 'https://payloadb.therefinerydesign.com/api';
const HEADERS = {
  Accept: 'application/json',
  Origin: 'https://kgm.com.au',
  Referer: 'https://kgm.com.au/',
};

async function fetchJSON(path) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> FETCHING: ${url}`);
  const res = await fetch(url, { headers: HEADERS });
  console.log(`    Status: ${res.status} ${res.statusText}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.log(`    Error body: ${text.slice(0, 500)}`);
    return null;
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    console.log(`    Response is not JSON (${text.slice(0, 80)}...)`);
    return null;
  }
}

function findOfferFields(obj, prefix = '') {
  const results = {};
  if (!obj || typeof obj !== 'object') return results;
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (/offer|discount|bonus|sale|saving|promo|deal|incentive/i.test(key)) {
      results[path] = val;
    }
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      Object.assign(results, findOfferFields(val, path));
    }
    if (Array.isArray(val)) {
      val.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          Object.assign(results, findOfferFields(item, `${path}[${i}]`));
        }
      });
    }
  }
  return results;
}

function findImageFields(obj, prefix = '') {
  const results = {};
  if (!obj || typeof obj !== 'object') return results;
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (/image|hero|photo|thumb|banner|logo|icon|media/i.test(key)) {
      if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('/'))) {
        results[path] = val;
      } else if (typeof val === 'object' && val !== null) {
        if (val.url) results[path + '.url'] = val.url;
        if (val.src) results[path + '.src'] = val.src;
        if (val.filename) results[path + '.filename'] = val.filename;
      }
    }
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      Object.assign(results, findImageFields(val, path));
    }
    if (Array.isArray(val)) {
      val.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          Object.assign(results, findImageFields(item, `${path}[${i}]`));
        }
      });
    }
  }
  return results;
}

async function main() {
  // 1. Offers page
  console.log('\n' + '='.repeat(80));
  console.log('SECTION 1: OFFERS PAGE (/api/pages?where[slug][equals]=offers&depth=5)');
  console.log('='.repeat(80));

  const offersPage = await fetchJSON('/pages?where[slug][equals]=offers&depth=5');
  if (offersPage) {
    console.log('\n--- FULL OFFERS PAGE JSON ---');
    console.log(JSON.stringify(offersPage, null, 2));
  }

  // Also try depth=10 in case nested content is truncated
  const offersPageDeep = await fetchJSON('/pages?where[slug][equals]=offers&depth=10');
  if (offersPageDeep) {
    const deepStr = JSON.stringify(offersPageDeep, null, 2);
    const shallowStr = offersPage ? JSON.stringify(offersPage, null, 2) : '';
    if (deepStr !== shallowStr) {
      console.log('\n--- OFFERS PAGE depth=10 (differs from depth=5) ---');
      console.log(deepStr);
    } else {
      console.log('\n    depth=10 identical to depth=5, skipping.');
    }
  }

  // 2. Models with offer-related fields
  console.log('\n' + '='.repeat(80));
  console.log('SECTION 2: MODELS (/api/models?depth=3&limit=100)');
  console.log('='.repeat(80));

  const modelsData = await fetchJSON('/models?depth=3&limit=100');
  if (modelsData && modelsData.docs) {
    console.log(`\n    Total models: ${modelsData.totalDocs}`);
    for (const model of modelsData.docs) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`MODEL: ${model.name || model.title || model.slug || model.id}`);
      console.log(`  name: ${model.name}`);
      console.log(`  title: ${model.title}`);
      console.log(`  slug: ${model.slug}`);
      console.log(`  abn_discount: ${JSON.stringify(model.abn_discount)}`);
      console.log(`  pricing_offers: ${JSON.stringify(model.pricing_offers, null, 4)}`);

      // Offer-related fields
      const offerFields = findOfferFields(model);
      if (Object.keys(offerFields).length > 0) {
        console.log('  OFFER-RELATED FIELDS:');
        for (const [path, val] of Object.entries(offerFields)) {
          console.log(`    ${path}: ${JSON.stringify(val, null, 4)}`);
        }
      }

      // Image fields (top-level only for brevity)
      console.log(`  car_image: ${model.car_image?.url || 'none'}`);
      console.log(`  banner_image: ${JSON.stringify(model.banner_image)}`);

      // Grade summary
      if (model.grades) {
        for (const g of model.grades) {
          if (typeof g === 'object') {
            console.log(`  GRADE: ${g.name} | price: ${g.price} | year_discount: ${g.year_discount}`);
          }
        }
      }
    }
  }

  // 3. Globals
  console.log('\n' + '='.repeat(80));
  console.log('SECTION 3: GLOBALS');
  console.log('='.repeat(80));

  for (const slug of ['offers', 'promotions', 'site-settings', 'settings', 'header', 'footer', 'navigation']) {
    const g = await fetchJSON(`/globals/${slug}?depth=5`);
    if (g) {
      console.log(`\n--- GLOBAL: ${slug} ---`);
      console.log(JSON.stringify(g, null, 2));
    }
  }

  // 4. Try other collections that might hold offers
  console.log('\n' + '='.repeat(80));
  console.log('SECTION 4: OTHER COLLECTIONS');
  console.log('='.repeat(80));

  for (const collection of ['offers', 'promotions', 'banners', 'campaigns', 'deals', 'specials', 'incentives', 'announcements']) {
    const data = await fetchJSON(`/${collection}?depth=3&limit=100`);
    if (data && data.docs && data.docs.length > 0) {
      console.log(`\n--- COLLECTION: ${collection} (${data.totalDocs} docs) ---`);
      console.log(JSON.stringify(data, null, 2));
    }
  }

  // 5. Known collections summary
  console.log('\n' + '='.repeat(80));
  console.log('SECTION 5: KNOWN COLLECTIONS SUMMARY');
  console.log('='.repeat(80));

  for (const c of ['models', 'grades', 'colours', 'features', 'feature-sets', 'pages', 'media', 'users', 'accessories', 'model-years']) {
    const data = await fetchJSON(`/${c}?limit=0`);
    if (data && typeof data.totalDocs === 'number') {
      console.log(`  ${c}: ${data.totalDocs} docs`);
    }
  }

  // 6. Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`
FINDINGS:
- pages collection: EMPTY (0 docs) — offers page is NOT in Payload CMS
- No dedicated offers/promotions/campaigns collections exist
- Offer data lives on MODEL objects:
  - pricing_offers: array (currently EMPTY on all 8 models)
  - abn_discount: number (negative, e.g. -800, -1000)
  - grades[].year_discount: number or null (currently null or 0 on all grades)
- The kgm.com.au/offers page is likely rendered by the Next.js frontend
  using model data (abn_discount, pricing_offers) or hardcoded in the frontend.
- Available collections: models, grades, colours, features, feature-sets,
  pages, media, users, accessories, model-years
- Image base URL: https://payloadb.therefinerydesign.com
`);

  console.log('='.repeat(80));
  console.log('PROBE COMPLETE');
  console.log('='.repeat(80));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
