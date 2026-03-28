#!/usr/bin/env node
/**
 * Update brand_tokens.typography.font_faces for OEMs with fonts in R2.
 * Also updates font_primary and font_cdn_urls.
 *
 * Usage: node dashboard/scripts/update-oem-font-faces.mjs
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const WORKER_URL = 'https://oem-agent.adme-dev.workers.dev'

const OEM_FONTS = {
  'kia-au': {
    primary: 'KiaSignature, sans-serif',
    fonts: [
      { family: 'KiaSignature', weight: '400', filename: 'KiaSignature-Regular.woff2' },
      { family: 'KiaSignature', weight: '700', filename: 'KiaSignature-Bold.woff2' },
    ],
  },
  'ford-au': {
    primary: 'FordAntenna, sans-serif',
    fonts: [
      { family: 'FordAntenna', weight: '400', filename: 'FordAntenna-Regular.woff2' },
      { family: 'FordAntenna', weight: '600', filename: 'FordAntenna-Medium.woff2' },
      { family: 'FordAntenna', weight: '700', filename: 'FordAntenna-CondBold.woff2' },
    ],
  },
  'volkswagen-au': {
    primary: 'VWHead, sans-serif',
    secondary: 'VWText, sans-serif',
    fonts: [
      { family: 'VWHead', weight: '200', filename: 'VWHead-Light.woff2' },
      { family: 'VWHead', weight: '400', filename: 'VWHead-Regular.woff2' },
      { family: 'VWHead', weight: '700', filename: 'VWHead-Bold.woff2' },
      { family: 'VWText', weight: '400', filename: 'VWText-Regular.woff2' },
      { family: 'VWText', weight: '700', filename: 'VWText-Bold.woff2' },
    ],
  },
  'mitsubishi-au': {
    primary: 'MMC, sans-serif',
    fonts: [
      { family: 'MMC', weight: '400', filename: 'MMC-Regular.woff2' },
      { family: 'MMC', weight: '500', filename: 'MMC-Medium.woff2' },
      { family: 'MMC', weight: '700', filename: 'MMC-Bold.woff2' },
    ],
  },
  'mazda-au': {
    primary: 'MazdaType, sans-serif',
    fonts: [
      { family: 'MazdaType', weight: '400', filename: 'MazdaType-Regular.woff2' },
      { family: 'MazdaType', weight: '500', filename: 'MazdaType-Medium.woff2' },
      { family: 'MazdaType', weight: '600', filename: 'MazdaType-Bold.woff2' },
    ],
  },
  'hyundai-au': {
    primary: 'HyundaiSansHead, sans-serif',
    secondary: 'HyundaiSansText, sans-serif',
    fonts: [
      { family: 'HyundaiSansHead', weight: '300', filename: 'HyundaiSansHead-Light.woff2' },
      { family: 'HyundaiSansHead', weight: '400', filename: 'HyundaiSansHead-Regular.woff2' },
      { family: 'HyundaiSansHead', weight: '500', filename: 'HyundaiSansHead-Medium.woff2' },
      { family: 'HyundaiSansHead', weight: '700', filename: 'HyundaiSansHead-Bold.woff2' },
      { family: 'HyundaiSansText', weight: '400', filename: 'HyundaiSansText-Regular.woff2' },
      { family: 'HyundaiSansText', weight: '500', filename: 'HyundaiSansText-Medium.woff2' },
      { family: 'HyundaiSansText', weight: '700', filename: 'HyundaiSansText-Bold.woff2' },
    ],
  },
}

async function main() {
  for (const [oemId, config] of Object.entries(OEM_FONTS)) {
    console.log(`\n=== ${oemId} ===`)

    // Build font_faces and font_cdn_urls
    const font_faces = config.fonts.map(f => ({
      family: f.family,
      weight: f.weight,
      url: `${WORKER_URL}/media/fonts/${oemId}/${f.filename}`,
    }))

    const font_cdn_urls = font_faces.map(f => f.url)

    // Fetch existing tokens
    const { data: existing, error: fetchErr } = await supabase
      .from('brand_tokens')
      .select('tokens_json')
      .eq('oem_id', oemId)
      .single()

    if (fetchErr || !existing) {
      console.log(`  ⚠ No brand_tokens row for ${oemId} — skipping`)
      continue
    }

    const tokens = existing.tokens_json
    tokens.typography = {
      ...tokens.typography,
      font_primary: config.primary,
      font_secondary: config.secondary || tokens.typography?.font_secondary || null,
      font_faces,
      font_cdn_urls,
    }

    const { error: updateErr } = await supabase
      .from('brand_tokens')
      .update({ tokens_json: tokens })
      .eq('oem_id', oemId)

    if (updateErr) {
      console.log(`  ✗ Update failed: ${updateErr.message}`)
    } else {
      console.log(`  ✓ Updated ${font_faces.length} font faces`)
      font_faces.forEach(f => console.log(`    ${f.family} ${f.weight}: ${f.url.split('/').pop()}`))
    }
  }

  console.log('\n=== Done ===')
}

main()
