import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { visualizer } from 'rollup-plugin-visualizer'
import AutoImport from 'unplugin-auto-import/vite'
import Component from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'
import { VueRouterAutoImports } from 'vue-router/unplugin'
import VueRouter from 'vue-router/vite'

const RouteGenerateExclude = ['**/components/**', '**/layouts/**', '**/data/**', '**/types/**']
const dashboardRoot = fileURLToPath(new URL('./', import.meta.url))
const routeMapDtsPath = fileURLToPath(new URL('./src/types/route-map.d.ts', import.meta.url))
const autoImportDtsPath = fileURLToPath(new URL('./src/types/auto-import.d.ts', import.meta.url))
const autoImportComponentsDtsPath = fileURLToPath(new URL('./src/types/auto-import-components.d.ts', import.meta.url))
const shouldWriteGeneratedTypes = process.env.VITEST !== 'true'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  return {
    root: dashboardRoot,
    plugins: [
      VueRouter({
        exclude: RouteGenerateExclude,
        watch: !isProduction,
        ...(shouldWriteGeneratedTypes ? { dts: routeMapDtsPath } : { dts: false }),
      }),
      vue(),
      vueJsx(),
      !isProduction && vueDevTools(),
      tailwindcss(),
      visualizer({ gzipSize: true, brotliSize: true }),
      Layouts({
        defaultLayout: 'default',
      }),
      AutoImport({
        include: [
          /\.[tj]sx?$/,
          /\.vue$/,
        ],
        imports: [
          'vue',
          VueRouterAutoImports,
        ],
        dirs: [
          'src/composables/**/*.ts',
          'src/constants/**/*.ts',
          'src/stores/**/*.ts',
        ],
        defaultExportByFilename: true,
        ...(shouldWriteGeneratedTypes ? { dts: autoImportDtsPath } : { dts: false }),
      }),
      Component({
        dirs: [
          'src/components',
        ],
        collapseSamePrefixes: true,
        directoryAsNamespace: true,
        ...(shouldWriteGeneratedTypes ? { dts: autoImportComponentsDtsPath } : { dts: false }),
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'framework-vendor': ['vue', 'vue-router', 'pinia', 'pinia-plugin-persistedstate', 'vue-i18n'],
            'data-vendor': ['@supabase/supabase-js', '@tanstack/vue-query', 'zod'],
            'gsap': ['gsap', 'gsap/ScrollTrigger'],
          },
        },
      },
    },
    esbuild: {
      drop: ['debugger'],
      pure: ['console.log'],
    },
  }
})
