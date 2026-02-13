import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Check api_call_logs for ford-au to see if there's been a successful call
  const { data: logs, error } = await supabase
    .from('api_call_logs')
    .select('*, discovered_apis!inner(url, data_type)')
    .eq('oem_id', 'ford-au')
    .eq('success', true)
    .order('created_at', { ascending: false })
    .limit(5);
    
  console.log('=== Successful API Calls for ford-au ===');
  if (logs && logs.length > 0) {
    for (const log of logs) {
      console.log(`URL: ${log.discovered_apis?.url}`);
      console.log(`Data Type: ${log.discovered_apis?.data_type}`);
      console.log(`Items Extracted: ${log.items_extracted}`);
      console.log(`Response Hash: ${log.response_hash}`);
      console.log(`Created: ${log.created_at}`);
      console.log('---');
    }
  } else {
    console.log('No successful API calls found');
  }
  if (error) console.error('Error:', error.message);
}

check().catch(console.error);
