/**
 * Seed brand_recipes table with 8 Toyota AU recipes.
 * Run: node dashboard/scripts/seed-toyota-recipes.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'toyota-au'

// Toyota brand tokens: ToyotaType font, clean/minimal, high contrast
const recipes = [
  {
    oem_id: OEM_ID,
    pattern: 'hero',
    variant: 'cinematic',
    label: 'Toyota Cinematic Hero',
    resolves_to: 'hero',
    defaults_json: {
      heading_size: '5xl',
      heading_weight: 'extrabold',
      text_align: 'left',
      overlay_opacity: 0,
      min_height: '100vh',
      text_color: '#ffffff',
      font_family: 'ToyotaType',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'hero',
    variant: 'image-overlay',
    label: 'Toyota Hero — Standard',
    resolves_to: 'hero',
    defaults_json: {
      heading_size: '4xl',
      heading_weight: 'extrabold',
      text_align: 'left',
      overlay_opacity: 0.35,
      min_height: '75vh',
      text_color: '#ffffff',
      font_family: 'ToyotaType',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'card-grid',
    variant: 'icon-title-body',
    label: 'Toyota Feature Icons (3-col)',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 3,
      gap: '2rem',
      card_composition: ['icon', 'title', 'body'],
      card_padding: '2rem',
      text_align: 'center',
      background_color: 'transparent',
      border: 'none',
      shadow: 'none',
      icon_size: '2.5rem',
      font_family: 'ToyotaType',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'card-grid',
    variant: 'image-title-body',
    label: 'Toyota Feature Cards (3-col)',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 3,
      gap: '1.5rem',
      card_composition: ['image', 'title', 'body'],
      card_padding: '1.5rem',
      text_align: 'left',
      background_color: 'transparent',
      shadow: 'none',
      border_radius: '0',
      font_family: 'ToyotaType',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'card-grid',
    variant: 'image-title-cta',
    label: 'Toyota Model Range (4-col)',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 4,
      gap: '1.5rem',
      card_composition: ['image', 'title', 'cta'],
      card_padding: '1.5rem',
      text_align: 'center',
      border_radius: '0',
      font_family: 'ToyotaType',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'split-content',
    variant: 'text-left-image-right',
    label: 'Toyota Split — Text + Image',
    resolves_to: 'intro',
    defaults_json: {
      layout: 'text-left',
      gap: '3rem',
      text_width: '50%',
      image_width: '50%',
      vertical_align: 'center',
      section_padding: '80px 0',
      font_family: 'ToyotaType',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'action-bar',
    variant: 'banner',
    label: 'Toyota CTA Banner',
    resolves_to: 'cta-banner',
    defaults_json: {
      background_color: '#1a1a1a',
      text_color: '#ffffff',
      text_align: 'center',
      section_padding: '4rem 2rem',
      button_text: 'Find a Dealer',
      button_variant: 'primary',
      font_family: 'ToyotaType',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'data-display',
    variant: 'specs-accordion',
    label: 'Toyota Specs',
    resolves_to: 'specs-grid',
    defaults_json: {
      expand_first: true,
      show_icons: false,
      border_bottom: true,
      section_padding: '4rem 0',
      background_color: '#f5f5f5',
      font_family: 'ToyotaType',
    },
  },
]

async function main() {
  console.log(`Upserting ${recipes.length} Toyota brand recipes...`)
  const { data, error } = await supabase
    .from('brand_recipes')
    .upsert(recipes, { onConflict: 'oem_id,pattern,variant' })
    .select('id, pattern, variant, label')

  if (error) {
    console.error('Upsert failed:', error.message)
    process.exit(1)
  }

  console.log(`Upserted ${data.length} Toyota recipes:`)
  for (const r of data) {
    console.log(`  ${r.pattern}/${r.variant} — ${r.label}`)
  }
}

main()
