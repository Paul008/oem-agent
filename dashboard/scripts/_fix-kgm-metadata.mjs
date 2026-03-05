/**
 * Fix KGM banner CTA links and per-slide disclaimers.
 * Run: cd dashboard && node scripts/_fix-kgm-metadata.mjs
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const BASE = 'https://www.kgm.com.au'

// Per-slide metadata — position-indexed
const slideMeta = [
  {
    link: '/models/musso',
    disclaimer: 'Offer available on MY26 Musso vehicles. Metallic paint $700 extra. Offer available for a limited time and while stocks last. Stock availability may vary between dealers. Ultimate XLV Pack model shown.',
  },
  {
    link: '/models/musso-ev',
    disclaimer: 'KGM Australia will pay the cost of an EVNEX 7kW E2 Core charger for customers who purchase a Torres EVX or Musso EV before 31/03/2026. Offer subject to charger availability.',
  },
  {
    link: '/models/rexton',
    disclaimer: 'Offer available on MY26 Rexton vehicles. Metallic paint $700 extra. Offer available for a limited time and while stocks last. Stock availability may vary between dealers. Ultimate Sports Pack model shown.',
  },
  {
    link: '/models/actyon',
    disclaimer: 'Offer available on MY26 Actyon vehicles. Metallic paint $700 extra. Saving is based on the Recommended Retail Price and is available for a limited time and while stocks last.',
  },
  {
    link: '/models/torres',
    disclaimer: 'Offer available on MY25 Torres vehicles. MY25 Torres Ultimate shown. Metallic paint $700 extra. Saving is based on the Recommended Retail Price.',
  },
  {
    link: '/models/torres',
    disclaimer: 'Offer available on MY26 Torres Hybrid vehicles. Metallic paint $700 extra. Saving is based on the Recommended Retail Price.',
  },
  {
    link: '/models/torres',
    disclaimer: 'KGM Australia will pay the cost of an EVNEX 7kW E2 Core charger for customers who purchase a Torres EVX or Musso EV before 31/03/2026.',
  },
  {
    link: '/models/korando',
    disclaimer: 'Offer available on MY23 Korando Ultimate Limited vehicles. Metallic paint $700 extra. Saving is based on the Recommended Retail Price.',
  },
]

async function main() {
  const { data: banners } = await sb.from('banners')
    .select('*')
    .eq('oem_id', 'kgm-au')
    .order('position')

  console.log(`KGM banners: ${banners.length}\n`)

  for (const b of banners) {
    const meta = slideMeta[b.position]
    if (!meta) continue

    const updates = {
      cta_url: BASE + meta.link,
      cta_text: 'View Model',
      sub_headline: meta.disclaimer,
    }

    const { error } = await sb.from('banners').update(updates).eq('id', b.id)
    if (error) {
      console.error(`Error updating [${b.position}]: ${error.message}`)
    } else {
      console.log(`[${b.position}] "${b.headline}" → ${meta.link}`)
      console.log(`    Disclaimer: ${meta.disclaimer.substring(0, 70)}...`)
    }
  }

  console.log('\nDone.')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
