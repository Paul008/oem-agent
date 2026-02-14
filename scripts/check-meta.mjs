import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

async function check() {
  const { data: products } = await supabase
    .from('products')
    .select('title, gallery_image_count, meta_json')
    .eq('oem_id', 'ford-au')
    .order('gallery_image_count', { ascending: false })
    .limit(10);
  
  console.log('=== Top 10 Products by Gallery Count ===\n');
  
  for (const p of products) {
    const metaKeys = Object.keys(p.meta_json || {});
    const hasGalleryImages = !!(p.meta_json?.galleryImages?.length);
    
    console.log(`${p.title}:`);
    console.log(`  gallery_image_count: ${p.gallery_image_count}`);
    console.log(`  meta_json keys: ${metaKeys.join(', ') || '(empty)'}`);
    console.log(`  has galleryImages: ${hasGalleryImages}`);
    if (hasGalleryImages) {
      console.log(`  galleryImages count: ${p.meta_json.galleryImages.length}`);
    }
    console.log('');
  }
}

check();
