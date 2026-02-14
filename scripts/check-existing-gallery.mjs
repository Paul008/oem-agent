import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

async function check() {
  // Get a product that HAS galleryImages in meta_json
  const { data: product } = await supabase
    .from('products')
    .select('title, meta_json')
    .eq('oem_id', 'ford-au')
    .eq('title', 'Transit Custom')
    .single();
  
  console.log('=== Transit Custom (Has Gallery in meta_json) ===\n');
  
  const gallery = product.meta_json?.galleryImages || [];
  console.log(`Gallery images: ${gallery.length}\n`);
  
  // Show first 10 images
  console.log('First 10 gallery images:');
  gallery.slice(0, 10).forEach((img, i) => {
    console.log(`\n${i + 1}. Type: ${img.type}`);
    console.log(`   URL: ${img.url?.substring(0, 100)}`);
    console.log(`   Alt: ${img.alt}`);
    if (img.category) console.log(`   Category: ${img.category}`);
  });
  
  // Check if colors have images
  console.log('\n\n=== Available Colors ===');
  const colors = product.meta_json?.availableColors || [];
  console.log(`Colors: ${colors.length}\n`);
  
  colors.forEach((color, i) => {
    console.log(`${i + 1}. ${color.name} (${color.type})`);
    console.log(`   Price: $${color.price || 0}`);
    console.log(`   Hex: ${color.hex}`);
    if (color.galleryImages) {
      console.log(`   Has gallery: ${color.galleryImages.length} images`);
    }
  });
  
  // Check if any color has its own galleryImages
  const colorsWithGallery = colors.filter(c => c.galleryImages?.length > 0);
  console.log(`\n\nColors with their own galleryImages: ${colorsWithGallery.length}`);
}

check();
