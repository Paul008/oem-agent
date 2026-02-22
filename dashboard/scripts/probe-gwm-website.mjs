/**
 * Quick probe to find GWM Australia's actual website URL
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const { data: gwm } = await supabase
  .from('oems')
  .select('id, name, website, config_json')
  .eq('id', 'gwm-au')
  .single();

console.log('GWM OEM Data:');
console.log(JSON.stringify(gwm, null, 2));

// Also check products to see URL patterns
const { data: products } = await supabase
  .from('products')
  .select('name, external_key, meta_json')
  .eq('oem_id', 'gwm-au')
  .limit(3);

console.log('\nSample GWM Products:');
console.log(JSON.stringify(products, null, 2));
