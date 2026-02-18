#!/usr/bin/env node
/**
 * Full Kia AU Import: Colors, Pricing, Gallery Images → Supabase
 * 
 * Populates:
 * - product_colors: per-color swatch + hero images
 * - product_pricing: RRP + drive-away per state (standard + premium)
 * - products: updates price_amount, primary_image_r2_key
 * 
 * Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-kia-full.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SB_KEY;
if (!SB_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const headers = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

// ============================================================================
// Color Master Table
// ============================================================================
const COLOR_MAP = {
  '4SS': { name: 'Silky Silver', type: 'metallic' },
  'A2G': { name: 'Adventurous Green', type: 'metallic' },
  'ABP': { name: 'Aurora Black Pearl', type: 'pearl' },
  'ACW': { name: 'Honeydew', type: 'solid' },
  'ACX': { name: 'Yacht Blue', type: 'metallic' },
  'AG3': { name: 'Matcha Green', type: 'metallic' },
  'AG9': { name: 'Interstellar Grey', type: 'metallic' },
  'AGT': { name: 'Interstellar Grey', type: 'metallic' },
  'B3A': { name: 'Neptune Blue', type: 'metallic' },
  'B4U': { name: 'Gravity Blue', type: 'metallic' },
  'BB2': { name: 'Vesta Blue', type: 'metallic' },
  'BEG': { name: 'Signal Red', type: 'solid' },
  'BN4': { name: 'Volcanic Sand Brown', type: 'metallic' },
  'C4S': { name: 'Ceramic Grey', type: 'metallic' },
  'C7A': { name: 'Wolf Grey', type: 'metallic' },
  'C7R': { name: 'Flare Red', type: 'metallic' },
  'CGE': { name: 'Cityscape Green', type: 'metallic' },
  'CR5': { name: 'Runway Red', type: 'metallic' },
  'D2U': { name: 'Astra Blue', type: 'metallic' },
  'DFG': { name: 'Pebble Grey', type: 'matte' },
  'DM4': { name: 'Honeydew', type: 'solid' },
  'DU3': { name: 'Yacht Blue', type: 'metallic' },
  'EBB': { name: 'Frost Blue', type: 'metallic' },
  'EBD': { name: 'Shale Grey', type: 'metallic' },
  'FSB': { name: 'Fusion Black', type: 'metallic' },
  'GLB': { name: 'Glacier', type: 'matte' },
  'HRB': { name: 'Heritage Blue', type: 'metallic' },
  'IEG': { name: 'Iceberg Green', type: 'metallic' },
  'ISG': { name: 'Ivory Silver', type: 'metallic' },
  'KCS': { name: 'Sparkling Silver', type: 'metallic' },
  'KDG': { name: 'Gravity Grey', type: 'metallic' },
  'KLG': { name: 'Steel Grey', type: 'metallic' },
  'M3R': { name: 'Mars Orange', type: 'metallic' },
  'M4B': { name: 'Mineral Blue', type: 'metallic' },
  'M7G': { name: 'Astro Grey', type: 'metallic' },
  'M9Y': { name: 'Milky Beige', type: 'metallic' },
  'NNB': { name: 'Starry Night Black', type: 'pearl' },
  'OVR': { name: 'Magma Red', type: 'metallic' },
  'P2M': { name: 'Panthera Metal', type: 'metallic' },
  'PLU': { name: 'Pluton Blue', type: 'metallic' },
  'R4R': { name: 'Fiery Red', type: 'metallic' },
  'SPB': { name: 'Sporty Blue', type: 'metallic' },
  'SWP': { name: 'Snow White Pearl', type: 'pearl' },
  'TCT': { name: 'Terracotta', type: 'metallic' },
  'UD':  { name: 'Clear White', type: 'solid' },
  'WVB': { name: 'Wave Blue', type: 'metallic' },
};

// Solid colors are typically standard (no extra cost)
const STANDARD_COLORS = new Set(['UD']);

// ============================================================================
// Model configuration
// ============================================================================
const MODELS = {
  'carnival': 'KA4PESP', 'carnival-hybrid': 'SHEV',
  'ev3': 'AIR-SR', 'ev4-sedan': 'AIR', 'ev5': 'AIR-SR',
  'ev6': 'AIR-SR', 'ev6-my24': 'AIR', 'ev9': 'AIR',
  'k4-hatch': 'S', 'k4-sedan': 'S',
  'niro-ev': 'SG2-EV-S', 'niro-hybrid': 'SG2-HEV-S',
  'picanto': 'SP-M', 'seltos': 'S-CVT',
  'sorento': 'S-P', 'sorento-hybrid': 'MQ4PEHFS',
  'sorento-plug-in-hybrid': 'PHEV-A-S',
  'sportage': 'S-P', 'sportage-hev': 'S-HF',
  'stonic': 'S', 'stonic-my25': 'S',
  'tasman': 'DCPUS4x2', 'tasman-dcc': 'DCCS-GPAT', 'tasman-scc': 'S4X2-GPAT',
};

// ============================================================================
// Helpers
// ============================================================================

async function fetchHtml(url) {
  const res = await fetch(url);
  return res.text();
}

function extractColorsFull(html, model, trimCode) {
  // Extract color entries with codes and swatch/hero images
  const flatHtml = html.replace(/\n/g, ' ');
  const colorRegex = /<li\s+class="color_l[^"]*"\s*path="([A-Z0-9]+)"\s*color="[A-Z0-9]+"[^>]*>([\s\S]*?)<\/li>/g;
  const colors = [];
  let match;
  
  while ((match = colorRegex.exec(flatHtml)) !== null) {
    const code = match[1];
    const innerHtml = match[2];
    const info = COLOR_MAP[code] || { name: `Unknown (${code})`, type: 'unknown' };
    
    // Extract swatch image
    const swatchMatch = innerHtml.match(/src="([^"]+)"/);
    const swatchUrl = swatchMatch ? `https://www.kia.com${swatchMatch[1]}` : null;
    
    colors.push({
      code,
      name: info.name,
      type: info.type,
      is_standard: STANDARD_COLORS.has(code),
      swatch_url: swatchUrl,
    });
  }
  
  // Also try to find hero images per color from the trim image paths
  const heroRegex = /value="(\/content\/dam\/kwcms\/au\/en\/images\/shopping-tools\/byo\/[^"]+\.webp)"/g;
  const heroImages = [];
  while ((match = heroRegex.exec(html)) !== null) {
    heroImages.push(`https://www.kia.com${match[1]}`);
  }
  
  return { colors, heroImages };
}

function extractTrims(html) {
  const trimRegex = /label[^>]*path="([^"]*)"[^>]*>([^<]*)/g;
  const trims = [];
  let match;
  while ((match = trimRegex.exec(html)) !== null) {
    trims.push({ code: match[1], name: match[2].trim() });
  }
  return trims;
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers });
  return res.json();
}

async function supabasePost(path, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(data),
  });
  return res.status;
}

async function supabasePatch(path, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data),
  });
  return res.status;
}

// ============================================================================
// Main Import
// ============================================================================

async function main() {
  const stats = { colors: 0, pricing: 0, products: 0, errors: 0, notFound: 0 };
  
  // Load all products
  const allProducts = await supabaseGet('/products?oem_id=eq.kia-au&select=id,external_key,title,meta_json');
  const productsByKey = {};
  const productsById = {};
  for (const p of allProducts) {
    if (p.external_key) productsByKey[p.external_key] = p;
    productsById[p.id] = p;
  }
  console.log(`Loaded ${allProducts.length} Kia AU products\n`);

  // Check if new tables exist
  let hasColorTable = true;
  try {
    const test = await fetch(`${SUPABASE_URL}/rest/v1/product_colors?select=id&limit=0`, { headers });
    if (test.status === 404 || test.status === 406) hasColorTable = false;
    const body = await test.json();
    if (body.code === 'PGRST205') hasColorTable = false;
  } catch { hasColorTable = false; }

  let hasPricingTable = true;
  try {
    const test = await fetch(`${SUPABASE_URL}/rest/v1/product_pricing?select=id&limit=0`, { headers });
    if (test.status === 404 || test.status === 406) hasPricingTable = false;
    const body = await test.json();
    if (body.code === 'PGRST205') hasPricingTable = false;
  } catch { hasPricingTable = false; }

  console.log(`product_colors table: ${hasColorTable ? '✓ exists' : '✗ NOT FOUND - will store in meta_json'}`);
  console.log(`product_pricing table: ${hasPricingTable ? '✓ exists' : '✗ NOT FOUND - will store in meta_json'}\n`);

  // ========================================================================
  // Step 1: Fetch and import colors per model
  // ========================================================================
  for (const [model, firstTrim] of Object.entries(MODELS)) {
    console.log(`\n--- ${model} ---`);
    
    // Get color data
    const colorHtml = await fetchHtml(
      `https://www.kia.com/au/shopping-tools/build-and-price.color.${model}.${firstTrim}.html`
    );
    const { colors } = extractColorsFull(colorHtml, model, firstTrim);
    
    // Get trims
    const trimHtml = await fetchHtml(
      `https://www.kia.com/au/shopping-tools/build-and-price.trim.${model}.html`
    );
    const trims = extractTrims(trimHtml);
    
    // Get hero images per trim (from trim page labels)
    const heroMap = {};
    const heroRegex = /label[^>]*path="([^"]*)"[^>]*value="([^"]*)"/g;
    let hm;
    while ((hm = heroRegex.exec(trimHtml)) !== null) {
      heroMap[hm[1]] = `https://www.kia.com${hm[2]}`;
    }
    
    // For each trim, find the matching product and import colors
    for (const trim of trims) {
      const product = findProduct(productsByKey, model, trim.code);
      if (!product) {
        stats.notFound++;
        continue;
      }

      // Build per-color hero images from the color page
      // Pattern: /byo/{model-slug}/{trim-slug}/kia-{model}-colours-{trim}-{color-name}.webp
      const colorRows = colors.map((c, i) => ({
        product_id: product.id,
        color_code: c.code,
        color_name: c.name,
        color_type: c.type,
        is_standard: c.is_standard,
        price_delta: 0, // Will be set from pricing data
        swatch_url: c.swatch_url,
        hero_image_url: heroMap[trim.code] ? 
          heroMap[trim.code].replace('clear-white', c.name.toLowerCase().replace(/\s+/g, '-')) : null,
        sort_order: i,
      }));

      if (hasColorTable) {
        const status = await supabasePost('/product_colors', colorRows);
        if (status === 201 || status === 200) {
          stats.colors += colorRows.length;
        } else {
          console.log(`  ✗ Colors failed for ${trim.code} (HTTP ${status})`);
          stats.errors++;
        }
      }

      // Also keep meta_json.colours updated for backward compat
      const metaColours = colors.map(c => ({
        code: c.code, name: c.name, type: c.type,
        swatch_url: c.swatch_url,
      }));
      await supabasePatch(`/products?id=eq.${product.id}`, {
        meta_json: { ...(product.meta_json || {}), colours: metaColours },
        updated_at: new Date().toISOString(),
      });
    }
    
    await new Promise(r => setTimeout(r, 100));
  }

  // ========================================================================
  // Step 2: Fetch and import pricing
  // ========================================================================
  console.log('\n\n=== PRICING IMPORT ===\n');
  
  // Get unique car_keys
  const carKeys = new Set();
  for (const p of allProducts) {
    if (p.meta_json?.car_key) carKeys.add(p.meta_json.car_key);
  }
  
  for (const carKey of carKeys) {
    const url = `https://www.kia.com/api/kia_australia/common/trimPrice.selectPriceByTrim?regionCode=NSW&modelCode=${carKey}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (!data.dataInfo?.length) {
      console.log(`  ${carKey}: no pricing data`);
      continue;
    }
    
    const modelData = data.dataInfo[0];
    console.log(`  ${modelData.modelName} (${carKey}): ${modelData.trimInfo.length} trims`);
    
    for (const t of modelData.trimInfo) {
      // Find product by car_key + trim_code
      const product = allProducts.find(p => 
        p.meta_json?.car_key === carKey && p.meta_json?.grade_code === t.trimCode
      );
      
      if (!product) {
        // Try finding by external key pattern
        continue;
      }
      
      const rrp = parseFloat(t.rrpprice) || null;
      const premiumDelta = t.premiumOfferPriceNSW && t.priceOfferNSW ?
        parseFloat(t.premiumOfferPriceNSW) - parseFloat(t.priceOfferNSW) : 0;
      
      if (hasPricingTable) {
        // Insert standard pricing
        const stdPricing = {
          product_id: product.id,
          price_type: 'standard',
          rrp,
          driveaway_nsw: parseFloat(t.priceOfferNSW) || null,
          driveaway_vic: parseFloat(t.priceOfferVIC) || null,
          driveaway_qld: parseFloat(t.priceOfferQLD) || null,
          driveaway_wa: parseFloat(t.priceOfferWA) || null,
          driveaway_sa: parseFloat(t.priceOfferSA) || null,
          driveaway_tas: parseFloat(t.priceOfferTAS) || null,
          driveaway_act: parseFloat(t.priceOfferACT) || null,
          driveaway_nt: parseFloat(t.priceOfferNT) || null,
          price_qualifier: 'driveaway_estimate',
          source_url: `https://www.kia.com/au/shopping-tools/build-and-price.trim.${carKey}.html`,
        };
        await supabasePost('/product_pricing', [stdPricing]);
        
        // Insert premium pricing
        const premPricing = {
          product_id: product.id,
          price_type: 'premium',
          rrp,
          driveaway_nsw: parseFloat(t.premiumOfferPriceNSW) || null,
          driveaway_vic: parseFloat(t.premiumOfferPriceVIC) || null,
          driveaway_qld: parseFloat(t.premiumOfferPriceQLD) || null,
          driveaway_wa: parseFloat(t.premiumOfferPriceWA) || null,
          driveaway_sa: parseFloat(t.premiumOfferPriceSA) || null,
          driveaway_tas: parseFloat(t.premiumOfferPriceTAS) || null,
          driveaway_act: parseFloat(t.premiumOfferPriceACT) || null,
          driveaway_nt: parseFloat(t.premiumOfferPriceNT) || null,
          price_qualifier: 'driveaway_estimate',
          source_url: `https://www.kia.com/au/shopping-tools/build-and-price.trim.${carKey}.html`,
        };
        await supabasePost('/product_pricing', [premPricing]);
        stats.pricing += 2;
      }
      
      // Update product with pricing and premium delta info
      const pricingMeta = {
        rrp,
        offer_price: parseFloat(t.offerPrice) || null,
        driveaway_estimate: parseFloat(t.priceOfferNSW) || null,
        premium_paint_delta: premiumDelta,
        driveaway_by_state: {
          nsw: parseFloat(t.priceOfferNSW) || null,
          vic: parseFloat(t.priceOfferVIC) || null,
          qld: parseFloat(t.priceOfferQLD) || null,
          wa: parseFloat(t.priceOfferWA) || null,
          sa: parseFloat(t.priceOfferSA) || null,
          tas: parseFloat(t.priceOfferTAS) || null,
          act: parseFloat(t.priceOfferACT) || null,
          nt: parseFloat(t.priceOfferNT) || null,
        },
        premium_driveaway_by_state: {
          nsw: parseFloat(t.premiumOfferPriceNSW) || null,
          vic: parseFloat(t.premiumOfferPriceVIC) || null,
          qld: parseFloat(t.premiumOfferPriceQLD) || null,
          wa: parseFloat(t.premiumOfferPriceWA) || null,
          sa: parseFloat(t.premiumOfferPriceSA) || null,
          tas: parseFloat(t.premiumOfferPriceTAS) || null,
          act: parseFloat(t.premiumOfferPriceACT) || null,
          nt: parseFloat(t.premiumOfferPriceNT) || null,
        },
      };

      const updatedMeta = { ...(product.meta_json || {}), ...pricingMeta };
      const patchStatus = await supabasePatch(`/products?id=eq.${product.id}`, {
        price_amount: rrp,
        price_currency: 'AUD',
        price_type: 'RRP',
        meta_json: updatedMeta,
        updated_at: new Date().toISOString(),
      });
      
      if (patchStatus === 204) stats.products++;
      else stats.errors++;
    }
    
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n========================================');
  console.log(`Colors inserted:   ${stats.colors}`);
  console.log(`Pricing inserted:  ${stats.pricing}`);
  console.log(`Products updated:  ${stats.products}`);
  console.log(`Not found:         ${stats.notFound}`);
  console.log(`Errors:            ${stats.errors}`);
  console.log('========================================');
}

function findProduct(productsByKey, model, trimCode) {
  const candidates = [
    `${model}-${trimCode.toLowerCase()}`,
    `${model}-${trimCode}`,
    `new-${model}-${trimCode.toLowerCase()}`,
    `${model}-my25-${trimCode.toLowerCase()}`,
    // Tasman special formats
    `tasman-dual-cab-pick-up-${trimCode.toLowerCase()}`,
    `tasman-dual-cab-chassis-${trimCode.toLowerCase()}`,
    `tasman-single-cab-chassis-${trimCode.toLowerCase()}`,
  ];
  
  for (const key of candidates) {
    if (productsByKey[key]) return productsByKey[key];
  }
  
  // Partial match fallback
  const lc = trimCode.toLowerCase();
  const modelBase = model.replace(/-my24|-my25/g, '');
  for (const [key, p] of Object.entries(productsByKey)) {
    if (key.includes(lc) && key.includes(modelBase)) return p;
  }
  return null;
}

main().catch(console.error);
