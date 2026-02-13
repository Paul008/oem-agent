import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchFordPricingData(vehicleCode) {
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
  } catch (error) {
    console.log(`    Error:`, error.message);
    return null;
  }
}

function extractColorsFromData(data) {
  const colors = [];
  const colorData = data.colors || data.colours || data.data?.colors || data.paintOptions ||
                    data.exteriorColors || data.colorSwatches || data.vehicleColors;

  if (Array.isArray(colorData)) {
    for (const color of colorData) {
      if (typeof color === 'string') {
        colors.push({ name: color, price: 0 });
        continue;
      }
      colors.push({
        name: color.name || color.label || color.colourName,
        code: color.code || color.id,
        hex: color.hex || color.colourHex || color.rgb,
        price: color.price || color.cost || 0,
        type: color.type || (color.isPremium ? 'premium' : color.isMetallic ? 'metallic' : 'standard'),
        swatchImage: color.swatchImage || color.swatch || color.thumbnail || color.image,
        fullImage: color.fullImage || color.vehicleImage,
      });
    }
  }
  return colors;
}

function extractVariantsFromData(data, nameplateName) {
  const variants = [];
  const seriesData = data.series || data.grades || data.trims || data.variants ||
                     data.data?.series || data.data?.grades || data.filterData?.series;

  if (Array.isArray(seriesData)) {
    for (const series of seriesData) {
      const variantName = series.name || series.title || series.gradeName;
      if (!variantName) continue;

      variants.push({
        name: variantName,
        code: series.code || series.id || `${nameplateName.toLowerCase()}-${variantName.toLowerCase().replace(/\s+/g, '-')}`,
        description: series.description,
        engine: series.engine || series.powerTrain,
        transmission: series.transmission,
        price: {
          msrp: series.msrp || series.price,
          driveAway: series.driveAwayPrice || series.driveawayPrice,
        },
        features: series.features || [],
      });
    }
  }
  return variants;
}

function extractGalleryImagesFromData(data) {
  const images = [];
  const galleryData = data.gallery || data.images || data.imageGallery ||
                      data.vehicleImages || data.exteriorImages || data.interiorImages ||
                      data.mediaGallery || data.photoGallery;

  if (Array.isArray(galleryData)) {
    for (const img of galleryData) {
      if (typeof img === 'string') {
        images.push({ url: img, type: 'gallery' });
        continue;
      }
      const imageType = img.type || img.category || 'gallery';
      images.push({
        url: img.url || img.src || img.imageUrl,
        thumbnail: img.thumbnail || img.thumbUrl,
        type: imageType.toLowerCase().includes('interior') ? 'interior' : 
              imageType.toLowerCase().includes('exterior') ? 'exterior' : 'gallery',
        category: img.category,
        alt: img.alt || img.description,
      });
    }
  }

  const interiorData = data.interiorImages || data.interiorGallery || data.cockpitImages;
  if (Array.isArray(interiorData)) {
    for (const img of interiorData) {
      const url = typeof img === 'string' ? img : (img.url || img.src);
      if (!images.some((i) => i.url === url)) {
        images.push({
          url: url,
          type: 'interior',
          category: typeof img === 'object' ? img.category : 'interior',
          alt: typeof img === 'object' ? (img.alt || img.description) : null,
        });
      }
    }
  }

  return images;
}

async function enrichFordProducts() {
  console.log('=== Enriching Ford Products ===\n');

  // Get all Ford products
  const { data: products, error } = await supabase
    .from('products')
    .select('id, title, external_key, meta_json')
    .eq('oem_id', 'ford-au');

  if (error) {
    console.error('Error fetching products:', error.message);
    return;
  }

  console.log(`Found ${products.length} Ford products\n`);

  // Priority models to enrich
  const priorityModels = ['Ranger', 'Everest', 'Mustang', 'F-150', 'Transit Custom', 'Tourneo'];
  const productsToEnrich = products.filter(p => 
    priorityModels.some(pm => p.title.includes(pm))
  );

  console.log(`Enriching ${productsToEnrich.length} priority models...\n`);

  let enriched = 0;
  let failed = 0;
  let variantProductsCreated = 0;

  for (const product of productsToEnrich) {
    console.log(`Processing: ${product.title}`);
    
    // Use meta_json.code as the vehicle code for API lookup
    const vehicleCode = product.meta_json?.code || product.external_key;
    if (!vehicleCode) {
      console.log(`  ❌ No vehicle code available`);
      failed++;
      continue;
    }
    
    const pricingData = await fetchFordPricingData(vehicleCode);
    
    if (!pricingData) {
      console.log(`  ❌ No pricing data available`);
      failed++;
      continue;
    }

    const colors = extractColorsFromData(pricingData);
    const variants = extractVariantsFromData(pricingData, product.title);
    const galleryImages = extractGalleryImagesFromData(pricingData);

    // Update the base product
    const { error: updateError } = await supabase
      .from('products')
      .update({
        meta_json: {
          ...product.meta_json,
          enriched: true,
          enrichedAt: new Date().toISOString(),
          availableColors: colors,
          colorCount: colors.length,
          galleryImages: galleryImages,
          galleryImageCount: galleryImages.length,
          interiorImages: galleryImages.filter(img => img.type === 'interior'),
          exteriorImages: galleryImages.filter(img => img.type === 'exterior'),
          variants: variants,
          variantCount: variants.length,
        },
        variants: variants,
      })
      .eq('id', product.id);

    if (updateError) {
      console.log(`  ❌ Update failed:`, updateError.message);
      failed++;
      continue;
    }

    console.log(`  ✅ Updated with ${colors.length} colors, ${galleryImages.length} images, ${variants.length} variants`);
    enriched++;

    // Create variant products if we have variants
    if (variants.length > 0) {
      for (const variant of variants) {
        const variantTitle = `${product.title} ${variant.name}`;
        
        // Check if variant already exists
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('oem_id', 'ford-au')
          .eq('title', variantTitle)
          .single();
        
        if (existing) {
          continue; // Skip if exists
        }

        const { error: insertError } = await supabase
          .from('products')
          .insert({
            oem_id: 'ford-au',
            external_key: variant.code,
            title: variantTitle,
            subtitle: variant.description,
            body_type: product.meta_json?.bodyType || product.meta_json?.category,
            price_amount: variant.price?.driveAway || variant.price?.msrp,
            price_currency: 'AUD',
            price_type: 'driveaway',
            price_raw_string: variant.price?.driveAway ? `$${variant.price.driveAway}` : null,
            fuel_type: variant.engine,
            availability: 'available',
            meta_json: {
              parentNameplate: product.title,
              parentExternalKey: product.external_key,
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
          variantProductsCreated++;
        }
      }
      
      if (variantProductsCreated > 0) {
        console.log(`    ➕ Created ${variantProductsCreated} variant products`);
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Products enriched: ${enriched}`);
  console.log(`Failed: ${failed}`);
  console.log(`Variant products created: ${variantProductsCreated}`);
}

enrichFordProducts().catch(console.error);
