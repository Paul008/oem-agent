import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

function decodeUrl(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

const { data: products } = await sb.from('products').select('id').eq('oem_id', 'isuzu-au');
const pids = products.map(p => p.id);
const { data: colors } = await sb.from('variant_colors')
  .select('id, hero_image_url')
  .in('product_id', pids)
  .not('hero_image_url', 'is', null)
  .limit(5);

console.log('Isuzu URL sample:');
for (const c of colors) {
  const parts = c.hero_image_url.split('/');
  const encoded = parts[parts.length - 1];
  const origin = decodeUrl(encoded);
  const hostname = new URL(origin).hostname;
  console.log(`  host: ${hostname}`);
  console.log(`  url:  ${origin.substring(0, 100)}...`);
  
  // Test via proxy
  try {
    const r = await fetch(c.hero_image_url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    console.log(`  proxy: ${r.status}`);
  } catch(e) { console.log(`  proxy: ERR ${e.message}`); }
  console.log();
}
