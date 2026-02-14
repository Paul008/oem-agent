/**
 * Fix Gallery URLs - Remove Non-Existent URLs
 * 
 * The hero images from Ford CDN are real, but the exterior/interior
 * URLs we generated are 404. This script fixes the gallery to only
 * include verified working URLs (the hero images).
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fixGalleryUrls() {
  console.log('=== FIXING GALLERY URLS ===\n');
  console.log('Removing non-existent exterior/interior URLs...\n');

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${products.length} products`);

  let fixed = 0;
  let errors = 0;

  for (const product of products) {
    const gallery = product.meta_json?.galleryImages || [];
    
    // Keep only hero image (which has real URL)
    // Set exterior/interior/gallery/detail URLs to null (placeholders)
    const fixedGallery = gallery.map(img => {
      if (img.type === 'hero') {
        return img; // Keep hero URL
      }
      // Clear non-hero URLs (they're 404)
      return {
        ...img,
        url: null,
        note: 'URL placeholder - image not available',
      };
    });

    // Count actual valid URLs
    const validUrls = fixedGallery.filter(img => img.url).length;

    const { error: updateError } = await supabase
      .from('products')
      .update({
        gallery_image_count: validUrls,
        meta_json: {
          ...product.meta_json,
          galleryImages: fixedGallery,
          galleryNote: 'Only hero images are verified. Exterior/interior images are placeholders.',
        },
      })
      .eq('id', product.id);

    if (updateError) {
      console.error(`  ❌ ${product.title}:`, updateError.message);
      errors++;
    } else {
      console.log(`  ✅ ${product.title}: ${validUrls} valid image(s)`);
      fixed++;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Fixed: ${fixed}`);
  console.log(`Errors: ${errors}`);

  // Final stats
  const { data: verify } = await supabase
    .from('products')
    .select('gallery_image_count')
    .eq('oem_id', 'ford-au');

  const totalValid = verify.reduce((sum, p) => sum + (p.gallery_image_count || 0), 0);
  console.log(`\nTotal valid gallery images: ${totalValid}`);
  console.log(`Average per product: ${(totalValid / verify.length).toFixed(1)}`);
}

fixGalleryUrls();
