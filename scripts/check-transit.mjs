import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

async function check() {
  const { data, error } = await supabase
    .from('products')
    .select('title, meta_json')
    .eq('oem_id', 'ford-au')
    .eq('title', 'Transit Custom')
    .single();
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const gallery = data.meta_json?.galleryImages || [];
  console.log('Transit Custom gallery:', gallery.length, 'images\n');
  
  gallery.slice(0, 5).forEach((img, i) => {
    console.log(`${i + 1}. ${img.type}: ${img.url?.substring(0, 80)}`);
  });
  
  // Check for GUIDs
  const guids = gallery.map(img => {
    const match = img.url?.match(/guid\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }).filter(Boolean);
  
  console.log('\nTotal GUIDs:', guids.length);
  
  // Check for user's GUID
  const userGuid = 'b82ae7ab-b6cb-3d8d-b5f9-bc3c9918edce';
  console.log('\nUser GUID in Transit Custom data:', guids.includes(userGuid));
}

check();
