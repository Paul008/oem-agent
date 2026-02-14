/**
 * Fix Ford products database - remove duplicates and re-extract
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function fixFordDatabase() {
  console.log('Fixing Ford database...\n');

  // Get all Ford products
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', 'ford-au');

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  // Find duplicates
  const toDelete = [];

  // 1. Delete "Ranger XLS" - it's a variant that shouldn't be a separate product
  const rangerXls = products.find(p => p.title === 'Ranger XLS');
  if (rangerXls) {
    console.log(`Found duplicate: Ranger XLS (ID: ${rangerXls.id})`);
    toDelete.push(rangerXls.id);
  }

  // 2. Delete "Ford F-150" - duplicate of "F-150"
  const fordF150 = products.find(p => p.title === 'Ford F-150');
  if (fordF150) {
    console.log(`Found duplicate: Ford F-150 (ID: ${fordF150.id})`);
    toDelete.push(fordF150.id);
  }

  // 3. Find Mustang Mach-E duplicates (Unicode hyphen difference)
  const machEs = products.filter(p => p.title.includes('Mach'));
  if (machEs.length > 1) {
    console.log(`Found ${machEs.length} Mustang Mach-E entries:`);
    machEs.forEach(m => {
      const codes = m.title.split('').map(c => c.charCodeAt(0).toString(16));
      console.log(`  - "${m.title}" (char codes: ${codes.join(' ')})`);
    });
    // Keep the one with regular hyphen, delete the one with non-breaking hyphen
    const withNbsp = machEs.find(m => m.title.includes('\u2011'));
    if (withNbsp) {
      console.log(`  -> Will delete: ${withNbsp.title} (non-breaking hyphen)`);
      toDelete.push(withNbsp.id);
    }
  }

  console.log(`\nWill delete ${toDelete.length} duplicate products`);

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .in('id', toDelete);

    if (deleteError) {
      console.error('Error deleting products:', deleteError);
      return;
    }
    console.log('Successfully deleted duplicates');
  }

  // Now let's also check what's missing from the 23 Ford API vehicles
  console.log('\n--- Checking for missing vehicles ---');

  const fordApiVehicles = [
    'Ranger', 'Ranger Raptor', 'Ranger Hybrid', 'Ranger Super Duty',
    'F-150',
    'Tourneo', 'Tourneo Custom',
    'Transit Custom', 'Transit Custom Trail', 'Transit Van', 'Transit Bus', 'Transit Cab Chassis',
    'Everest',
    'Mustang', 'Mustang Mach-E',
    'E-Transit', 'E-Transit Custom', 'Transit Custom PHEV'
  ];

  const existingTitles = products.map(p => p.title);
  const missing = fordApiVehicles.filter(v => !existingTitles.includes(v));

  if (missing.length > 0) {
    console.log(`Missing ${missing.length} vehicles:`, missing);
  } else {
    console.log('All expected vehicles are present (accounting for duplicates removed)');
  }

  // Check final count
  const { count, error: countError } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('oem_id', 'ford-au');

  console.log(`\nFinal product count: ${count || 'error'}`);
}

fixFordDatabase();
