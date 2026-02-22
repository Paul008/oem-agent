import { createClient } from '@supabase/supabase-js'
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const { data: apis } = await sb.from('discovered_apis').select('url, status, data_type, reliability_score, method, schema_json').eq('oem_id', 'nissan-au').order('status')
console.log(`=== Nissan APIs (${apis.length}) ===`)
for (const a of apis) {
  console.log(`  [${a.status}] ${a.reliability_score} ${a.method.padEnd(4)} ${(a.data_type || '').padEnd(12)} ${a.url}`)
}

const { data: products } = await sb.from('products').select('id').eq('oem_id', 'nissan-au')
const { data: models } = await sb.from('vehicle_models').select('id').eq('oem_id', 'nissan-au')
const { data: pricing } = await sb.from('variant_pricing').select('id').in('product_id', (products || []).map(p => p.id))
console.log(`\n=== Nissan Data ===`)
console.log(`  Models:  ${models?.length || 0}`)
console.log(`  Products: ${products?.length || 0}`)
console.log(`  Pricing:  ${pricing?.length || 0}`)

// Show existing schema docs
for (const a of apis) {
  if (a.schema_json) {
    console.log(`\n--- Schema for ${a.url.slice(0, 60)} ---`)
    console.log(JSON.stringify(a.schema_json, null, 2).slice(0, 500))
  }
}
