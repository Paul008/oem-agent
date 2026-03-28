<script lang="ts" setup>
defineProps<{
  oemDisplayName: string
  colors: any
  typography: any
  spacing: any
}>()

function isLightColor(hex: string): boolean {
  if (!hex || !hex.startsWith('#')) return false
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 186
}
</script>

<template>
  <div
    class="rounded-xl overflow-hidden"
    :style="{
      background: colors?.primary
        ? `linear-gradient(135deg, ${colors.primary}, ${colors.secondary || colors.primary}dd)`
        : 'linear-gradient(135deg, #1a1a2e, #16213e)',
    }"
  >
    <div class="px-8 py-10">
      <h1
        class="text-3xl font-bold mb-2"
        :style="{ color: colors?.primary && !isLightColor(colors.primary) ? '#ffffff' : '#111827', fontFamily: typography?.font_primary?.split(',')[0] || 'inherit' }"
      >
        {{ oemDisplayName }}
      </h1>
      <p
        class="text-sm opacity-80"
        :style="{ color: colors?.primary && !isLightColor(colors.primary) ? '#ffffffcc' : '#111827cc' }"
      >
        Brand Style Guide
      </p>
      <div class="flex items-center gap-4 mt-6">
        <div
          v-if="typography?.font_primary"
          class="text-xs px-3 py-1.5 rounded-full"
          :style="{
            backgroundColor: 'rgba(255,255,255,0.15)',
            color: colors?.primary && !isLightColor(colors.primary) ? '#ffffffcc' : '#111827cc',
          }"
        >
          Font: {{ typography.font_primary.split(',')[0] }}
        </div>
        <div
          v-if="spacing?.container_max_width"
          class="text-xs px-3 py-1.5 rounded-full"
          :style="{
            backgroundColor: 'rgba(255,255,255,0.15)',
            color: colors?.primary && !isLightColor(colors.primary) ? '#ffffffcc' : '#111827cc',
          }"
        >
          Container: {{ spacing.container_max_width }}px
        </div>
      </div>
    </div>
  </div>
</template>
