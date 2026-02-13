import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkProducts() {
  console.log('=== Checking Products After Crawl ===\n');
  
  // Get all Ford products
  const { data: products, error } = await supabase
    .from('products')
    .select('id, title, external_key, body_type, price_amount, created_at, meta_json')
    .eq('oem_id', 'ford-au')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log(`Total Ford products: ${products.length}\n`);
  
  // Show most recent
  console.log('Most recently created/updated:');
  for (const p of products.slice(0, 10)) {
    const created = new Date(p.created_at).toLocaleString();
    console.log(`  ${p.title} (${p.body_type}) - $${p.price_amount || 'N/A'} - ${created}`);
  }
  
  // Check for products with enriched data
  const enriched = products.filter(p => p.meta_json?.enriched);
  console.log(`\nEnriched products: ${enriched.length}`);
  
  // Check for variant products (parentNameplate)
  const variants = products.filter(p => p.meta_json?.parentNameplate);
  console.log(`Variant products: ${variants.length}`);
  if (variants.length > 0) {
    console.log('\nVariants:');
    for (const v of variants) {
      console.log(`  ${v.title} (parent: ${v.meta_json.parentNameplate})`);
    }
  }
}

checkProducts();
