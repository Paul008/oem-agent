import { createClient } from '@supabase/supabase-js'
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)
const { data } = await sb.from('offers').select('title, price_amount, abn_price_amount').eq('oem_id', 'gwm-au').order('title')
let diff = 0
for (const o of data) {
  const isDiff = Number(o.abn_price_amount) !== Number(o.price_amount)
  if (isDiff) diff++
  console.log(`${o.title} | private=$${o.price_amount} | abn=$${o.abn_price_amount}${isDiff ? ' <<<' : ''}`)
}
console.log(`\nTotal: ${data.length} | Different ABN price: ${diff}`)
