import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const { data, error } = await supabase.from('offers').select('id, title, external_key, price_amount, saving_amount, applicable_models').eq('oem_id', 'gwm-au').order('title')

if (error) { console.error('Error:', error); process.exit(1) }
if (!data || data.length === 0) { console.log('No GWM offers found.'); process.exit(0) }

for (const o of data) {
  console.log(`${o.id} | ${o.title} | ext=${o.external_key} | price=${o.price_amount} | save=${o.saving_amount} | models=${o.applicable_models}`)
}
console.log(`\nTotal: ${data.length}`)
