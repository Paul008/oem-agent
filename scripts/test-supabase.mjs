import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

async function test() {
  const { data, error } = await supabase
    .from('products')
    .select('title')
    .eq('oem_id', 'ford-au')
    .limit(3);
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Data:', data.map(p => p.title));
  }
}

test();
