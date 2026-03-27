#!/usr/bin/env node
/**
 * Seed Toyota AU brand tokens extracted from toyota.com.au/rav4 (Mar 2026).
 *
 * Source: --tk-* CSS custom properties from Toyota's Next.js design system.
 * Font: ToyotaType (proprietary, served from toyota.com.au assets).
 *
 * Usage:
 *   node dashboard/scripts/seed-toyota-brand-tokens.mjs
 */

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const OEM_ID = 'toyota-au'

/** @type {import('../src/oem/types').BrandTokens} */
const brandTokens = {
  oem_id: OEM_ID,
  version: 1,
  captured_at: new Date().toISOString(),
  source_pages: [
    'https://www.toyota.com.au/rav4',
    'https://www.toyota.com.au/all-vehicles',
  ],

  colors: {
    // Core brand
    primary: '#EB0A1E',           // --tk-palette-brand-red
    secondary: '#1A1A1A',         // --tk-palette-brand-charcoal
    accent: '#2468FF',            // --tk-palette-secondary-electrified (hybrid/EV blue)

    // Surfaces
    background: '#FFFFFF',        // --tk-palette-brand-white
    surface: '#F5F5F5',           // --tk-palette-neutrals-smoke
    text_primary: '#1A1A1A',      // --tk-palette-brand-charcoal
    text_secondary: '#757575',    // --tk-palette-neutrals-grey
    text_on_primary: '#FFFFFF',   // white on red

    // Borders & feedback
    border: '#CCCCCC',            // --tk-palette-neutrals-steel
    error: '#BD0011',             // --tk-palette-system-error-light
    success: '#00C483',           // --tk-palette-system-success

    // CTA
    cta_fill: '#EB0A1E',
    cta_text: '#FFFFFF',
    cta_hover: '#C4000B',         // darkened red

    // Extended palette
    palette_extended: {
      'brand-red': '#EB0A1E',
      'brand-charcoal': '#1A1A1A',
      'brand-white': '#FFFFFF',
      'neutrals-smoke': '#F5F5F5',
      'neutrals-light-grey': '#EEEEEE',
      'neutrals-steel': '#CCCCCC',
      'neutrals-grey': '#757575',
      'neutrals-slate': '#3A3A3A',
      'neutrals-dark-charcoal': '#131314',
      'neutrals-black': '#000000',
      'electrified-blue': '#2468FF',
      'electrified-disabled': '#87ACFF',
      'finance-green': '#1C7D49',
      'illustration-green': '#2ABA6C',
      'illustration-green-tint-50': '#95DDB6',
      'illustration-light-blue': '#C4E8FF',
      'illustration-cream': '#FAF0EB',
      'illustration-pink': '#FF8287',
      'illustration-dark-red': '#A52819',
      'system-warning': '#FFC800',
      'system-error-light': '#BD0011',
      'system-error-dark': '#FF8287',
      'system-success': '#00C483',
    },
  },

  typography: {
    font_primary: 'ToyotaType, sans-serif',
    font_secondary: null,
    font_mono: null,
    font_cdn_urls: [],  // ToyotaType is proprietary, served from toyota.com.au

    scale: {
      // Display / Hero: --tk-tg-h1 (80px)
      display: {
        fontSize: '80px',    // calc(1rem * 5)
        fontWeight: 800,
        lineHeight: '1.1',
        letterSpacing: '-0.04em',
      },
      // H1: --tk-tg-h1 (80px) — same as display on Toyota
      h1: {
        fontSize: '80px',
        fontWeight: 800,
        lineHeight: '1.1',
        letterSpacing: '-0.04em',
      },
      // H2: --tk-tg-h2 (56px)
      h2: {
        fontSize: '56px',    // calc(1rem * 3.5)
        fontWeight: 800,
        lineHeight: '1.15',
        letterSpacing: '-0.03em',
      },
      // H3: --tk-tg-h3 (44px)
      h3: {
        fontSize: '44px',    // calc(1rem * 2.75)
        fontWeight: 800,
        lineHeight: '1.15',
        letterSpacing: '-0.04em',
      },
      // H4: --tk-tg-h4 (32px)
      h4: {
        fontSize: '32px',    // calc(1rem * 2)
        fontWeight: 700,
        lineHeight: '1.2',
        letterSpacing: '-0.02em',
      },
      // P1 / Feature text (36px)
      body_large: {
        fontSize: '36px',    // calc(1rem * 2.25) — --tk-tg-p1
        fontWeight: 350,     // --tk-typography-font-weight-regular-light
        lineHeight: '1.35',
        letterSpacing: '-0.01em',
      },
      // B1 / Body (18px)
      body: {
        fontSize: '18px',    // calc(1rem * 1.125)
        fontWeight: 400,
        lineHeight: '1.5',
        letterSpacing: '0',
      },
      // B2 / Body small (16px)
      body_small: {
        fontSize: '16px',
        fontWeight: 400,
        lineHeight: '1.45',
        letterSpacing: '0',
      },
      // C1 / Caption (12px)
      caption: {
        fontSize: '12px',
        fontWeight: 400,
        lineHeight: '1.5',
        letterSpacing: '0',
      },
      // Price display
      price: {
        fontSize: '32px',
        fontWeight: 700,
        lineHeight: '1.2',
        letterSpacing: '-0.02em',
      },
      // F1 / Fine print / Disclaimer (14px)
      disclaimer: {
        fontSize: '14px',    // calc(1rem * 0.875)
        fontWeight: 400,
        lineHeight: '1.4',
        letterSpacing: '0',
      },
      // CTA text
      cta: {
        fontSize: '16px',
        fontWeight: 700,
        lineHeight: '1.2',
        letterSpacing: '0.01em',
      },
      // Navigation
      nav: {
        fontSize: '14px',    // --tk-tg-s1/s2
        fontWeight: 500,
        lineHeight: '1.2',
        letterSpacing: '0.01em',
      },
    },
  },

  spacing: {
    unit: 8,
    scale: {
      xs: 8,
      sm: 32,       // --tk-spacing-sm
      md: 52,       // --tk-spacing-md
      lg: 80,       // --tk-spacing-lg
      xl: 100,      // --tk-spacing-xl
      '2xl': 120,   // --tk-spacing-xl-duo-lg
    },
    section_gap: 80,          // typical gap between major sections
    container_max_width: 1440,
    container_padding: 24,
  },

  borders: {
    radius_sm: '4px',
    radius_md: '8px',
    radius_lg: '16px',
    radius_full: '9999px',
    width_default: '1px',
    color_default: '#CCCCCC',  // steel
  },

  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 12px rgba(0,0,0,0.08)',
    lg: '0 8px 24px rgba(0,0,0,0.12)',
  },

  buttons: {
    // Primary: Red CTA
    primary: {
      background: '#EB0A1E',
      color: '#FFFFFF',
      border: 'none',
      border_radius: '8px',
      padding: '14px 28px',
      font_size: '16px',
      font_weight: 700,
      text_transform: null,
      hover_background: '#C4000B',
      hover_color: '#FFFFFF',
    },
    // Secondary: Dark charcoal
    secondary: {
      background: '#1A1A1A',
      color: '#FFFFFF',
      border: 'none',
      border_radius: '8px',
      padding: '14px 28px',
      font_size: '16px',
      font_weight: 700,
      text_transform: null,
      hover_background: '#3A3A3A',
      hover_color: '#FFFFFF',
    },
    // Outline: White with charcoal border
    outline: {
      background: 'transparent',
      color: '#1A1A1A',
      border: '1px solid #1A1A1A',
      border_radius: '8px',
      padding: '14px 28px',
      font_size: '16px',
      font_weight: 700,
      text_transform: null,
      hover_background: '#1A1A1A',
      hover_color: '#FFFFFF',
    },
    // Text: Red link with arrow
    text: {
      background: 'transparent',
      color: '#EB0A1E',
      border: 'none',
      border_radius: '0',
      padding: '0',
      font_size: '16px',
      font_weight: 700,
      text_transform: null,
      hover_background: null,
      hover_color: '#C4000B',
    },
  },

  components: {
    card: {
      background: '#FFFFFF',
      border_radius: '8px',
      shadow: '0 1px 2px rgba(0,0,0,0.05)',
      padding: '24px',
      hover_shadow: '0 4px 12px rgba(0,0,0,0.08)',
    },
    hero: {
      min_height_desktop: '600px',
      min_height_mobile: '400px',
      overlay: null,  // Toyota uses text directly on hero images, no dark overlay
      text_alignment: 'left',
    },
    nav: {
      height: '64px',
      background: '#FFFFFF',
      text_color: '#1A1A1A',
      sticky: true,
    },
    price_display: {
      font: 'ToyotaType, sans-serif',
      size: '32px',
      weight: '700',
      color: '#1A1A1A',
      prefix_style: null,
    },
    disclaimer: {
      font_size: '14px',
      color: '#757575',
      line_height: '1.4',
      max_width: null,
    },
  },

  animations: {
    transition_default: '0.3s ease',
    carousel_transition: '0.5s ease-in-out',
    hover_scale: null,  // Toyota doesn't use scale on hover — uses shadow/color shifts
  },
}

