import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkDiscoveredApis() {
  const { data: apis, error } = await supabase
    .from('discovered_apis')
    .select('*')
    .eq('oem_id', 'ford-au')
    .order('reliability_score', { ascending: false });

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log(`=== Discovered APIs for Ford: ${apis?.length || 0} ===\n`);
  
  for (const api of apis || []) {
    console.log(`URL: ${api.url}`);
    console.log(`  Data Type: ${api.data_type}`);
    console.log(`  Reliability: ${api.reliability_score}`);
    console.log(`  Status: ${api.status}`);
    console.log(`  Call Count: ${api.call_count}`);
    console.log('');
  }
}

checkDiscoveredApis();
