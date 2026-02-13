import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Worker URL - production or dev
const WORKER_URL = process.env.WORKER_URL || 'https://oem-agent.adme-dev.workers.dev';

async function triggerCrawl() {
  console.log('=== Triggering Worker Crawl ===\n');
  console.log(`Worker: ${WORKER_URL}\n`);

  // Get a source page for Ford
  const { data: sourcePages, error } = await supabase
    .from('source_pages')
    .select('*')
    .eq('oem_id', 'ford-au')
    .eq('status', 'active')
    .limit(1);

  if (error || !sourcePages || sourcePages.length === 0) {
    console.error('No source pages found');
    return;
  }

  const page = sourcePages[0];
  console.log(`Crawling: ${page.url}\n`);

  // Try to trigger debug crawl
  try {
    const response = await fetch(`${WORKER_URL}/api/v1/oem-agent/admin/debug-crawl/ford-au`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: page.url }),
    });

    if (!response.ok) {
      console.error(`Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(text);
      return;
    }

    const result = await response.json();
    console.log('Crawl result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

triggerCrawl();
