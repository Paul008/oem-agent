#!/usr/bin/env node
/**
 * Seed brand tokens for 14 OEMs (excludes toyota-au, kia-au, gwm-au, hyundai-au which already have tokens).
 *
 * Usage:
 *   node dashboard/scripts/seed-all-brand-tokens.mjs
 */

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// ---------------------------------------------------------------------------
// Helper: darken a hex color by a percentage (0–1)
// ---------------------------------------------------------------------------
function darkenHex(hex, amount = 0.15) {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * (1 - amount)))
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * (1 - amount)))
  const b = Math.max(0, Math.round((num & 0xff) * (1 - amount)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase()}`
}

// ---------------------------------------------------------------------------
// Helper: build a standard BrandTokens object from a compact spec
// ---------------------------------------------------------------------------
function buildTokens(spec) {
  const {
    oem_id,
    primary,
    secondary,
    accent,
    background = '#FFFFFF',
    surface = '#F5F5F5',
    text_primary = '#1A1A1A',
    text_secondary = '#757575',
    text_on_primary = '#FFFFFF',
    border = '#CCCCCC',
    error = '#D32F2F',
    success = '#2E7D32',
    font_primary,
    source_pages = [],
    hero_min_desktop = '600px',
    hero_min_mobile = '400px',
    hero_overlay = null,
    hero_text_align = 'left',
    nav_height = '64px',
    nav_bg = '#FFFFFF',
    nav_text = null,
    btn_text_transform = null,
    btn_radius = '8px',
    transition = '0.3s ease',
  } = spec

  const cta_hover = darkenHex(primary, 0.15)
  const sec = secondary || darkenHex(primary, 0.4)

  return {
    oem_id,
    version: 1,
    captured_at: new Date().toISOString(),
    source_pages,

    colors: {
      primary,
      secondary: sec,
      accent: accent || null,
      background,
      surface,
      text_primary,
      text_secondary,
      text_on_primary,
      border,
      error,
      success,
      cta_fill: primary,
      cta_text: '#FFFFFF',
      cta_hover,
    },

    typography: {
      font_primary: font_primary,
      font_secondary: null,
      font_mono: null,
      font_cdn_urls: [],

      scale: {
        h1: { fontSize: '48px', fontWeight: 700, lineHeight: '1.15', letterSpacing: '-0.02em' },
        h2: { fontSize: '36px', fontWeight: 700, lineHeight: '1.2', letterSpacing: '-0.02em' },
        h3: { fontSize: '28px', fontWeight: 600, lineHeight: '1.25', letterSpacing: '-0.01em' },
        h4: { fontSize: '22px', fontWeight: 600, lineHeight: '1.3', letterSpacing: '0' },
        body: { fontSize: '16px', fontWeight: 400, lineHeight: '1.5', letterSpacing: '0' },
        caption: { fontSize: '12px', fontWeight: 400, lineHeight: '1.4', letterSpacing: '0' },
        cta: { fontSize: '16px', fontWeight: 600, lineHeight: '1.2', letterSpacing: '0.01em' },
      },
    },

    spacing: {
      unit: 8,
      scale: { sm: 32, md: 48, lg: 64, xl: 80 },
      section_gap: 64,
      container_max_width: 1440,
      container_padding: 24,
    },

    borders: {
      radius_sm: '4px',
      radius_md: '8px',
      radius_lg: '16px',
      radius_full: '9999px',
      width_default: '1px',
      color_default: border,
    },

    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.05)',
      md: '0 4px 12px rgba(0,0,0,0.08)',
      lg: '0 8px 24px rgba(0,0,0,0.12)',
    },

    buttons: {
      primary: {
        background: primary,
        color: '#FFFFFF',
        border: 'none',
        border_radius: btn_radius,
        padding: '14px 28px',
        font_size: '16px',
        font_weight: 700,
        text_transform: btn_text_transform,
        hover_background: cta_hover,
        hover_color: '#FFFFFF',
      },
      secondary: {
        background: sec,
        color: '#FFFFFF',
        border: 'none',
        border_radius: btn_radius,
        padding: '14px 28px',
        font_size: '16px',
        font_weight: 700,
        text_transform: btn_text_transform,
        hover_background: darkenHex(sec, 0.15),
        hover_color: '#FFFFFF',
      },
      outline: {
        background: 'transparent',
        color: text_primary,
        border: `1px solid ${text_primary}`,
        border_radius: btn_radius,
        padding: '14px 28px',
        font_size: '16px',
        font_weight: 700,
        text_transform: btn_text_transform,
        hover_background: text_primary,
        hover_color: '#FFFFFF',
      },
      text: {
        background: 'transparent',
        color: primary,
        border: 'none',
        border_radius: '0',
        padding: '0',
        font_size: '16px',
        font_weight: 700,
        text_transform: btn_text_transform,
        hover_background: null,
        hover_color: cta_hover,
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
        min_height_desktop: hero_min_desktop,
        min_height_mobile: hero_min_mobile,
        overlay: hero_overlay,
        text_alignment: hero_text_align,
      },
      nav: {
        height: nav_height,
        background: nav_bg,
        text_color: nav_text || text_primary,
        sticky: true,
      },
    },

    animations: {
      transition_default: transition,
      carousel_transition: '0.5s ease-in-out',
      hover_scale: null,
    },
  }
}

// ---------------------------------------------------------------------------
// OEM Definitions
// ---------------------------------------------------------------------------
const oems = [
  // 1. Ford AU
  {
    oem_id: 'ford-au',
    primary: '#003478',
    secondary: '#00234F',
    accent: null,
    font_primary: 'FordAntenna, sans-serif',
    source_pages: ['https://www.ford.com.au', 'https://www.ford.com.au/showroom/'],
    hero_min_desktop: '700px',
    hero_text_align: 'center',
  },

  // 2. Mazda AU
  {
    oem_id: 'mazda-au',
    primary: '#910A2A',
    secondary: '#5C0618',
    accent: null,
    surface: '#F7F7F7',
    font_primary: 'MazdaType, sans-serif',
    source_pages: ['https://www.mazda.com.au', 'https://www.mazda.com.au/cars/'],
  },

  // 3. Nissan AU
  {
    oem_id: 'nissan-au',
    primary: '#C3002F',
    secondary: '#8A0020',
    accent: null,
    font_primary: 'NissanBrand, sans-serif',
    source_pages: ['https://www.nissan.com.au', 'https://www.nissan.com.au/vehicles/'],
  },

  // 4. Mitsubishi AU
  {
    oem_id: 'mitsubishi-au',
    primary: '#ED0000',
    secondary: '#1A1A1A',
    accent: '#4CAF50',   // Diamond Advantage green
    font_primary: 'MMC, sans-serif',
    source_pages: ['https://www.mitsubishi-motors.com.au', 'https://www.mitsubishi-motors.com.au/vehicles/'],
  },

  // 5. Suzuki AU
  {
    oem_id: 'suzuki-au',
    primary: '#003DA5',
    secondary: '#002970',
    accent: '#FFD100',
    font_primary: 'system-ui, -apple-system, sans-serif',
    source_pages: ['https://www.suzuki.com.au', 'https://www.suzuki.com.au/automobiles/'],
  },

  // 6. Isuzu AU
  {
    oem_id: 'isuzu-au',
    primary: '#C00000',
    secondary: '#1A1A1A',
    accent: null,
    font_primary: 'system-ui, -apple-system, sans-serif',
    source_pages: ['https://www.isuzuute.com.au', 'https://www.isuzuute.com.au/models/'],
  },

  // 7. LDV AU
  {
    oem_id: 'ldv-au',
    primary: '#003DA5',
    secondary: '#002970',
    accent: null,
    font_primary: 'system-ui, -apple-system, sans-serif',
    source_pages: ['https://www.ldvautomotive.com.au', 'https://www.ldvautomotive.com.au/vehicles/'],
  },

  // 8. Subaru AU
  {
    oem_id: 'subaru-au',
    primary: '#003DA5',
    secondary: '#002970',
    accent: null,
    font_primary: 'system-ui, -apple-system, sans-serif',
    source_pages: ['https://www.subaru.com.au', 'https://www.subaru.com.au/special-offers'],
  },

  // 9. GMSV AU — premium dark aesthetic
  {
    oem_id: 'gmsv-au',
    primary: '#000000',
    secondary: '#1A1A1A',
    accent: '#CF9F2B',   // gold
    background: '#000000',
    surface: '#111111',
    text_primary: '#FFFFFF',
    text_secondary: '#AAAAAA',
    text_on_primary: '#FFFFFF',
    border: '#333333',
    font_primary: 'system-ui, -apple-system, sans-serif',
    source_pages: ['https://www.gmsvaustralia.com.au', 'https://www.gmsvaustralia.com.au/vehicles/'],
    hero_overlay: 'rgba(0,0,0,0.4)',
    nav_bg: '#000000',
    nav_text: '#FFFFFF',
  },

  // 10. Foton AU
  {
    oem_id: 'foton-au',
    primary: '#D4002A',
    secondary: '#1A1A1A',
    accent: null,
    font_primary: 'system-ui, -apple-system, sans-serif',
    source_pages: ['https://www.fotonaustralia.com.au', 'https://www.fotonaustralia.com.au/models/'],
  },

  // 11. Chery AU
  {
    oem_id: 'chery-au',
    primary: '#EB5757',
    secondary: '#333333',
    accent: null,
    font_primary: 'system-ui, -apple-system, sans-serif',
    source_pages: ['https://www.cheryaustralia.com.au', 'https://www.cheryaustralia.com.au/models/'],
  },

  // 12. GAC AU — AION EV sub-brand
  {
    oem_id: 'gac-au',
    primary: '#0052CC',
    secondary: '#003A8C',
    accent: '#00C9A7',   // EV green tint
    font_primary: 'system-ui, -apple-system, sans-serif',
    source_pages: ['https://www.gac-motor.com.au'],
  },

  // 13. Volkswagen AU — minimal design
  {
    oem_id: 'volkswagen-au',
    primary: '#001E50',
    secondary: '#001336',
    accent: null,
    font_primary: 'VWHead, sans-serif',
    source_pages: ['https://www.volkswagen.com.au', 'https://www.volkswagen.com.au/en/models.html'],
  },

  // 14. KGM AU (SsangYong rebrand)
  {
    oem_id: 'kgm-au',
    primary: '#00263A',
    secondary: '#001A28',
    accent: '#F26522',   // orange
    font_primary: 'system-ui, -apple-system, sans-serif',
    source_pages: ['https://www.kgm.com.au', 'https://www.kgm.com.au/models/'],
  },
]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Seeding brand tokens for ${oems.length} OEMs...\n`)

  let succeeded = 0
  let failed = 0

  for (const spec of oems) {
    const tokens = buildTokens(spec)

    // Deactivate existing tokens
    const { error: deactivateErr } = await supabase
      .from('brand_tokens')
      .update({ is_active: false })
      .eq('oem_id', spec.oem_id)
      .eq('is_active', true)

    if (deactivateErr) {
      console.warn(`  ⚠ ${spec.oem_id}: warning deactivating old tokens: ${deactivateErr.message}`)
    }

    // Insert new brand tokens
    const { data, error } = await supabase
      .from('brand_tokens')
      .insert({
        oem_id: spec.oem_id,
        version: tokens.version,
        tokens_json: tokens,
        source_pages_json: tokens.source_pages,
        content_hash: `manual-seed-2026-03-26`,
        is_active: true,
        captured_at: tokens.captured_at,
      })
      .select('id')
      .single()

    if (error) {
      console.error(`  ✗ ${spec.oem_id}: ${error.message}`)
      failed++
      continue
    }

    console.log(`  ✓ ${spec.oem_id} — id=${data.id}  primary=${tokens.colors.primary}  font=${tokens.typography.font_primary}`)
    succeeded++
  }

  console.log(`\nDone: ${succeeded} succeeded, ${failed} failed out of ${oems.length} OEMs.`)
  if (failed > 0) process.exit(1)
}

main()
