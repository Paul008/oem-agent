import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

// Decode base64url
function decodeUrl(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

for (const oemId of ['isuzu-au', 'suzuki-au']) {
  console.log(`\n=== ${oemId} ===`);
  const { data: products } = await sb.from('products').select('id').eq('oem_id', oemId);
  const pids = products.map(p => p.id);
  const { data: colors } = await sb.from('variant_colors')
    .select('id, color_name, hero_image_url, swatch_url')
    .in('product_id', pids)
    .not('hero_image_url', 'is', null)
    .limit(3);

  for (const c of colors) {
    console.log(`\nColor: ${c.color_name}`);
    console.log(`Proxy URL: ${c.hero_image_url}`);
    
    // Decode the origin URL
    const parts = c.hero_image_url.split('/');
    const encoded = parts[parts.length - 1];
    try {
      const origin = decodeUrl(encoded);
      console.log(`Origin URL: ${origin}`);
      
      // Test origin directly
      const r = await fetch(origin, { 
        method: 'HEAD', 
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
      });
      console.log(`Origin status: ${r.status} ${r.headers.get('content-type') || ''}`);
    } catch (e) {
      console.log(`Decode/fetch error: ${e.message}`);
    }

    // Test proxy
    try {
      const r2 = await fetch(c.hero_image_url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      console.log(`Proxy status: ${r2.status}`);
    } catch (e) {
      console.log(`Proxy error: ${e.message}`);
    }
  }
}
