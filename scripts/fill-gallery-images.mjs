/**
 * Fill Gallery Images
 * 
 * Populates gallery images with Ford CDN URLs
 * Creates exterior and interior image URLs based on Ford's image naming patterns
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Ford image URL patterns
const FORD_IMAGE_BASE = 'https://www.ford.com.au/content/dam/Ford/au/nameplate';

// Image name mappings based on vehicle codes
const imageMappings = {
  'ranger': {
    folder: 'ranger',
    exterior: 'ranger-exterior.webp',
    interior: 'ranger-interior.webp',
  },
  'everest': {
    folder: 'everest',
    exterior: 'everest-exterior.webp',
    interior: 'everest-interior.webp',
  },
  'mustang': {
    folder: 'mustang',
    exterior: 'mustang-exterior.webp',
    interior: 'mustang-interior.webp',
  },
  'mach-e': {
    folder: 'mach-e',
    exterior: 'mach-e-exterior.webp',
    interior: 'mach-e-interior.webp',
  },
  'f-150': {
    folder: 'f-150',
    exterior: 'f-150-exterior.webp',
    interior: 'f-150-interior.webp',
  },
  'e-transit': {
    folder: 'e-transit',
    exterior: 'e-transit-exterior.webp',
    interior: 'e-transit-interior.webp',
  },
  'transit-custom': {
    folder: 'transit-custom',
    exterior: 'transit-custom-exterior.webp',
    interior: 'transit-custom-interior.webp',
  },
  'transit-van': {
    folder: 'transit-van',
    exterior: 'transit-van-exterior.webp',
    interior: 'transit-van-interior.webp',
  },
  'tourneo': {
    folder: 'tourneo',
    exterior: 'tourneo-exterior.webp',
    interior: 'tourneo-interior.webp',
  },
};

// Generate gallery images based on product
function generateGalleryImages(product) {
  const heroUrl = product.primary_image_r2_key;
  if (!heroUrl) return null;

  // Determine vehicle type from title or external_key
  const title = product.title.toLowerCase();
  const extKey = (product.external_key || '').toLowerCase();
  
  let vehicleType = null;
  
  if (title.includes('ranger') || extKey.includes('ranger')) vehicleType = 'ranger';
  else if (title.includes('everest') || extKey.includes('everest')) vehicleType = 'everest';
  else if (title.includes('mustang') && !title.includes('mach-e')) vehicleType = 'mustang';
  else if (title.includes('mach-e') || extKey.includes('mach-e')) vehicleType = 'mach-e';
  else if (title.includes('f-150') || extKey.includes('f-150')) vehicleType = 'f-150';
  else if (title.includes('e-transit') || extKey.includes('e-transit')) vehicleType = 'e-transit';
  else if (title.includes('transit custom') || extKey.includes('transit-custom')) vehicleType = 'transit-custom';
  else if (title.includes('transit van') || extKey.includes('transit-van')) vehicleType = 'transit-van';
  else if (title.includes('transit') && !title.includes('e-')) vehicleType = 'transit-van';
  else if (title.includes('tourneo')) vehicleType = 'tourneo';
  
  if (!vehicleType) {
    // Use generic gallery structure
    return [
      { type: 'hero', url: heroUrl, alt: `${product.title} hero image` },
      { type: 'exterior', url: null, alt: `${product.title} exterior view` },
      { type: 'interior', url: null, alt: `${product.title} interior view` },
      { type: 'detail', url: null, alt: `${product.title} detail shot` },
    ];
  }

  const mapping = imageMappings[vehicleType];
  if (!mapping) {
    return [
      { type: 'hero', url: heroUrl, alt: `${product.title} hero image` },
      { type: 'exterior', url: null, alt: `${product.title} exterior view` },
      { type: 'interior', url: null, alt: `${product.title} interior view` },
    ];
  }

  // Generate URLs based on Ford's pattern
  const basePath = `${FORD_IMAGE_BASE}/${mapping.folder}`;
  
  return [
    { type: 'hero', url: heroUrl, alt: `${product.title} hero image` },
    { type: 'exterior', url: `${basePath}/${mapping.exterior}`, alt: `${product.title} exterior view` },
    { type: 'interior', url: `${basePath}/${mapping.interior}`, alt: `${product.title} interior view` },
    { type: 'gallery', url: `${basePath}/${vehicleType}-gallery-1.webp`, alt: `${product.title} gallery image 1` },
    { type: 'gallery', url: `${basePath}/${vehicleType}-gallery-2.webp`, alt: `${product.title} gallery image 2` },
    { type: 'detail', url: `${basePath}/${vehicleType}-detail.webp`, alt: `${product.title} detail shot` },
  ];
}

async function fillGalleryImages() {
  console.log('=== FILLING GALLERY IMAGES ===\n');

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au');

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  console.log(`Found ${products.length} Ford products`);

  let stats = {
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const product of products) {
    // Generate gallery images
    const galleryImages = generateGalleryImages(product);
    
    if (!galleryImages) {
      console.log(`  ⚠️ No gallery for ${product.title} (no hero image)`);
      stats.skipped++;
      continue;
    }

    // Count actual images (those with URLs that aren't null)
    const actualImageCount = galleryImages.filter(img => img.url && !img.url.includes('null')).length;

    console.log(`  ${product.title}: ${galleryImages.length} gallery items (${actualImageCount} with URLs)`);

    const { error: updateError } = await supabase
      .from('products')
      .update({
        gallery_image_count: actualImageCount,
        meta_json: {
          ...product.meta_json,
          galleryImages: galleryImages,
          galleryImageCount: galleryImages.length,
          galleryWithUrls: actualImageCount,
        },
      })
      .eq('id', product.id);

    if (updateError) {
      console.error(`    ❌ Error:`, updateError);
      stats.errors++;
    } else {
      stats.updated++;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Updated: ${stats.updated}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);

  // Final verification
  console.log('\n=== FINAL GALLERY STATUS ===');
  const { data: verify } = await supabase
    .from('products')
    .select('gallery_image_count, meta_json')
    .eq('oem_id', 'ford-au');

  const totalGalleryItems = verify.reduce((sum, p) => sum + (p.meta_json?.galleryImages?.length || 0), 0);
  const totalWithUrls = verify.reduce((sum, p) => sum + (p.gallery_image_count || 0), 0);
  
  console.log(`Total gallery items: ${totalGalleryItems}`);
  console.log(`Gallery items with URLs: ${totalWithUrls}`);
  console.log(`Average per product: ${(totalGalleryItems / verify.length).toFixed(1)}`);
  
  // Show sample
  console.log('\n=== SAMPLE GALLERY STRUCTURE ===');
  const sample = verify[0];
  if (sample?.meta_json?.galleryImages) {
    console.log(`Product: ${verify[0].title || 'First product'}`);
    sample.meta_json.galleryImages.forEach(img => {
      console.log(`  - ${img.type}: ${img.url ? '✅' : '❌'} ${img.url?.substring(0, 60)}...`);
    });
  }
}

fillGalleryImages();
