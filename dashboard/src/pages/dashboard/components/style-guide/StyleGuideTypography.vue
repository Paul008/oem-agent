<script lang="ts" setup>
import { Type, Download } from 'lucide-vue-next'

defineProps<{
  typography: any
}>()

const TYPO_SCALES = [
  'display', 'h1', 'h2', 'h3', 'h4',
  'body_large', 'body', 'body_small', 'caption',
  'price', 'disclaimer', 'cta', 'nav',
] as const

function capFontSize(size: string | number | undefined, max = 48): string {
  if (!size) return '16px'
  const n = typeof size === 'number' ? size : parseInt(String(size), 10)
  if (isNaN(n)) return String(size)
  return Math.min(n, max) + 'px'
}
</script>

<template>
  <UiCard v-if="typography" class="overflow-hidden">
    <div class="px-6 pt-6 pb-2">
      <div class="flex items-center gap-2 mb-1">
        <Type class="size-5 text-muted-foreground" />
        <h2 class="text-2xl font-bold">Typography</h2>
      </div>
      <p class="text-sm text-muted-foreground">
        Primary font: <span class="font-semibold">{{ typography.font_primary?.split(',')[0] || 'System' }}</span>
        <template v-if="typography.font_secondary">
          &middot; Secondary: <span class="font-semibold">{{ typography.font_secondary?.split(',')[0] }}</span>
        </template>
      </p>
    </div>

    <div class="px-6 pb-6">
      <div class="space-y-0 divide-y">
        <template v-for="scale in TYPO_SCALES" :key="scale">
          <div
            v-if="typography.scale?.[scale]"
            class="py-4 flex items-baseline gap-6"
          >
            <div class="w-24 shrink-0">
              <p class="text-xs font-medium text-muted-foreground">{{ scale.replace(/_/g, ' ') }}</p>
            </div>
            <div class="flex-1 min-w-0">
              <p
                class="truncate"
                :style="{
                  fontSize: capFontSize(typography.scale[scale].fontSize, 48),
                  fontWeight: typography.scale[scale].fontWeight || 'normal',
                  letterSpacing: typography.scale[scale].letterSpacing || 'normal',
                  lineHeight: typography.scale[scale].lineHeight || 'normal',
                  fontFamily: typography.font_primary?.split(',')[0] || 'inherit',
                }"
              >
                The quick brown fox jumps
              </p>
            </div>
            <div class="w-48 shrink-0 text-right">
              <span class="text-[10px] text-muted-foreground font-mono">
                {{ typography.scale[scale].fontSize }}
                <template v-if="typography.scale[scale].fontWeight"> / {{ typography.scale[scale].fontWeight }}</template>
                <template v-if="typography.scale[scale].letterSpacing"> / {{ typography.scale[scale].letterSpacing }}</template>
              </span>
            </div>
          </div>
        </template>
      </div>

      <!-- Fallback when no scale entries exist -->
      <div
        v-if="!typography.scale || !Object.keys(typography.scale).length"
        class="py-8 text-center"
      >
        <p class="text-sm text-muted-foreground">No type scale defined. Font family is available but no scale entries.</p>
      </div>

      <!-- Font files -->
      <div v-if="typography.font_faces?.length" class="mt-4 pt-4 border-t">
        <p class="text-xs font-medium text-muted-foreground mb-3">Font Files</p>
        <div class="flex flex-wrap gap-2">
          <a
            v-for="face in typography.font_faces"
            :key="face.url"
            :href="face.url"
            download
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted transition-colors"
          >
            <Download class="size-3" />
            {{ face.family }} {{ face.weight }}
          </a>
        </div>
      </div>
    </div>
  </UiCard>
</template>
