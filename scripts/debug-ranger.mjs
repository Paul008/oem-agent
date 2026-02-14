import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

async function debug() {
  // Get Ranger
  const { data: ranger } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au')
    .eq('title', 'Ranger')
    .single();
  
  console.log('=== Ranger Debug ===');
  console.log('ID:', ranger.id);
  console.log('Title:', ranger.title);
  console.log('Gallery count:', ranger.gallery_image_count);
  console.log('Meta json type:', typeof ranger.meta_json);
  console.log('Meta json is null:', ranger.meta_json === null);
  console.log('Meta json is empty object:', JSON.stringify(ranger.meta_json) === '{}');
  console.log('');
  
  // Check which products have empty meta_json but have gallery count
  const { data: products } = await supabase
    .from('products')
    .select('title, gallery_image_count')
    .eq('oem_id', 'ford-au');
  
  console.log('=== Products with gallery_image_count > 10 ===');
  products.filter(p => p.gallery_image_count > 10).forEach(p => {
    console.log(`${p.title}: ${p.gallery_image_count}`);
  });
  
  // Count how many have empty meta_json
  console.log('\n=== Checking meta_json status ===');
  let emptyMeta = 0;
  let withGalleryInMeta = 0;
  
  for (const p of products) {
    const { data } = await supabase
      .from('products')
      .select('meta_json')
      .eq('id', p.id)
      .single();
    
    if (!data.meta_json || Object.keys(data.meta_json).length === 0) {
      emptyMeta++;
    } else if (data.meta_json?.galleryImages?.length > 0) {
      withGalleryInMeta++;
    }
  }
  
  console.log(`Products with empty meta_json: ${emptyMeta}/${products.length}`);
  console.log(`Products with galleryImages in meta_json: ${withGalleryInMeta}/${products.length}`);
}

debug();
