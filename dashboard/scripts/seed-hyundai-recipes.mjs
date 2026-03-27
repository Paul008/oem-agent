/**
 * Seed brand_recipes table with 8 Hyundai AU recipes.
 * Run: node dashboard/scripts/seed-hyundai-recipes.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'hyundai-au'

// Hyundai brand tokens: HyundaiSans font, clean/modern, three sub-systems, #002C5F dark blue
const recipes = [
  {
    oem_id: OEM_ID,
    pattern: 'hero',
    variant: 'image-overlay',
    label: 'Hyundai Hero — Standard',
    resolves_to: 'hero',
    defaults_json: {
      heading_size: '4xl',
      heading_weight: 'bold',
      text_align: 'left',
      overlay_opacity: 0.35,
      min_height: '80vh',
      text_color: '#ffffff',
      overlay_color: '#002C5F',
      font_family: 'HyundaiSans',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'hero',
    variant: 'cinematic',
    label: 'Hyundai Cinematic Hero (IONIQ/N)',
    resolves_to: 'hero',
    defaults_json: {
      heading_size: '5xl',
      heading_weight: 'bold',
      text_align: 'left',
      overlay_opacity: 0,
      min_height: '100vh',
      text_color: '#ffffff',
      font_family: 'HyundaiSans',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'card-grid',
    variant: 'image-title-body',
    label: 'Hyundai Feature Cards (3-col)',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 3,
      gap: '1.5rem',
      card_composition: ['image', 'title', 'body'],
      card_padding: '1.5rem',
      text_align: 'left',
      background_color: '#ffffff',
      shadow: '0 2px 6px rgba(0,0,0,0.06)',
      border_radius: '8px',
      font_family: 'HyundaiSans',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'card-grid',
    variant: 'icon-title-body',
    label: 'Hyundai Feature Icons (3-col)',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 3,
      gap: '2rem',
      card_composition: ['icon', 'title', 'body'],
      card_padding: '2rem',
      text_align: 'center',
      background_color: '#f7f7f7',
      border: 'none',
      shadow: 'none',
      icon_size: '2.5rem',
      font_family: 'HyundaiSans',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'split-content',
    variant: 'text-left-image-right',
    label: 'Hyundai Split — Text + Image',
    resolves_to: 'intro',
    defaults_json: {
      layout: 'text-left',
      gap: '3rem',
      text_width: '50%',
      image_width: '50%',
      vertical_align: 'center',
      section_padding: '80px 0',
      font_family: 'HyundaiSans',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'action-bar',
    variant: 'banner',
    label: 'Hyundai CTA Banner',
    resolves_to: 'cta-banner',
    defaults_json: {
      background_color: '#002C5F',
      text_color: '#ffffff',
      text_align: 'center',
      section_padding: '4rem 2rem',
      button_text: 'Build & Price',
      button_variant: 'primary',
      font_family: 'HyundaiSans',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'data-display',
    variant: 'specs-accordion',
    label: 'Hyundai Specs',
    resolves_to: 'specs-grid',
    defaults_json: {
      expand_first: true,
      show_icons: false,
      border_bottom: true,
      section_padding: '4rem 0',
      background_color: '#ffffff',
      font_family: 'HyundaiSans',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'card-grid',
    variant: 'image-title-cta',
    label: 'Hyundai Model Range (4-col)',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 4,
      gap: '1.5rem',
      card_composition: ['image', 'title', 'cta'],
      card_padding: '1.5rem',
      text_align: 'center',
      background_color: '#ffffff',
      shadow: '0 2px 6px rgba(0,0,0,0.06)',
      border_radius: '8px',
      font_family: 'HyundaiSans',
    },
  },
]

async function main() {
  console.log(`Upserting ${recipes.length} Hyundai brand recipes...`)
  const { data, error } = await supabase
    .from('brand_recipes')
    .upsert(recipes, { onConflict: 'oem_id,pattern,variant' })
    .select('id, pattern, variant, label')

  if (error) {
    console.error('Upsert failed:', error.message)
    process.exit(1)
  }

  console.log(`Upserted ${data.length} Hyundai recipes:`)
  for (const r of data) {
    console.log(`  ${r.pattern}/${r.variant} — ${r.label}`)
  }
}

main()
