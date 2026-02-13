import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Check if there's any stored response data
  const { data: apis } = await supabase
    .from('discovered_apis')
    .select('url, sample_request_body, sample_response_hash, schema_json, data_type')
    .eq('oem_id', 'ford-au')
    .eq('data_type', 'products');
    
  console.log('=== Ford AU Product APIs ===');
  for (const api of (apis || [])) {
    console.log('URL:', api.url);
    console.log('Schema:', JSON.stringify(api.schema_json, null, 2));
    console.log('Response hash:', api.sample_response_hash);
  }
}

check().catch(console.error);
