/**
 * Populate Ford inventory into the database
 * Uses the local ford-vehiclesmenu.json and fetches detailed variant data
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required');
  console.error('Set it in your environment or .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface FordVehicle {
  code: string;
  name: string;
  image: string;
  vehicleType: string[];
  bodyType: string[];
  pricing: {
    min: {
      priceVat: string;
    };
  };
  path: string;
  additionalCTA?: string;
  additionalLabel?: string;
  models?: any[];
  attributeItemModels?: any[];
}

interface FordCategory {
  category: string;
  nameplates: FordVehicle[];
}

async function fetchFordPricingData(vehicleCode: string): Promise<any> {
  try {
    // Try the pricing API
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
      // Try alternative URL
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
    console.log(`  Error fetching pricing for ${vehicleCode}:`, (error as Error).message);
    return null;
  }
}

function extractColorsFromData(data: any): any[] {
  const colors: any[] = [];
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

function extractVariantsFromData(data: any, nameplateName: string): any[] {
  const variants: any[] = [];
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

function extractGalleryImagesFromData(data: any): any[] {
  const images: any[] = [];
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

  // Add interior images separately
  const interiorData = data.interiorImages || data.interiorGallery || data.cockpitImages;
  if (Array.isArray(interiorData)) {
    for (const img of interiorData) {
      const url = typeof img === 'string' ? img : (img.url || img.src);
      if (!images.some((i: any) => i.url === url)) {
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

async function populateFordInventory() {
  console.log('=== Populating Ford Inventory ===\n');

  // Load the Ford vehicles data
  const data: FordCategory[] = JSON.parse(
    fs.readFileSync('./scripts/ford-vehiclesmenu.json', 'utf-8')
  );

  console.log(`Found ${data.length} categories`);

  // Get existing products to avoid duplicates
  const { data: existingProducts } = await supabase
    .from('products')
    .select('title')
    .eq('oem_id', 'ford-au');

  const existingTitles = new Set((existingProducts || []).map((p: any) => p.title));
  console.log(`Existing Ford products: ${existingTitles.size}\n`);

  const vehiclesToInsert: any[] = [];
  let enrichedCount = 0;

  // Process each category
  for (const category of data) {
    const catName = category.category;
    console.log(`\nProcessing ${catName}...`);

    for (const np of category.nameplates || []) {
      // Skip duplicates
      if (existingTitles.has(np.name)) {
        console.log(`  Skipping ${np.name} (already exists)`);
        continue;
      }

      // Parse price
      const priceVat = np.pricing?.min?.priceVat || '$0';
      const priceMatch = priceVat.replace(/[$,]/g, '');
      const parsedPrice = parseFloat(priceMatch) || null;

      // Build base product
      const baseProduct: any = {
        oem_id: 'ford-au',
        external_key: np.code,
        source_url: np.path?.startsWith('/') ? `https://www.ford.com.au${np.path}` : np.path,
        title: np.name,
        subtitle: null,
        body_type: catName,
        fuel_type: null,
        availability: 'available',
        price_amount: parsedPrice && parsedPrice > 0 ? parsedPrice : null,
        price_currency: 'AUD',
        price_type: parsedPrice && parsedPrice > 0 ? 'driveaway' : null,
        price_raw_string: priceVat,
        primary_image_url: np.image?.startsWith('/') ? `https://www.ford.com.au${np.image}` : np.image,
        key_features: [],
        variants: [],
        cta_links: np.additionalCTA ? [{ 
          label: np.additionalLabel || 'Build & Price', 
          url: np.additionalCTA 
        }] : [],
        meta_json: {
          category: catName,
          code: np.code,
          vehicleType: np.vehicleType,
          bodyType: np.bodyType,
          imgUrlHeader: np.imgUrlHeader,
          imgAltText: np.imgAltText,
          additionalCategories: np.additionalCategories || [],
        },
        last_seen_at: new Date().toISOString(),
      };

      // Try to fetch detailed data for popular models
      const priorityModels = ['Ranger', 'Everest', 'Mustang', 'F-150', 'Transit Custom'];
      const shouldEnrich = priorityModels.some(pm => np.name.includes(pm));

      if (shouldEnrich) {
        console.log(`  Enriching ${np.name}...`);
        const pricingData = await fetchFordPricingData(np.code);
        
        if (pricingData) {
          enrichedCount++;
          const colors = extractColorsFromData(pricingData);
          const variants = extractVariantsFromData(pricingData, np.name);
          const galleryImages = extractGalleryImagesFromData(pricingData);

          baseProduct.meta_json = {
            ...baseProduct.meta_json,
            enriched: true,
            availableColors: colors,
            colorCount: colors.length,
            galleryImages: galleryImages,
            galleryImageCount: galleryImages.length,
            interiorImages: galleryImages.filter((img: any) => img.type === 'interior'),
            exteriorImages: galleryImages.filter((img: any) => img.type === 'exterior'),
          };

          // If we have variants, create separate product records for each
          if (variants.length > 0) {
            baseProduct.variants = variants;
            
            for (const variant of variants) {
              const variantTitle = `${np.name} ${variant.name}`;
              
              // Skip if variant already exists
              if (existingTitles.has(variantTitle)) {
                continue;
              }

              const variantProduct = {
                ...baseProduct,
                title: variantTitle,
                external_key: variant.code,
                subtitle: variant.description,
                price_amount: variant.price?.driveAway || variant.price?.msrp || baseProduct.price_amount,
                price_raw_string: variant.price?.driveAway ? `$${variant.price.driveAway}` : baseProduct.price_raw_string,
                fuel_type: variant.engine,
                meta_json: {
                  ...baseProduct.meta_json,
                  parentNameplate: np.name,
                  parentExternalKey: np.code,
                  variantName: variant.name,
                  variantCode: variant.code,
                  engine: variant.engine,
                  transmission: variant.transmission,
                  variantFeatures: variant.features,
                },
              };

              vehiclesToInsert.push(variantProduct);
            }
          } else {
            vehiclesToInsert.push(baseProduct);
          }
        } else {
          vehiclesToInsert.push(baseProduct);
        }
      } else {
        vehiclesToInsert.push(baseProduct);
      }
    }
  }

  console.log(`\n=== Inserting ${vehiclesToInsert.length} vehicles ===`);

  // Insert in batches of 10
  const batchSize = 10;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < vehiclesToInsert.length; i += batchSize) {
    const batch = vehiclesToInsert.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('products')
      .insert(batch);

    if (error) {
      console.error(`Batch ${i / batchSize + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`Inserted batch ${i / batchSize + 1}/${Math.ceil(vehiclesToInsert.length / batchSize)} (${batch.length} vehicles)`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total vehicles to insert: ${vehiclesToInsert.length}`);
  console.log(`Successfully inserted: ${inserted}`);
  console.log(`Errors: ${errors}`);
  console.log(`Enriched with details: ${enrichedCount}`);

  // Show breakdown by type
  const byCategory: Record<string, number> = {};
  for (const v of vehiclesToInsert) {
    const cat = v.body_type || 'Unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  console.log(`\nBy Category:`);
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${count}`);
  }
}

// Run the script
populateFordInventory().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
