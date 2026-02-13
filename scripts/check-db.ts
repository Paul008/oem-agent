import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Check discovered_apis for ford-au
  const { data: apis, error: apiError } = await supabase
    .from('discovered_apis')
    .select('url, data_type, status, call_count')
    .eq('oem_id', 'ford-au')
    .limit(10);
    
  console.log('=== Discovered APIs for ford-au ===');
  console.log(JSON.stringify(apis, null, 2));
  if (apiError) console.error('API Error:', apiError.message);
  
  // Check products for ford-au
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('title, body_type, price_amount, updated_at')
    .eq('oem_id', 'ford-au')
    .limit(10);
    
  console.log('\n=== Products for ford-au ===');
  console.log(JSON.stringify(products, null, 2));
  if (prodError) console.error('Products Error:', prodError.message);
  
  // Check total counts
  const { count: apiCount } = await supabase
    .from('discovered_apis')
    .select('*', { count: 'exact', head: true });
  const { count: prodCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });
    
  console.log(`\n=== Totals ===`);
  console.log(`Total discovered_apis: ${apiCount}`);
  console.log(`Total products: ${prodCount}`);
}

check().catch(console.error);
