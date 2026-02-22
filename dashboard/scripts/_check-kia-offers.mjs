import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(import.meta.dirname, '../../.env'), quiet: true })

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Check existing kia offers
const { data: offers } = await sb.from('offers').select('*').eq('oem_id', 'kia-au').order('title')
console.log(`\nExisting Kia offers: ${offers?.length || 0}`)
for (const o of (offers || [])) {
  console.log(`  ${o.title} | type=${o.offer_type} | price=$${o.price_amount || '-'} | img=${o.hero_image_r2_key ? 'yes' : 'no'} | model_id=${o.model_id || '-'}`)
}

// Check kia vehicle models
const { data: models } = await sb.from('vehicle_models').select('id, slug, name').eq('oem_id', 'kia-au').order('slug')
console.log(`\nKia vehicle models: ${models?.length || 0}`)
for (const m of models) {
  console.log(`  ${m.slug} \u2014 ${m.name} (${m.id})`)
}
