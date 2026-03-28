/**
 * Seed brand_recipes for 14 OEMs (excludes toyota-au, kia-au, gwm-au, hyundai-au).
 * Run: node dashboard/scripts/seed-all-oem-recipes.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

// ── Card style presets ──────────────────────────────────────────────
const CARD_BLUE = { background_color: '#ffffff', shadow: '0 2px 8px rgba(0,0,0,0.08)', border_radius: '8px', text_align: 'left' }
const CARD_RED = { background_color: '#ffffff', shadow: '0 1px 4px rgba(0,0,0,0.06)', border_radius: '8px', text_align: 'left' }
const CARD_GMSV = { background_color: '#1a1a1a', shadow: '0 4px 12px rgba(0,0,0,0.3)', border_radius: '4px', text_align: 'center', text_color: '#ffffff' }
const CARD_VW = { background_color: '#ffffff', shadow: 'none', border_radius: '0', text_align: 'left' }
const CARD_MAZDA = { background_color: 'transparent', shadow: 'none', border_radius: '0', text_align: 'left' }
const CARD_KGM = { background_color: '#ffffff', shadow: '0 2px 6px rgba(0,0,0,0.08)', border_radius: '12px', text_align: 'left' }

// ── Helper: build standard 7-8 recipes for an OEM ──────────────────
function buildRecipes(oem_id, name, primary, cardStyle, opts = {}) {
  const {
    font_family,
    skipCinematic = false,
    overlayColor,
    headingAlign = 'left',
    ctaText = `Explore ${name}`,
    specsBackground = '#ffffff',
    specsTextColor,
    iconBackground = '#f5f5f5',
  } = opts

  const fontProp = font_family ? { font_family } : {}
  const textColorWhite = cardStyle.text_color === '#ffffff' ? { text_color: '#ffffff' } : {}
  const specsText = specsTextColor ? { text_color: specsTextColor } : {}

  const recipes = [
    // 1. Hero image-overlay
    {
      oem_id,
      pattern: 'hero',
      variant: 'image-overlay',
      label: `${name} Hero — Image Overlay`,
      resolves_to: 'hero',
      defaults_json: {
        heading_size: '5xl',
        heading_weight: 'bold',
        text_align: headingAlign,
        overlay_opacity: 0.4,
        min_height: '85vh',
        text_color: '#ffffff',
        ...(overlayColor ? { overlay_color: overlayColor } : {}),
        ...fontProp,
      },
    },
    // 3. Card-grid image-title-body
    {
      oem_id,
      pattern: 'card-grid',
      variant: 'image-title-body',
      label: `${name} Feature Cards (3-col)`,
      resolves_to: 'feature-cards',
      defaults_json: {
        columns: 3,
        gap: '1.5rem',
        card_composition: ['image', 'title', 'body'],
        card_padding: '1.5rem',
        ...cardStyle,
        hover_accent_color: primary,
        ...fontProp,
      },
    },
    // 4. Card-grid icon-title-body
    {
      oem_id,
      pattern: 'card-grid',
      variant: 'icon-title-body',
      label: `${name} Feature Icons (3-col)`,
      resolves_to: 'feature-cards',
      defaults_json: {
        columns: 3,
        gap: '2rem',
        card_composition: ['icon', 'title', 'body'],
        card_padding: '2rem',
        text_align: 'center',
        background_color: iconBackground,
        border: 'none',
        shadow: 'none',
        icon_size: '2.5rem',
        ...textColorWhite,
        ...fontProp,
      },
    },
    // 5. Split-content
    {
      oem_id,
      pattern: 'split-content',
      variant: 'text-left-image-right',
      label: `${name} Split — Text + Image`,
      resolves_to: 'intro',
      defaults_json: {
        layout: 'text-left',
        gap: '3rem',
        text_width: '50%',
        image_width: '50%',
        vertical_align: 'center',
        heading_weight: 'bold',
        section_padding: '80px 0',
        ...fontProp,
      },
    },
    // 6. Action-bar banner
    {
      oem_id,
      pattern: 'action-bar',
      variant: 'banner',
      label: `${name} CTA Banner`,
      resolves_to: 'cta-banner',
      defaults_json: {
        background_color: primary,
        text_color: '#ffffff',
        text_align: 'center',
        section_padding: '4rem 2rem',
        button_text: ctaText,
        button_variant: 'primary',
        ...fontProp,
      },
    },
    // 7. Specs accordion
    {
      oem_id,
      pattern: 'data-display',
      variant: 'specs-accordion',
      label: `${name} Specs`,
      resolves_to: 'specs-grid',
      defaults_json: {
        expand_first: true,
        show_icons: false,
        border_bottom: true,
        section_padding: '4rem 0',
        background_color: specsBackground,
        ...specsText,
        ...fontProp,
      },
    },
    // 8. Model range cards
    {
      oem_id,
      pattern: 'card-grid',
      variant: 'image-title-cta',
      label: `${name} Model Range (4-col)`,
      resolves_to: 'feature-cards',
      defaults_json: {
        columns: 4,
        gap: '1.5rem',
        card_composition: ['image', 'title', 'cta'],
        card_padding: '1.5rem',
        ...cardStyle,
        ...fontProp,
      },
    },
  ]

  // 2. Cinematic hero (skip for utility brands)
  if (!skipCinematic) {
    recipes.splice(1, 0, {
      oem_id,
      pattern: 'hero',
      variant: 'cinematic',
      label: `${name} Cinematic Hero`,
      resolves_to: 'hero',
      defaults_json: {
        heading_size: '5xl',
        heading_weight: 'bold',
        text_align: headingAlign,
        overlay_opacity: 0,
        min_height: '100vh',
        text_color: '#ffffff',
        ...fontProp,
      },
    })
  }

  return recipes
}

// ── OEM definitions ─────────────────────────────────────────────────
const ALL_OEMS = [
  // ── Blue brands ───────────────────────────────────────────────
  {
    oem_id: 'ford-au',
    name: 'Ford',
    primary: '#003478',
    card: CARD_BLUE,
    opts: { font_family: 'FordAntenna', ctaText: 'Build Your Ford' },
  },
  {
    oem_id: 'suzuki-au',
    name: 'Suzuki',
    primary: '#003DA5',
    card: CARD_BLUE,
    opts: { ctaText: 'Find Your Suzuki' },
  },
  {
    oem_id: 'ldv-au',
    name: 'LDV',
    primary: '#003DA5',
    card: CARD_BLUE,
    opts: { skipCinematic: true, ctaText: 'View LDV Range' },
  },
  {
    oem_id: 'subaru-au',
    name: 'Subaru',
    primary: '#003DA5',
    card: CARD_BLUE,
    opts: { ctaText: 'Build Your Subaru' },
  },
  {
    oem_id: 'gac-au',
    name: 'GAC',
    primary: '#0052CC',
    card: CARD_BLUE,
    opts: { ctaText: 'Explore AION Range' },
  },
  {
    oem_id: 'volkswagen-au',
    name: 'Volkswagen',
    primary: '#001E50',
    card: CARD_VW,
    opts: { font_family: 'VWHead', headingAlign: 'center', ctaText: 'Configure Your Volkswagen' },
  },

  // ── Red brands ────────────────────────────────────────────────
  {
    oem_id: 'nissan-au',
    name: 'Nissan',
    primary: '#C3002F',
    card: CARD_RED,
    opts: { font_family: 'NissanBrand', ctaText: 'Build Your Nissan' },
  },
  {
    oem_id: 'mitsubishi-au',
    name: 'Mitsubishi',
    primary: '#ED0000',
    card: CARD_RED,
    opts: { font_family: 'MMC', ctaText: 'Build Your Mitsubishi' },
  },
  {
    oem_id: 'isuzu-au',
    name: 'Isuzu',
    primary: '#C00000',
    card: CARD_RED,
    opts: { skipCinematic: true, ctaText: 'View Isuzu Range' },
  },
  {
    oem_id: 'foton-au',
    name: 'Foton',
    primary: '#D4002A',
    card: CARD_RED,
    opts: { skipCinematic: true, ctaText: 'View Foton Range' },
  },
  {
    oem_id: 'chery-au',
    name: 'Chery',
    primary: '#EB5757',
    card: CARD_RED,
    opts: { ctaText: 'Explore Chery Range' },
  },

  // ── Dark / premium brands ────────────────────────────────────
  {
    oem_id: 'gmsv-au',
    name: 'GMSV',
    primary: '#CF9F2B',
    card: CARD_GMSV,
    opts: {
      overlayColor: '#000000',
      headingAlign: 'center',
      ctaText: 'Explore GMSV',
      specsBackground: '#1a1a1a',
      specsTextColor: '#ffffff',
      iconBackground: '#111111',
    },
  },
  {
    oem_id: 'kgm-au',
    name: 'KGM',
    primary: '#F26522',
    card: CARD_KGM,
    opts: { ctaText: 'Explore KGM Range' },
  },

  // ── Elegant brand ────────────────────────────────────────────
  {
    oem_id: 'mazda-au',
    name: 'Mazda',
    primary: '#910A2A',
    card: CARD_MAZDA,
    opts: { font_family: 'MazdaType', ctaText: 'Build Your Mazda' },
  },
]

async function main() {
  let totalUpserted = 0

  for (const oem of ALL_OEMS) {
    const recipes = buildRecipes(oem.oem_id, oem.name, oem.primary, oem.card, oem.opts)

    // Deactivate any existing recipes for this OEM (soft reset)
    await supabase
      .from('brand_recipes')
      .update({ is_active: false })
      .eq('oem_id', oem.oem_id)

    const { data, error } = await supabase
      .from('brand_recipes')
      .upsert(
        recipes.map((r) => ({ ...r, is_active: true })),
        { onConflict: 'oem_id,pattern,variant' }
      )
      .select('id, pattern, variant, label')

    if (error) {
      console.error(`[${oem.oem_id}] Upsert failed:`, error.message)
      continue
    }

    console.log(`[${oem.oem_id}] ${data.length} recipes upserted`)
    for (const r of data) {
      console.log(`  ${r.pattern}/${r.variant} — ${r.label}`)
    }
    totalUpserted += data.length
  }

  console.log(`\nDone — ${totalUpserted} recipes across ${ALL_OEMS.length} OEMs`)
}

main()
