import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkKeys() {
  const { data: products, error } = await supabase
    .from('products')
    .select('title, external_key, meta_json')
    .eq('oem_id', 'ford-au')
    .order('title');

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('=== Ford Products Keys ===\n');
  for (const p of products) {
    const code = p.meta_json?.code || 'N/A';
    console.log(`${p.title}:`);
    console.log(`  external_key: ${p.external_key || 'NULL'}`);
    console.log(`  meta_json.code: ${code}`);
  }
}

checkKeys();
