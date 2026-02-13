import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Load vehicle codes from JSON
const fordData = JSON.parse(fs.readFileSync('./scripts/ford-vehiclesmenu.json', 'utf-8'));
const codeMap = {};
for (const cat of fordData) {
  for (const np of cat.nameplates || []) {
    codeMap[np.name] = np.code;
  }
}

// Add manual mappings for duplicates/variations
const manualMappings = {
  'Ford F-150': 'F-150-2024',
  'Mustang Mach‑E': 'Mach-E', // Different dash character
  'Ranger XLS': 'Next-Gen_Ranger-test', // Same as Ranger
};

async function updateAndEnrich() {
  console.log('=== Updating Ford Products with Codes & Enriching ===\n');
  
  // Get all Ford products
  const { data: products, error } = await supabase
    .from('products')
    .select('id, title, meta_json')
    .eq('oem_id', 'ford-au');

  if (error) {
    console.error('Error:', error.message);
    return;
  }
  
  console.log(`Found ${products.length} products\n`);
  
  // Step 1: Update all products with codes
  console.log('Step 1: Updating product codes...\n');
  let updated = 0;
  
  for (const product of products) {
    const code = codeMap[product.title] || manualMappings[product.title];
    if (!code) {
      console.log(`  No code for: ${product.title}`);
      continue;
    }
    
    const { error: updateError } = await supabase
      .from('products')
      .update({
        external_key: code,
        meta_json: {
          ...product.meta_json,
          code: code,
        }
      })
      .eq('id', product.id);
    
    if (!updateError) {
      updated++;
      console.log(`  ✅ ${product.title} -> ${code}`);
    }
  }
  
  console.log(`\nUpdated ${updated} products with codes\n`);
  
  // Step 2: Enrich priority models
  console.log('Step 2: Enriching with pricing data...\n');
  
  // Fetch function
  async function fetchPricingData(vehicleCode) {
    try {
      const pricingUrl = `https://www.ford.com.au/content/ford/au/en_au/home/${vehicleCode.toLowerCase().replace(/_/g, '-')}/pricing.data`;
      const response = await fetch(pricingUrl, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-AU,en;q=0.9',
          'Referer': 'https://www.ford.com.au/',
          'Origin': 'https://www.ford.com.au',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        const altUrl = `https://www.ford.com.au/content/ford/au/en_au/home/vehicles/${vehicleCode.toLowerCase().replace(/_/g, '-')}/pricing.data`;
        const altResponse = await fetch(altUrl, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-AU,en;q=0.9',
            'Referer': 'https://www.ford.com.au/',
            'Origin': 'https://www.ford.com.au',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        });
        if (!altResponse.ok) return null;
        return await altResponse.json();
      }
      return await response.json();
    } catch (e) {
      return null;
    }
  }
  
  // Extract functions
  function extractColors(data) {
    const colors = [];
    const colorData = data.colors || data.colours || data.data?.colors || data.paintOptions || data.exteriorColors;
    if (Array.isArray(colorData)) {
      for (const color of colorData) {
        if (typeof color === 'string') {
          colors.push({ name: color, price: 0 });
        } else {
          colors.push({
            name: color.name || color.label || color.colourName,
            code: color.code || color.id,
            hex: color.hex || color.colourHex,
            price: color.price || color.cost || 0,
            type: color.type || (color.isPremium ? 'premium' : color.isMetallic ? 'metallic' : 'standard'),
            swatchImage: color.swatchImage || color.swatch || color.thumbnail || color.image,
            fullImage: color.fullImage || color.vehicleImage,
          });
        }
      }
    }
    return colors;
  }
  
  function extractVariants(data, nameplateName) {
    const variants = [];
    const seriesData = data.series || data.grades || data.trims || data.variants || data.data?.series;
    if (Array.isArray(seriesData)) {
      for (const series of seriesData) {
        const name = series.name || series.title || series.gradeName;
        if (!name) continue;
        variants.push({
          name,
          code: series.code || series.id || `${nameplateName.toLowerCase()}-${name.toLowerCase().replace(/\s+/g, '-')}`,
          description: series.description,
          engine: series.engine || series.powerTrain,
          transmission: series.transmission,
          price: { msrp: series.msrp, driveAway: series.driveAwayPrice },
          features: series.features || [],
        });
      }
    }
    return variants;
  }
  
  function extractGallery(data) {
    const images = [];
    const galleryData = data.gallery || data.images || data.imageGallery || data.vehicleImages || 
                        data.exteriorImages || data.interiorImages || data.mediaGallery;
    if (Array.isArray(galleryData)) {
      for (const img of galleryData) {
        if (typeof img === 'string') {
          images.push({ url: img, type: 'gallery' });
        } else {
          const type = (img.type || img.category || 'gallery').toLowerCase();
          images.push({
            url: img.url || img.src || img.imageUrl,
            thumbnail: img.thumbnail || img.thumbUrl,
            type: type.includes('interior') ? 'interior' : type.includes('exterior') ? 'exterior' : 'gallery',
            category: img.category,
            alt: img.alt || img.description,
          });
        }
      }
    }
    return images;
  }
  
  // Enrich priority models
  const priorityModels = ['Ranger', 'Everest', 'Mustang', 'F-150', 'Transit Custom'];
  let enriched = 0;
  let variantsCreated = 0;
  
  for (const product of products) {
    if (!priorityModels.some(pm => product.title.includes(pm))) continue;
    
    const code = codeMap[product.title] || manualMappings[product.title];
    if (!code) continue;
    
    console.log(`Processing: ${product.title} (${code})`);
    
    const pricingData = await fetchPricingData(code);
    if (!pricingData) {
      console.log(`  ❌ No pricing data`);
      continue;
    }
    
    const colors = extractColors(pricingData);
    const variants = extractVariants(pricingData, product.title);
    const gallery = extractGallery(pricingData);
    
    // Update product
    const { error: updateError } = await supabase
      .from('products')
      .update({
        meta_json: {
          ...product.meta_json,
          enriched: true,
          enrichedAt: new Date().toISOString(),
          availableColors: colors,
          colorCount: colors.length,
          galleryImages: gallery,
          galleryImageCount: gallery.length,
          interiorImages: gallery.filter(img => img.type === 'interior'),
          exteriorImages: gallery.filter(img => img.type === 'exterior'),
          variants: variants,
          variantCount: variants.length,
        },
        variants: variants,
      })
      .eq('id', product.id);
    
    if (updateError) {
      console.log(`  ❌ Update failed: ${updateError.message}`);
      continue;
    }
    
    console.log(`  ✅ ${colors.length} colors, ${gallery.length} images, ${variants.length} variants`);
    enriched++;
    
    // Create variant products
    for (const variant of variants) {
      const variantTitle = `${product.title} ${variant.name}`;
      
      // Check if exists
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('oem_id', 'ford-au')
        .eq('title', variantTitle)
        .single();
      
      if (existing) continue;
      
      const { error: insertError } = await supabase
        .from('products')
        .insert({
          oem_id: 'ford-au',
          external_key: variant.code,
          title: variantTitle,
          subtitle: variant.description,
          body_type: product.meta_json?.category,
          price_amount: variant.price?.driveAway || variant.price?.msrp,
          price_currency: 'AUD',
          price_type: 'driveaway',
          price_raw_string: variant.price?.driveAway ? `$${variant.price.driveAway}` : null,
          fuel_type: variant.engine,
          availability: 'available',
          meta_json: {
            parentNameplate: product.title,
            parentExternalKey: code,
            variantName: variant.name,
            variantCode: variant.code,
            engine: variant.engine,
            transmission: variant.transmission,
            variantFeatures: variant.features,
            availableColors: colors,
            colorCount: colors.length,
          },
          last_seen_at: new Date().toISOString(),
        });
      
      if (!insertError) {
        variantsCreated++;
      }
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Products updated with codes: ${updated}`);
  console.log(`Products enriched: ${enriched}`);
  console.log(`Variant products created: ${variantsCreated}`);
}

updateAndEnrich().catch(console.error);
