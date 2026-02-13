/**
 * Check Ford products in database
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function checkFordProducts() {
  console.log('Querying Ford products from database...\n');

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au')
    .order('title');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${products.length} products:\n`);

  for (const p of products) {
    console.log(`- ${p.title}`);
    console.log(`  ID: ${p.id}`);
    console.log(`  External Key: ${p.external_key || 'N/A'}`);
    console.log(`  Body Type: ${p.body_type || 'N/A'}`);
    console.log(`  Price: ${p.price_amount || 'N/A'}`);
    console.log(`  Variants: ${p.variants?.length || 0}`);
    console.log(`  Features: ${p.key_features?.length || 0}`);
    console.log(`  Last seen: ${p.last_seen_at}`);
    console.log('');
  }

  // Check for duplicates by title
  const titles = products.map(p => p.title);
  const duplicates = titles.filter((item, index) => titles.indexOf(item) !== index);
  if (duplicates.length > 0) {
    console.log('\n⚠️  Duplicate titles found:', [...new Set(duplicates)]);
  }

  // Check unique titles
  const uniqueTitles = [...new Set(titles)];
  console.log(`\nUnique titles: ${uniqueTitles.length}`);
  console.log('Unique titles list:', uniqueTitles.join(', '));
}

checkFordProducts();
