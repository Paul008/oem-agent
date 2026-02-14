import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

async function investigateGuids() {
  console.log('=== Investigating GPAS GUID Patterns ===\n');
  
  const { data: products, error } = await supabase
    .from('products')
    .select('title, meta_json')
    .eq('oem_id', 'ford-au')
    .ilike('title', 'Ranger%');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const ranger = products.find(p => p.title === 'Ranger');
  if (!ranger) {
    console.log('Ranger not found');
    return;
  }
  
  const gallery = ranger.meta_json?.galleryImages || [];
  console.log('Ranger gallery:', gallery.length, 'images\n');
  
  // Extract GUIDs
  const guids = [];
  gallery.forEach(img => {
    const match = img.url?.match(/guid\/([a-f0-9-]+)/);
    if (match) {
      guids.push({
        guid: match[1],
        type: img.type,
        url: img.url,
      });
    }
  });
  
  // Check for user's GUID
  const userGuid = 'b82ae7ab-b6cb-3d8d-b5f9-bc3c9918edce';
  const found = guids.find(g => g.guid === userGuid);
  console.log(`User mentioned GUID: ${userGuid}`);
  console.log(`Found in our data: ${found ? 'YES' : 'NO'}`);
  if (found) {
    console.log(`Type: ${found.type}`);
    console.log(`URL: ${found.url}\n`);
  } else {
    console.log('\n');
  }
  
  // Check first 15 GUIDs
  console.log('First 15 GUIDs in our data:');
  guids.slice(0, 15).forEach((g, i) => {
    console.log(`${i + 1}. ${g.guid} (${g.type})`);
  });
  
  // Check prefixes
  console.log('\n=== GUID Prefix Analysis ===');
  const prefixes = {};
  guids.forEach(g => {
    const p = g.guid.substring(0, 8);
    prefixes[p] = (prefixes[p] || 0) + 1;
  });
  
  Object.entries(prefixes)
    .sort((a, b) => b[1] - a[1])
    .forEach(([prefix, count]) => {
      console.log(`${prefix}*: ${count}`);
    });
  
  // Check if any GUIDs have similar patterns that might indicate color
  console.log('\n=== Looking for Color-Specific GUIDs ===');
  
  // The user's GUID has prefix "b82ae7ab"
  const userPrefix = userGuid.substring(0, 8);
  console.log(`User GUID prefix: ${userPrefix}`);
  console.log(`Any in our data with same prefix: ${guids.some(g => g.guid.startsWith(userPrefix))}`);
}

investigateGuids();
