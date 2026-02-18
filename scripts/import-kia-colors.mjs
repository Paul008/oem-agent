#!/usr/bin/env node
/**
 * Import Kia AU color data into Supabase
 * 
 * Fetches color data from Kia build-and-price pages and updates
 * the meta_json.colours field for each product in the database.
 * 
 * Usage: node scripts/import-kia-colors.mjs
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SB_KEY;

if (!SUPABASE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// Master color code → name mapping
const COLOR_MAP = {
  '4SS': 'Silky Silver', 'A2G': 'Adventurous Green', 'ABP': 'Aurora Black Pearl',
  'ACW': 'Honeydew', 'ACX': 'Yacht Blue', 'AG3': 'Matcha Green',
  'AG9': 'Interstellar Grey', 'AGT': 'Interstellar Grey', 'B3A': 'Neptune Blue',
  'B4U': 'Gravity Blue', 'BB2': 'Vesta Blue', 'BEG': 'Signal Red',
  'BN4': 'Volcanic Sand Brown', 'C4S': 'Ceramic Grey', 'C7A': 'Wolf Grey',
  'C7R': 'Flare Red', 'CGE': 'Cityscape Green', 'CR5': 'Runway Red',
  'D2U': 'Astra Blue', 'DFG': 'Pebble Grey', 'DM4': 'Honeydew',
  'DU3': 'Yacht Blue', 'EBB': 'Frost Blue', 'EBD': 'Shale Grey',
  'FSB': 'Fusion Black', 'GLB': 'Glacier', 'HRB': 'Heritage Blue',
  'IEG': 'Iceberg Green', 'ISG': 'Ivory Silver', 'KCS': 'Sparkling Silver',
  'KDG': 'Gravity Grey', 'KLG': 'Steel Grey', 'M3R': 'Mars Orange',
  'M4B': 'Mineral Blue', 'M7G': 'Astro Grey', 'M9Y': 'Milky Beige',
  'NNB': 'Starry Night Black', 'OVR': 'Magma Red', 'P2M': 'Panthera Metal',
  'PLU': 'Pluton Blue', 'R4R': 'Fiery Red', 'SPB': 'Sporty Blue',
  'SWP': 'Snow White Pearl', 'TCT': 'Terracotta', 'UD': 'Clear White',
  'WVB': 'Wave Blue',
};

// Models and their first trim code for color page lookup
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

async function fetchHtml(url) {
  const res = await fetch(url);
  return res.text();
}

function extractColors(html) {
  const colorRegex = /class="color_l[^"]*"\s*path="([A-Z0-9]+)"\s*color="[A-Z0-9]+"/g;
  const codes = new Set();
  let match;
  while ((match = colorRegex.exec(html)) !== null) {
    codes.add(match[1]);
  }
  
  // Also extract swatch URLs per color code
  const colors = [];
  for (const code of codes) {
    const name = COLOR_MAP[code] || `Unknown (${code})`;
    
    // Try to find swatch image
    const swatchRegex = new RegExp(`path="${code}"[^>]*>[\\s\\S]*?<img[^>]*src="([^"]+)"`, 'i');
    const swatchMatch = html.match(swatchRegex);
    const swatchUrl = swatchMatch ? `https://www.kia.com${swatchMatch[1]}` : null;
    
    // Try to find the hero image for this color
    const heroRegex = new RegExp(`colours-[^"]*${name.toLowerCase().replace(/\s+/g, '-')}[^"]*\\.webp`, 'i');
    const heroMatch = html.match(heroRegex);
    
    colors.push({
      code,
      name,
      swatch_url: swatchUrl,
    });
  }
  
  return colors;
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

async function supabasePatch(path, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data),
  });
  return res.status;
}

async function main() {
  let updated = 0;
  let notFound = 0;
  let errors = 0;
  let created = 0;

  // First, get ALL kia-au products from DB
  const allProducts = await supabaseGet('/products?oem_id=eq.kia-au&select=id,external_key,title,meta_json');
  const productsByKey = {};
  for (const p of allProducts) {
    if (p.external_key) {
      productsByKey[p.external_key] = p;
    }
  }
  console.log(`Found ${allProducts.length} Kia AU products in DB\n`);

  for (const [model, firstTrim] of Object.entries(MODELS)) {
    console.log(`\n=== ${model} ===`);
    
    // Fetch color page
    const colorHtml = await fetchHtml(`https://www.kia.com/au/shopping-tools/build-and-price.color.${model}.${firstTrim}.html`);
    const colors = extractColors(colorHtml);
    console.log(`  Colors: ${colors.map(c => c.name).join(', ')}`);
    
    // Fetch trim page to get all trims
    const trimHtml = await fetchHtml(`https://www.kia.com/au/shopping-tools/build-and-price.trim.${model}.html`);
    const trims = extractTrims(trimHtml);
    
    // Also try per-trim color pages in case colors differ by trim
    // For now, use same colors for all trims of a model (typical for most OEMs)
    
    for (const trim of trims) {
      // Try various external_key formats
      const candidates = [
        `${model}-${trim.code.toLowerCase()}`,
        `${model}-${trim.code}`,
        // Handle special cases like "new-" prefix
        `new-${model}-${trim.code.toLowerCase()}`,
        // Handle MY25 suffix patterns
        `${model}-my25-${trim.code.toLowerCase()}`,
      ];
      
      let product = null;
      let matchedKey = null;
      for (const key of candidates) {
        if (productsByKey[key]) {
          product = productsByKey[key];
          matchedKey = key;
          break;
        }
      }
      
      if (!product) {
        // Try partial matching
        for (const [key, p] of Object.entries(productsByKey)) {
          if (key.includes(trim.code.toLowerCase()) && key.includes(model.replace('-my24', '').replace('-my25', ''))) {
            product = p;
            matchedKey = key;
            break;
          }
        }
      }
      
      if (product) {
        // Update meta_json with full color data
        const newMeta = { ...(product.meta_json || {}), colours: colors };
        const status = await supabasePatch(`/products?id=eq.${product.id}`, {
          meta_json: newMeta,
          updated_at: new Date().toISOString(),
        });
        
        if (status === 204) {
          console.log(`  ✓ ${trim.name} (${matchedKey})`);
          updated++;
        } else {
          console.log(`  ✗ ${trim.name} (${matchedKey}) - HTTP ${status}`);
          errors++;
        }
      } else {
        console.log(`  - Not found: ${trim.code} (tried: ${candidates[0]})`);
        notFound++;
      }
    }
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n========================================`);
  console.log(`Updated: ${updated}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors: ${errors}`);
  console.log(`========================================`);
}

main().catch(console.error);
