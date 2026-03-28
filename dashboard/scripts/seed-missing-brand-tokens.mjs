#!/usr/bin/env node
/**
 * Seed brand tokens for 3 OEMs that were missing: kia-au, gwm-au, hyundai-au.
 *
 * Usage:
 *   node dashboard/scripts/seed-missing-brand-tokens.mjs
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
// OEM Definitions — 3 missing OEMs
// ---------------------------------------------------------------------------
const oems = [
  // 1. Kia AU — clean high-contrast, full-bleed heroes
  {
    oem_id: 'kia-au',
    primary: '#BB162B',
    secondary: '#05141F',
    accent: null,
    font_primary: 'KiaSignature, sans-serif',
    source_pages: ['https://www.kia.com/au', 'https://www.kia.com/au/showroom/'],
    hero_min_desktop: '700px',
    hero_text_align: 'center',
    btn_text_transform: 'uppercase',
  },

  // 2. GWM AU — dark navy, multi-sub-brand (GWM, HAVAL, ORA, Tank)
  {
    oem_id: 'gwm-au',
    primary: '#1A1E2E',
    secondary: '#0F1119',
    accent: '#E41D1A',
    font_primary: 'system-ui, -apple-system, sans-serif',
    source_pages: ['https://www.gwm.com.au', 'https://www.gwm.com.au/models/'],
    nav_bg: '#1A1E2E',
    nav_text: '#FFFFFF',
  },

  // 3. Hyundai AU — dark blue, three design sub-systems
  {
    oem_id: 'hyundai-au',
    primary: '#002C5F',
    secondary: '#001D40',
    accent: '#00AAD2',
    font_primary: 'HyundaiSans, sans-serif',
    source_pages: ['https://www.hyundai.com/au/en', 'https://www.hyundai.com/au/en/cars/'],
    hero_min_desktop: '700px',
  },
]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Seeding brand tokens for ${oems.length} missing OEMs...\n`)

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
