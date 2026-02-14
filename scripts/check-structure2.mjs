import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

async function check() {
  const { data: products, error } = await supabase
    .from('products')
    .select('title, meta_json, variants')
    .eq('oem_id', 'ford-au');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('=== Current Data Structure ===\n');
  console.log(`Total Ford products: ${products.length}`);
  
  // Filter products with meta_json data
  const withData = products.filter(p => p.meta_json && Object.keys(p.meta_json).length > 0);
  console.log(`Products with meta_json: ${withData.length}\n`);
  
  // Sample Transit Custom
  const transit = withData.find(p => p.title === 'Transit Custom');
  if (transit) {
    console.log(`=== ${transit.title} ===`);
    console.log('Meta keys:', Object.keys(transit.meta_json).join(', '));
    
    const gallery = transit.meta_json.galleryImages || [];
    const colors = transit.meta_json.availableColors || [];
    
    console.log(`\nGallery: ${gallery.length} images`);
    console.log(`Colors: ${colors.length}`);
    
    if (gallery[0]) {
      console.log('\nGallery image keys:', Object.keys(gallery[0]).join(', '));
    }
    
    if (colors[0]) {
      console.log('Color keys:', Object.keys(colors[0]).join(', '));
    }
    
    // Check if any color has galleryImages
    const colorsWithGallery = colors.filter(c => c.galleryImages?.length > 0);
    console.log(`\nColors with their own gallery: ${colorsWithGallery.length}`);
  }
  
  // Summary across all products
  console.log('\n=== Database Summary ===');
  let totalGallery = 0;
  let totalColors = 0;
  let colorsWithGallery = 0;
  
  withData.forEach(p => {
    totalGallery += p.meta_json?.galleryImages?.length || 0;
    const cols = p.meta_json?.availableColors || [];
    totalColors += cols.length;
    colorsWithGallery += cols.filter(c => c.galleryImages?.length > 0).length;
  });
  
  console.log(`Total gallery images: ${totalGallery}`);
  console.log(`Total color entries: ${totalColors}`);
  console.log(`Colors with their own gallery: ${colorsWithGallery}`);
}

check();
