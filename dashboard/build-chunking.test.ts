import type { UserConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

describe('dashboard Vite config', () => {
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

  it('roots generated type files inside the dashboard package', () => {
    const source = readFileSync(fileURLToPath(new URL('./vite.config.ts', import.meta.url)), 'utf8')

    expect(source).not.toContain("dts: 'src/types/")
    expect(source).toContain("new URL('./src/types/")
  })

  it('does not write generated declaration files while Vitest loads the config', () => {
    const source = readFileSync(fileURLToPath(new URL('./vite.config.ts', import.meta.url)), 'utf8')

    expect(source).toContain('process.env.VITEST')
    expect(source).toContain('dts: false')
  })

  it('uses the dashboard directory as Vite root', () => {
    const config = getProductionConfig()
    const dashboardRoot = fileURLToPath(new URL('./', import.meta.url))

    expect(config.root).toBe(dashboardRoot)
  })
})
