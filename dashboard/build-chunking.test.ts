import type { UserConfig } from 'vite'
import { describe, expect, it } from 'vitest'

import configExport from './vite.config'

function getProductionConfig(): UserConfig {
  if (typeof configExport === 'function') {
    return configExport({
      command: 'build',
      mode: 'production',
      isPreview: false,
      isSsrBuild: false,
    }) as UserConfig
  }

  return configExport as UserConfig
}

describe('dashboard Vite chunking', () => {
  it('keeps framework and data clients in explicit vendor chunks', () => {
    const config = getProductionConfig()
    const output = config.build?.rollupOptions?.output
    const manualChunks = Array.isArray(output) ? output[0]?.manualChunks : output?.manualChunks

    expect(manualChunks).toMatchObject({
      'framework-vendor': ['vue', 'vue-router', 'pinia', 'pinia-plugin-persistedstate', 'vue-i18n'],
      'data-vendor': ['@supabase/supabase-js', '@tanstack/vue-query', 'zod'],
      gsap: ['gsap', 'gsap/ScrollTrigger'],
    })
  })
})