async function main() {
  console.log('Seeding Toyota AU brand tokens...')

  // Deactivate any existing tokens for this OEM
  const { error: deactivateErr } = await supabase
    .from('brand_tokens')
    .update({ is_active: false })
    .eq('oem_id', OEM_ID)
    .eq('is_active', true)

  if (deactivateErr) {
    console.warn('Warning deactivating old tokens:', deactivateErr.message)
  }

  // Insert new brand tokens
  const { data, error } = await supabase
    .from('brand_tokens')
    .insert({
      oem_id: OEM_ID,
      version: brandTokens.version,
      tokens_json: brandTokens,
      source_pages_json: brandTokens.source_pages,
      content_hash: 'manual-seed-2026-03-27',
      is_active: true,
      captured_at: brandTokens.captured_at,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to insert brand tokens:', error.message)
    process.exit(1)
  }

  console.log(`✅ Toyota AU brand tokens inserted: ${data.id}`)

  // Also update the OEM design profile with the brand token summary
  const { error: profileErr } = await supabase
    .from('oems')
    .update({
      design_profile_json: {
        brand_tokens: {
          primary_color: '#EB0A1E',
          secondary_colors: ['#1A1A1A', '#F5F5F5', '#2468FF', '#1C7D49'],
          font_family: 'ToyotaType, sans-serif',
          border_radius: '8px',
          button_style: 'rounded-red-cta',
        },
        extraction_hints: {
          hero_selectors: ['[class*="hero"]', '[class*="Hero"]', 'section:first-of-type'],
          gallery_selectors: ['[class*="gallery"]', '[class*="Gallery"]', '[class*="carousel"]'],
          tab_selectors: ['[role="tablist"]', '[class*="tab"]'],
          known_failures: [],
          bot_detection: false,
          wait_ms_after_load: 3000,
        },
        quality_history: {
          avg_quality_score: 0,
          total_runs: 0,
          last_run_at: null,
          common_errors: [],
        },
        last_updated: new Date().toISOString(),
      },
    })
    .eq('id', OEM_ID)

  if (profileErr) {
    console.warn('Warning updating OEM design profile:', profileErr.message)
  } else {
    console.log('✅ Toyota AU design profile updated')
  }

  console.log('\nToyota AU Style Guide Summary:')
  console.log('─'.repeat(50))
  console.log(`Primary:     ${brandTokens.colors.primary} (Toyota Red)`)
  console.log(`Secondary:   ${brandTokens.colors.secondary} (Charcoal)`)
  console.log(`Accent:      ${brandTokens.colors.accent} (Electrified Blue)`)
  console.log(`Surface:     ${brandTokens.colors.surface} (Smoke)`)
  console.log(`Font:        ${brandTokens.typography.font_primary}`)
  console.log(`H1:          ${brandTokens.typography.scale.h1.fontSize} / ${brandTokens.typography.scale.h1.fontWeight}`)
  console.log(`H2:          ${brandTokens.typography.scale.h2.fontSize} / ${brandTokens.typography.scale.h2.fontWeight}`)
  console.log(`Body:        ${brandTokens.typography.scale.body.fontSize} / ${brandTokens.typography.scale.body.fontWeight}`)
  console.log(`CTA:         ${brandTokens.buttons.primary.background} → ${brandTokens.buttons.primary.hover_background}`)
  console.log(`Container:   ${brandTokens.spacing.container_max_width}px`)
  console.log(`Section gap: ${brandTokens.spacing.section_gap}px`)
}

main()
