/**
 * Seed brand_recipes table with 8 GWM AU recipes.
 * Run: node dashboard/scripts/seed-gwm-recipes.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'gwm-au'

// GWM brand tokens: multi-sub-brand (Haval/GWM/ORA/Tank), dark premium aesthetic, #1A1E2E navy + #E41D1A red
const recipes = [
  {
    oem_id: OEM_ID,
    pattern: 'hero',
    variant: 'image-overlay',
    label: 'GWM Hero — Dark Overlay',
    resolves_to: 'hero',
    defaults_json: {
      heading_size: '5xl',
      heading_weight: 'bold',
      text_align: 'center',
      overlay_opacity: 0.5,
      min_height: '85vh',
      text_color: '#ffffff',
      overlay_color: '#1A1E2E',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'card-grid',
    variant: 'image-title-body',
    label: 'GWM Feature Cards (3-col)',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 3,
      gap: '1.5rem',
      card_composition: ['image', 'title', 'body'],
      card_padding: '1.5rem',
      text_align: 'left',
      background_color: '#1A1E2E',
      text_color: '#ffffff',
      border_radius: '12px',
      shadow: '0 2px 12px rgba(0,0,0,0.2)',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'card-grid',
    variant: 'image-title-cta',
    label: 'GWM Model Range (4-col)',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 4,
      gap: '1.5rem',
      card_composition: ['image', 'title', 'cta'],
      card_padding: '1.5rem',
      text_align: 'center',
      background_color: '#1A1E2E',
      text_color: '#ffffff',
      border_radius: '12px',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'split-content',
    variant: 'text-left-image-right',
    label: 'GWM Split — Text + Image',
    resolves_to: 'intro',
    defaults_json: {
      layout: 'text-left',
      gap: '3rem',
      text_width: '50%',
      image_width: '50%',
      vertical_align: 'center',
      section_padding: '80px 0',
      background_color: '#1A1E2E',
      text_color: '#ffffff',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'action-bar',
    variant: 'banner',
    label: 'GWM CTA Banner',
    resolves_to: 'cta-banner',
    defaults_json: {
      background_color: '#E41D1A',
      text_color: '#ffffff',
      text_align: 'center',
      section_padding: '4rem 2rem',
      button_text: 'Explore Range',
      button_variant: 'primary',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'data-display',
    variant: 'specs-accordion',
    label: 'GWM Specs',
    resolves_to: 'specs-grid',
    defaults_json: {
      expand_first: true,
      show_icons: false,
      border_bottom: true,
      section_padding: '4rem 0',
      background_color: '#2a2e3e',
      text_color: '#ffffff',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'card-grid',
    variant: 'stat',
    label: 'GWM Stats (3-col)',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 3,
      gap: '2rem',
      card_composition: ['stat-value', 'stat-label'],
      card_padding: '2rem',
      text_align: 'center',
      background_color: '#1A1E2E',
      text_color: '#ffffff',
      stat_value_size: '3xl',
      stat_value_weight: 'bold',
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'tabs',
    variant: 'horizontal',
    label: 'GWM Tabs — Underline',
    resolves_to: 'tabs',
    defaults_json: {
      indicator_style: 'underline',
      indicator_color: '#E41D1A',
      background_color: '#1A1E2E',
      text_color: '#ffffff',
      active_text_color: '#ffffff',
      section_padding: '2rem 0',
    },
  },
]

async function main() {
  console.log(`Upserting ${recipes.length} GWM brand recipes...`)
  const { data, error } = await supabase
    .from('brand_recipes')
    .upsert(recipes, { onConflict: 'oem_id,pattern,variant' })
    .select('id, pattern, variant, label')

  if (error) {
    console.error('Upsert failed:', error.message)
    process.exit(1)
  }

  console.log(`Upserted ${data.length} GWM recipes:`)
  for (const r of data) {
    console.log(`  ${r.pattern}/${r.variant} — ${r.label}`)
  }
}

main()
