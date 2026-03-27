/**
 * Seed default_recipes table with 23 recipes covering all 8 patterns.
 * Run: node dashboard/scripts/seed-default-recipes.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const recipes = [
  // ═══════════════ HERO ═══════════════
  {
    pattern: 'hero',
    variant: 'image-overlay',
    label: 'Hero — Image Overlay',
    resolves_to: 'hero',
    defaults_json: {
      heading_size: '4xl',
      heading_weight: 'bold',
      text_align: 'center',
      overlay_opacity: 0.4,
      min_height: '80vh',
      text_color: '#ffffff',
    },
  },
  {
    pattern: 'hero',
    variant: 'video-background',
    label: 'Hero — Video Background',
    resolves_to: 'hero',
    defaults_json: {
      heading_size: '4xl',
      heading_weight: 'bold',
      text_align: 'center',
      overlay_opacity: 0.5,
      min_height: '100vh',
      text_color: '#ffffff',
      autoplay: true,
      muted: true,
      loop: true,
    },
  },

  // ═══════════════ CARD-GRID ═══════════════
  {
    pattern: 'card-grid',
    variant: 'image-title-body',
    label: 'Cards — Image + Title + Body',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 3,
      gap: '1.5rem',
      card_composition: ['image', 'title', 'body'],
      card_padding: '1.5rem',
      border_radius: '0.5rem',
      shadow: 'sm',
    },
  },
  {
    pattern: 'card-grid',
    variant: 'icon-title-body',
    label: 'Cards — Icon + Title + Body',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 3,
      gap: '1.5rem',
      card_composition: ['icon', 'title', 'body'],
      card_padding: '1.5rem',
      text_align: 'center',
      icon_size: '2.5rem',
    },
  },
  {
    pattern: 'card-grid',
    variant: 'stat',
    label: 'Cards — Stats',
    resolves_to: 'stats',
    defaults_json: {
      columns: 4,
      gap: '2rem',
      card_composition: ['stat'],
      text_align: 'center',
      stat_size: '3xl',
      stat_weight: 'bold',
    },
  },
  {
    pattern: 'card-grid',
    variant: 'logo',
    label: 'Cards — Logo Strip',
    resolves_to: 'logo-strip',
    defaults_json: {
      columns: 6,
      gap: '2rem',
      card_composition: ['logo'],
      logo_max_height: '3rem',
      grayscale: true,
      hover_color: true,
    },
  },
  {
    pattern: 'card-grid',
    variant: 'testimonial',
    label: 'Cards — Testimonials',
    resolves_to: 'testimonial',
    defaults_json: {
      columns: 3,
      gap: '1.5rem',
      card_composition: ['rating', 'body', 'title', 'subtitle'],
      card_padding: '2rem',
      border_radius: '0.75rem',
      shadow: 'md',
      rating_max: 5,
    },
  },
  {
    pattern: 'card-grid',
    variant: 'pricing-tier',
    label: 'Cards — Pricing Table',
    resolves_to: 'pricing-table',
    defaults_json: {
      columns: 3,
      gap: '1.5rem',
      card_composition: ['badge', 'title', 'stat', 'body', 'cta'],
      card_padding: '2rem',
      border_radius: '0.75rem',
      shadow: 'lg',
      highlight_featured: true,
    },
  },

  // ═══════════════ SPLIT-CONTENT ═══════════════
  {
    pattern: 'split-content',
    variant: 'text-left-image-right',
    label: 'Split — Text Left, Image Right',
    resolves_to: 'intro',
    defaults_json: {
      layout: 'text-left',
      gap: '3rem',
      text_width: '50%',
      image_width: '50%',
      vertical_align: 'center',
      section_padding: '5rem 0',
    },
  },
  {
    pattern: 'split-content',
    variant: 'text-right-image-left',
    label: 'Split — Text Right, Image Left',
    resolves_to: 'intro',
    defaults_json: {
      layout: 'text-right',
      gap: '3rem',
      text_width: '50%',
      image_width: '50%',
      vertical_align: 'center',
      section_padding: '5rem 0',
    },
  },
  {
    pattern: 'split-content',
    variant: 'full-width-text',
    label: 'Split — Full Width Text',
    resolves_to: 'content-block',
    defaults_json: {
      max_width: '48rem',
      text_align: 'left',
      section_padding: '4rem 0',
      line_height: 1.75,
    },
  },

  // ═══════════════ MEDIA ═══════════════
  {
    pattern: 'media',
    variant: 'carousel',
    label: 'Media — Carousel',
    resolves_to: 'gallery',
    defaults_json: {
      autoplay: true,
      interval: 5000,
      show_arrows: true,
      show_dots: true,
      aspect_ratio: '16/9',
      border_radius: '0.5rem',
    },
  },
  {
    pattern: 'media',
    variant: 'video',
    label: 'Media — Video',
    resolves_to: 'video',
    defaults_json: {
      aspect_ratio: '16/9',
      autoplay: false,
      controls: true,
      border_radius: '0.5rem',
      max_width: '64rem',
    },
  },

  // ═══════════════ DATA-DISPLAY ═══════════════
  {
    pattern: 'data-display',
    variant: 'specs-accordion',
    label: 'Data — Specs Accordion',
    resolves_to: 'specs-grid',
    defaults_json: {
      expand_first: true,
      show_icons: true,
      border_bottom: true,
      section_padding: '4rem 0',
      background_color: '#f9fafb',
    },
  },
  {
    pattern: 'data-display',
    variant: 'comparison',
    label: 'Data — Comparison Table',
    resolves_to: 'comparison-table',
    defaults_json: {
      sticky_header: true,
      highlight_differences: true,
      max_columns: 4,
      striped_rows: true,
    },
  },
  {
    pattern: 'data-display',
    variant: 'color-picker',
    label: 'Data — Color Picker',
    resolves_to: 'color-picker',
    defaults_json: {
      swatch_size: '2.5rem',
      show_label: true,
      show_preview: true,
      preview_aspect_ratio: '16/9',
    },
  },

  // ═══════════════ ACTION-BAR ═══════════════
  {
    pattern: 'action-bar',
    variant: 'banner',
    label: 'Action — CTA Banner',
    resolves_to: 'cta-banner',
    defaults_json: {
      background_color: '#111827',
      text_color: '#ffffff',
      text_align: 'center',
      section_padding: '4rem 2rem',
      button_variant: 'primary',
    },
  },
  {
    pattern: 'action-bar',
    variant: 'sticky',
    label: 'Action — Sticky Bar',
    resolves_to: 'sticky-bar',
    defaults_json: {
      position: 'bottom',
      background_color: '#ffffff',
      shadow: 'lg',
      z_index: 50,
      height: '4rem',
    },
  },
  {
    pattern: 'action-bar',
    variant: 'form',
    label: 'Action — Enquiry Form',
    resolves_to: 'enquiry-form',
    defaults_json: {
      max_width: '40rem',
      fields: ['name', 'email', 'phone', 'message'],
      button_text: 'Submit Enquiry',
      section_padding: '4rem 0',
    },
  },

  // ═══════════════ TABS ═══════════════
  {
    pattern: 'tabs',
    variant: 'horizontal',
    label: 'Tabs — Horizontal',
    resolves_to: 'tabs',
    defaults_json: {
      tab_style: 'underline',
      active_indicator: 'border-bottom',
      section_padding: '3rem 0',
      content_padding: '2rem 0',
    },
  },

  // ═══════════════ UTILITY ═══════════════
  {
    pattern: 'utility',
    variant: 'heading',
    label: 'Utility — Section Heading',
    resolves_to: 'heading',
    defaults_json: {
      heading_size: '2xl',
      heading_weight: 'bold',
      text_align: 'center',
      margin_bottom: '2rem',
      show_subtitle: true,
    },
  },
  {
    pattern: 'utility',
    variant: 'divider',
    label: 'Utility — Divider',
    resolves_to: 'divider',
    defaults_json: {
      style: 'solid',
      color: '#e5e7eb',
      thickness: '1px',
      max_width: '100%',
      margin: '2rem 0',
    },
  },
  {
    pattern: 'utility',
    variant: 'alert',
    label: 'Utility — Alert',
    resolves_to: 'alert',
    defaults_json: {
      variant: 'info',
      dismissible: true,
      border_radius: '0.5rem',
      padding: '1rem 1.5rem',
      show_icon: true,
    },
  },
]

async function main() {
  console.log('Clearing existing default_recipes...')
  const { error: delErr } = await supabase.from('default_recipes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delErr) {
    console.error('Delete failed:', delErr.message)
    process.exit(1)
  }

  console.log(`Inserting ${recipes.length} default recipes...`)
  const { data, error } = await supabase.from('default_recipes').insert(recipes).select('id, pattern, variant')
  if (error) {
    console.error('Insert failed:', error.message)
    process.exit(1)
  }

  console.log(`Inserted ${data.length} default recipes:`)
  for (const r of data) {
    console.log(`  ${r.pattern}/${r.variant}`)
  }
}

main()
