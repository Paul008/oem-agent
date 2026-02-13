/**
 * Populate Ford Images
 * 
 * Extracts hero images from vehiclesmenu.data API and updates database.
 * Also prepares gallery image structure.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FORD_BASE_URL = 'https://www.ford.com.au';

async function populateFordImages() {
  console.log('=== Populating Ford Images ===\n');

  // Fetch vehiclesmenu.data
  console.log('1. Fetching vehiclesmenu.data...');
  const response = await fetch('https://www.ford.com.au/content/ford/au/en_au.vehiclesmenu.data');
  const data = await response.json();

  // Extract all nameplates with images
  const nameplateImages = [];
  for (const category of data) {
    if (category.nameplates) {
      for (const nameplate of category.nameplates) {
        nameplateImages.push({
          name: nameplate.name,
          code: nameplate.code,
          image: nameplate.image,
          imgUrlHeader: nameplate.imgUrlHeader,
          category: category.category,
        });
      }
    }
  }

  console.log(`   Found ${nameplateImages.length} vehicles with images`);

  // Get current Ford products
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au');

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  console.log(`   Found ${products.length} products in database`);

  // Update products with images
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  console.log('\n2. Updating products with hero images...\n');

  for (const np of nameplateImages) {
    // Find matching product
    const product = products.find(p => 
      p.external_key === np.code || 
      p.title === np.name ||
      (np.name.includes('Ranger') && p.title === 'Ranger' && np.name === 'Ranger') ||
      (np.name.includes('Everest') && p.title === 'Everest') ||
      (np.name.includes('Mustang') && p.title.includes('Mustang')) ||
      (np.name.includes('F-150') && p.title === 'F-150')
    );

    if (!product) {
      console.log(`   ⚠️ No product found for ${np.name} (${np.code})`);
      skipped++;
      continue;
    }

    // Build full image URL
    const heroImageUrl = np.image.startsWith('http') 
      ? np.image 
      : `${FORD_BASE_URL}${np.image}`;

    // Build gallery structure (will be populated later)
    const galleryImages = [
      {
        type: 'hero',
        url: heroImageUrl,
        alt: `${np.name} hero image`,
      },
      {
        type: 'exterior',
        url: null, // To be populated
        alt: `${np.name} exterior`,
      },
      {
        type: 'interior',
        url: null, // To be populated
        alt: `${np.name} interior`,
      },
    ];

    // Update product
    const { error: updateError } = await supabase
      .from('products')
      .update({
        primary_image_r2_key: heroImageUrl, // Store URL directly (not R2 key yet)
        gallery_image_count: 1, // Just hero for now
        meta_json: {
          ...product.meta_json,
          heroImage: heroImageUrl,
          heroImageAlt: np.name,
          galleryImages: galleryImages,
          categoryFromApi: np.category,
        },
      })
      .eq('id', product.id);

    if (updateError) {
      console.error(`   ❌ Error updating ${product.title}:`, updateError);
      errors++;
    } else {
      console.log(`   ✅ ${product.title}: ${heroImageUrl.substring(0, 80)}...`);
      updated++;
    }
  }

  // Also update variant products to use parent's hero image
  console.log('\n3. Updating variant products with parent hero images...\n');

  // Re-fetch products to get updated data
  const { data: updatedProducts } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au');

  for (const product of updatedProducts) {
    // Skip if already has image
    if (product.primary_image_r2_key) continue;

    // Find parent product by checking if product title starts with parent name
    let parent = null;
    let parentName = null;
    
    // Check for explicit parent in meta_json
    if (product.meta_json?.parentNameplate) {
      parentName = product.meta_json.parentNameplate;
      parent = updatedProducts.find(p => p.title === parentName);
    }
    
    // If no explicit parent, try matching by title prefix
    if (!parent) {
      const possibleParents = ['Ranger', 'Everest', 'Mustang', 'F-150', 'Tourneo', 'Transit'];
      for (const pp of possibleParents) {
        if (product.title.startsWith(pp + ' ') || product.title === pp) {
          parent = updatedProducts.find(p => p.title === pp);
          if (parent) {
            parentName = pp;
            break;
          }
        }
      }
    }

    if (!parent || !parent.primary_image_r2_key) {
      console.log(`   ⚠️ No parent image for ${product.title}`);
      skipped++;
      continue;
    }

    // Update variant with parent's hero image
    const { error: updateError } = await supabase
      .from('products')
      .update({
        primary_image_r2_key: parent.primary_image_r2_key,
        gallery_image_count: 1,
        meta_json: {
          ...product.meta_json,
          heroImage: parent.primary_image_r2_key,
          heroImageSource: `parent:${parentName}`,
          galleryImages: [
            {
              type: 'hero',
              url: parent.primary_image_r2_key,
              alt: `${product.title} hero image`,
            },
          ],
        },
      })
      .eq('id', product.id);

    if (updateError) {
      console.error(`   ❌ Error updating ${product.title}:`, updateError);
      errors++;
    } else {
      console.log(`   ✅ ${product.title} ← ${parentName}`);
      updated++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  // Final check
  console.log('\n=== Final Image Status ===');
  const { data: finalProducts } = await supabase
    .from('products')
    .select('title, primary_image_r2_key')
    .eq('oem_id', 'ford-au');

  const withImages = finalProducts.filter(p => p.primary_image_r2_key).length;
  console.log(`Products with hero images: ${withImages}/${finalProducts.length} (${Math.round(withImages/finalProducts.length*100)}%)`);

  // Sample output
  console.log('\nSample products with images:');
  finalProducts
    .filter(p => p.primary_image_r2_key)
    .slice(0, 5)
    .forEach(p => console.log(`  ✅ ${p.title}`));
}

populateFordImages();
