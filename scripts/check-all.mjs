import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

async function check() {
  const { data: products, error } = await supabase
    .from('products')
    .select('title, gallery_image_count, meta_json')
    .eq('oem_id', 'ford-au')
    .order('gallery_image_count', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Top 10 by gallery count:\n');
  products.forEach(p => {
    const galleryInMeta = p.meta_json?.galleryImages?.length || 0;
    console.log(`${p.title}: count=${p.gallery_image_count}, meta=${galleryInMeta}`);
  });
}

check();
