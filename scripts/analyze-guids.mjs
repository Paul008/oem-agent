import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

async function analyze() {
  // Get all Ford products with gallery
  const { data: products } = await supabase
    .from('products')
    .select('title, meta_json')
    .eq('oem_id', 'ford-au');
  
  console.log('=== Analyzing All GPAS GUIDs ===\n');
  
  // Collect all GUIDs
  const allGuids = [];
  products.forEach(p => {
    const gallery = p.meta_json?.galleryImages || [];
    gallery.forEach(img => {
      const match = img.url?.match(/guid\/([a-f0-9-]+)/);
      if (match) {
        allGuids.push({
          guid: match[1],
          vehicle: p.title,
          type: img.type,
        });
      }
    });
  });
  
  console.log(`Total GUIDs across all vehicles: ${allGuids.length}`);
  
  // Check for user's GUID
  const userGuid = 'b82ae7ab-b6cb-3d8d-b5f9-bc3c9918edce';
  const userPrefix = userGuid.substring(0, 8);
  
  console.log(`\nUser's GUID: ${userGuid}`);
  console.log(`User's prefix: ${userPrefix}`);
  
  const matchingByPrefix = allGuids.filter(g => g.guid.startsWith(userPrefix));
  console.log(`\nGUIDs with same prefix: ${matchingByPrefix.length}`);
  matchingByPrefix.forEach(g => {
    console.log(`  - ${g.vehicle}: ${g.guid}`);
  });
  
  // Check if exact GUID exists
  const exactMatch = allGuids.find(g => g.guid === userGuid);
  console.log(`\nExact match: ${exactMatch ? exactMatch.vehicle : 'NOT FOUND'}`);
  
  // Analyze GUID prefixes to understand patterns
  console.log('\n=== GUID Prefix Distribution ===');
  const prefixes = {};
  allGuids.forEach(g => {
    const prefix = g.guid.substring(0, 8);
    if (!prefixes[prefix]) prefixes[prefix] = { count: 0, vehicles: new Set() };
    prefixes[prefix].count++;
    prefixes[prefix].vehicles.add(g.vehicle);
  });
  
  Object.entries(prefixes)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .forEach(([prefix, data]) => {
      console.log(`${prefix}*: ${data.count} images, ${data.vehicles.size} vehicles`);
    });
}

analyze();
