import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get total count
const { count } = await supabase.from('offers').select('*', { count: 'exact', head: true });
console.log('Total offers:', count);

// Get breakdown by OEM
const { data: offers } = await supabase.from('offers').select('oem_id, title, source_url, validity_end, created_at, offer_type, price_amount, saving_amount').order('created_at', { ascending: false }).limit(200);

const byOem = {};
for (const o of offers) {
  byOem[o.oem_id] = byOem[o.oem_id] || [];
  byOem[o.oem_id].push(o);
}

for (const [oem, items] of Object.entries(byOem).sort()) {
  console.log(`\n${oem}: ${items.length} offers`);
  for (const item of items.slice(0, 5)) {
    const price = item.price_amount ? `$${item.price_amount.toLocaleString()}` : 'n/a';
    const saving = item.saving_amount ? ` (save $${item.saving_amount.toLocaleString()})` : '';
    console.log(`  - ${item.title} | ${item.offer_type} ${price}${saving} | ends: ${item.validity_end?.substring(0, 10) || 'n/a'}`);
  }
  if (items.length > 5) console.log(`  ... and ${items.length - 5} more`);
}
