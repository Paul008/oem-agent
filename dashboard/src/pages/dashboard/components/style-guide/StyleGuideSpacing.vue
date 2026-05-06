<script lang="ts" setup>
import { Ruler } from 'lucide-vue-next'

defineProps<{
  spacing: any
  colors: any
}>()
</script>

<template>
  <UiCard v-if="spacing" class="overflow-hidden">
    <div class="px-6 pt-6 pb-2">
      <div class="flex items-center gap-2 mb-1">
        <Ruler class="size-5 text-muted-foreground" />
        <h2 class="text-2xl font-bold">
          Spacing
        </h2>
      </div>
      <p class="text-sm text-muted-foreground">
        Layout spacing scale and container dimensions
      </p>
    </div>

    <div class="px-6 pb-6">
      <!-- Key metrics -->
      <div class="grid grid-cols-3 gap-4 mt-4 mb-6">
        <div v-if="spacing.container_max_width" class="border rounded-lg px-4 py-3">
          <p class="text-xs text-muted-foreground mb-1">
            Container Max Width
          </p>
          <p class="text-lg font-semibold font-mono">
            {{ spacing.container_max_width }}px
          </p>
        </div>
        <div v-if="spacing.section_gap" class="border rounded-lg px-4 py-3">
          <p class="text-xs text-muted-foreground mb-1">
            Section Gap
          </p>
          <p class="text-lg font-semibold font-mono">
            {{ spacing.section_gap }}px
          </p>
        </div>
        <div v-if="spacing.container_padding" class="border rounded-lg px-4 py-3">
          <p class="text-xs text-muted-foreground mb-1">
            Container Padding
          </p>
          <p class="text-lg font-semibold font-mono">
            {{ spacing.container_padding }}px
          </p>
        </div>
      </div>

      <!-- Scale bars -->
      <template v-if="spacing.scale && Object.keys(spacing.scale).length">
        <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Spacing Scale
        </h3>
        <div class="space-y-2">
          <div
            v-for="(value, name) in spacing.scale"
            :key="String(name)"
            class="flex items-center gap-3"
          >
            <span class="w-16 text-xs text-muted-foreground font-mono text-right shrink-0">{{ name }}</span>
            <div
              class="h-5 rounded"
              :style="{
                width: `${Math.min(Number(value) || 0, 400)}px`,
                backgroundColor: colors?.primary || 'hsl(var(--primary))',
                opacity: 0.6,
              }"
            />
            <span class="text-xs text-muted-foreground font-mono">{{ value }}px</span>
          </div>
        </div>
      </template>
    </div>
  </UiCard>
</template>
