import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

async function check() {
  const { data, error } = await supabase
    .from('products')
    .select('title, gallery_image_count, meta_json')
    .eq('oem_id', 'ford-au')
    .eq('title', 'Ranger')
    .single();
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Title:', data?.title);
  console.log('Gallery count column:', data?.gallery_image_count);
  console.log('Meta galleryImages count:', data?.meta_json?.galleryImages?.length);
  
  if (data?.meta_json?.galleryImages) {
    console.log('\nFirst 5 gallery images:');
    data.meta_json.galleryImages.slice(0, 5).forEach((img, i) => {
      console.log(`${i + 1}. ${img.type}: ${img.url?.substring(0, 80)}...`);
    });
  }
}

check();
