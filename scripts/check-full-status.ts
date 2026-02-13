import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: runs } = await supabase
    .from('import_runs')
    .select('id, started_at, finished_at, status, pages_checked, pages_changed, products_upserted, error_json')
    .eq('oem_id', 'ford-au')
    .order('started_at', { ascending: false })
    .limit(3);
    
  console.log('=== Recent Import Runs for ford-au ===');
  if (runs && runs.length > 0) {
    for (const run of runs) {
      console.log('Run:', run.id.substring(0, 8));
      console.log('  Started:', run.started_at);
      console.log('  Status:', run.status);
      console.log('  Products upserted:', run.products_upserted);
    }
  } else {
    console.log('No import runs found');
  }

  const { data: pages } = await supabase
    .from('source_pages')
    .select('url, page_type, status, last_checked_at')
    .eq('oem_id', 'ford-au')
    .limit(5);
    
  console.log('\n=== Source Pages for ford-au ===');
  for (const page of (pages || [])) {
    console.log(page.url, '-', page.status, '-', page.last_checked_at || 'Never');
  }
}

check().catch(console.error);
