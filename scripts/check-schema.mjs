import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

async function check() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au')
    .eq('title', 'Ranger')
    .single();
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('All columns:', Object.keys(data).join(', '));
  console.log('\nMeta_json keys:', Object.keys(data.meta_json || {}).join(', '));
}

check();
