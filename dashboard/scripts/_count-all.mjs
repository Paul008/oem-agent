#!/usr/bin/env node
// Count all accessories, models, and joins by OEM

import { createClient } from '@supabase/supabase-js'
const s = createClient('https://nnihmdmsglkxpmilmjjc.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc')

const oems = ['ford-au','gwm-au','hyundai-au','isuzu-au','kgm-au','kia-au','ldv-au','mazda-au','mitsubishi-au','nissan-au','subaru-au','suzuki-au','toyota-au','volkswagen-au']

console.log('=== Accessories by OEM ===')
let totalAcc = 0
for (const oem of oems) {
  const { count } = await s.from('accessories').select('*', { count: 'exact', head: true }).eq('oem_id', oem)
  if (count > 0) {
    console.log(`  ${oem}: ${count}`)
    totalAcc += count
  }
}
console.log(`\nTotal accessories: ${totalAcc}`)

console.log('\n=== Accessory_models ===')
const { count: joinCount } = await s.from('accessory_models').select('*', { count: 'exact', head: true })
console.log(`Total accessory_models: ${joinCount}`)

console.log('\n=== Vehicle models by OEM ===')
let totalModels = 0
for (const oem of oems) {
  const { count } = await s.from('vehicle_models').select('*', { count: 'exact', head: true }).eq('oem_id', oem)
  if (count > 0) {
    console.log(`  ${oem}: ${count}`)
    totalModels += count
  }
}
console.log(`\nTotal vehicle_models: ${totalModels}`)

console.log('\n=== Products / Pricing ===')
const { count: prodCount } = await s.from('products').select('*', { count: 'exact', head: true })
const { count: pricingCount } = await s.from('variant_pricing').select('*', { count: 'exact', head: true })
const { count: colorCount } = await s.from('variant_colors').select('*', { count: 'exact', head: true })
console.log(`Products: ${prodCount}`)
console.log(`Variant pricing: ${pricingCount}`)
console.log(`Variant colors: ${colorCount}`)
