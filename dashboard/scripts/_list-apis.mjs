import { createClient } from '@supabase/supabase-js'
const s = createClient('https://nnihmdmsglkxpmilmjjc.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc')

const { data: accs } = await s.from('accessories').select('oem_id')
const { data: joins } = await s.from('accessory_models').select('id')
const { data: models } = await s.from('vehicle_models').select('oem_id')

const accByOem = {}
for (const a of accs || []) {
  accByOem[a.oem_id] = (accByOem[a.oem_id] || 0) + 1
}

const modelsByOem = {}
for (const m of models || []) {
  modelsByOem[m.oem_id] = (modelsByOem[m.oem_id] || 0) + 1
}

console.log('=== Accessories by OEM ===')
for (const [oem, count] of Object.entries(accByOem).sort()) {
  console.log(`  ${oem}: ${count} accessories`)
}
console.log(`\nTotal accessories: ${(accs || []).length}`)
console.log(`Total accessory_models: ${(joins || []).length}`)
console.log(`Total vehicle_models: ${(models || []).length}`)

console.log('\n=== Models by OEM ===')
for (const [oem, count] of Object.entries(modelsByOem).sort()) {
  console.log(`  ${oem}: ${count} models`)
}
