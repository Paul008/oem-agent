<script lang="ts" setup>
import { Palette } from 'lucide-vue-next'

defineProps<{
  colors: any
}>()

function isLightColor(hex: string): boolean {
  if (!hex || !hex.startsWith('#'))
    return false
  const c = hex.replace('#', '')
  const r = Number.parseInt(c.substring(0, 2), 16)
  const g = Number.parseInt(c.substring(2, 4), 16)
  const b = Number.parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 186
}

function formatColorLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
</script>

<template>
  <UiCard v-if="colors" class="overflow-hidden">
    <div class="px-6 pt-6 pb-2">
      <div class="flex items-center gap-2 mb-1">
        <Palette class="size-5 text-muted-foreground" />
        <h2 class="text-2xl font-bold">
          Color Palette
        </h2>
      </div>
      <p class="text-sm text-muted-foreground">
        Core brand colors and extended palette
      </p>
    </div>

    <!-- Core colors -->
    <div class="px-6 pb-4">
      <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 mt-4">
        Core Colors
      </h3>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          v-for="key in ['primary', 'secondary', 'accent', 'surface']"
          :key="key"
        >
          <template v-if="colors[key]">
            <div
              class="rounded-lg border overflow-hidden"
              :class="{ 'border-border/50': isLightColor(colors[key]) }"
            >
              <div
                class="h-20"
                :style="{ backgroundColor: colors[key] }"
              />
              <div class="px-3 py-2 bg-background">
                <p class="text-sm font-medium capitalize">
                  {{ key }}
                </p>
                <p class="text-xs text-muted-foreground font-mono">
                  {{ colors[key] }}
                </p>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Additional colors (text, bg, border, etc.) -->
      <template v-if="colors.text || colors.background || colors.border || colors.muted || colors.error || colors.success">
        <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 mt-6">
          Semantic Colors
        </h3>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <div
            v-for="key in ['text', 'background', 'border', 'muted', 'error', 'success', 'warning', 'info']"
            :key="key"
          >
            <template v-if="colors[key]">
              <div class="text-center">
                <div
                  class="h-12 w-full rounded-lg border mb-1.5"
                  :class="{ 'border-border/50': isLightColor(colors[key]) }"
                  :style="{ backgroundColor: colors[key] }"
                />
                <p class="text-xs font-medium capitalize">
                  {{ key }}
                </p>
                <p class="text-[10px] text-muted-foreground font-mono">
                  {{ colors[key] }}
                </p>
              </div>
            </template>
          </div>
        </div>
      </template>

      <!-- Extended palette -->
      <template v-if="colors.palette_extended && Object.keys(colors.palette_extended).length">
        <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 mt-6">
          Extended Palette
        </h3>
        <div class="grid grid-cols-4 sm:grid-cols-8 gap-2">
          <div
            v-for="(hex, name) in colors.palette_extended"
            :key="String(name)"
            class="text-center"
          >
            <div
              class="h-10 w-full rounded border mb-1"
              :class="{ 'border-border/50': isLightColor(String(hex)) }"
              :style="{ backgroundColor: String(hex) }"
            />
            <p class="text-[10px] font-medium truncate">
              {{ formatColorLabel(String(name)) }}
            </p>
            <p class="text-[9px] text-muted-foreground font-mono">
              {{ hex }}
            </p>
          </div>
        </div>
      </template>
    </div>
  </UiCard>
</template>
