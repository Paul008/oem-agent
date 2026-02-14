import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

async function check() {
  // Get products with data
  const { data: products } = await supabase
    .from('products')
    .select('title, meta_json, variants')
    .eq('oem_id', 'ford-au')
    .not('meta_json', 'is', null);
  
  console.log('=== Current Data Structure ===\n');
  
  // Find products with actual meta_json data
  const withData = products.filter(p => Object.keys(p.meta_json || {}).length > 0);
  console.log(`Products with meta_json data: ${withData.length}/${products.length}\n`);
  
  // Sample a product
  const sample = withData[0];
  console.log(`Sample: ${sample.title}`);
  console.log(`Meta keys: ${Object.keys(sample.meta_json).join(', ')}\n`);
  
  // Check gallery structure
  const gallery = sample.meta_json?.galleryImages || [];
  console.log(`Gallery images: ${gallery.length}`);
  if (gallery.length > 0) {
    console.log('Sample gallery image keys:', Object.keys(gallery[0]).join(', '));
  }
  
  // Check color structure
  const colors = sample.meta_json?.availableColors || [];
  console.log(`\nColors: ${colors.length}`);
  if (colors.length > 0) {
    console.log('Sample color keys:', Object.keys(colors[0]).join(', '));
    
    // Check if any color has galleryImages
    const withColorGallery = colors.filter(c => c.galleryImages?.length > 0);
    console.log(`Colors with galleryImages: ${withColorGallery.length}`);
  }
  
  // Check variants
  console.log(`\nVariants array: ${sample.variants?.length || 0} items`);
  if (sample.variants?.length > 0) {
    console.log('Variant structure:', Object.keys(sample.variants[0]).join(', '));
  }
  
  // Overall summary
  console.log('\n=== Overall Summary ===');
  let totalGalleryImages = 0;
  let totalColors = 0;
  let colorsWithGallery = 0;
  
  withData.forEach(p => {
    totalGalleryImages += p.meta_json?.galleryImages?.length || 0;
    const colors = p.meta_json?.availableColors || [];
    totalColors += colors.length;
    colorsWithGallery += colors.filter(c => c.galleryImages?.length > 0).length;
  });
  
  console.log(`Total gallery images: ${totalGalleryImages}`);
  console.log(`Total colors: ${totalColors}`);
  console.log(`Colors with their own gallery: ${colorsWithGallery}`);
}

check();
