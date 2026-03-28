<script lang="ts" setup>
import { Layers } from 'lucide-vue-next'

defineProps<{
  components: any
}>()
</script>

<template>
  <UiCard v-if="components && Object.keys(components).length" class="overflow-hidden">
    <div class="px-6 pt-6 pb-2">
      <div class="flex items-center gap-2 mb-1">
        <Layers class="size-5 text-muted-foreground" />
        <h2 class="text-2xl font-bold">Components</h2>
      </div>
      <p class="text-sm text-muted-foreground">Component-level design specifications</p>
    </div>

    <div class="px-6 pb-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        <!-- Card component -->
        <div v-if="components.card" class="border rounded-lg p-4 space-y-3">
          <h3 class="text-sm font-semibold">Card</h3>
          <div class="space-y-1.5 text-xs text-muted-foreground">
            <div v-if="components.card.background" class="flex justify-between">
              <span>Background</span>
              <div class="flex items-center gap-1.5">
                <div class="size-3 rounded border" :style="{ backgroundColor: components.card.background }" />
                <span class="font-mono">{{ components.card.background }}</span>
              </div>
            </div>
            <div v-if="components.card.radius || components.card.borderRadius" class="flex justify-between">
              <span>Radius</span>
              <span class="font-mono">{{ components.card.radius || components.card.borderRadius }}</span>
            </div>
            <div v-if="components.card.shadow || components.card.boxShadow" class="flex justify-between">
              <span>Shadow</span>
              <span class="font-mono text-[10px]">{{ components.card.shadow || components.card.boxShadow }}</span>
            </div>
            <div v-if="components.card.padding" class="flex justify-between">
              <span>Padding</span>
              <span class="font-mono">{{ components.card.padding }}</span>
            </div>
          </div>
        </div>

        <!-- Hero component -->
        <div v-if="components.hero" class="border rounded-lg p-4 space-y-3">
          <h3 class="text-sm font-semibold">Hero</h3>
          <div class="space-y-1.5 text-xs text-muted-foreground">
            <div v-if="components.hero.min_height || components.hero.minHeight" class="flex justify-between">
              <span>Min Height</span>
              <span class="font-mono">{{ components.hero.min_height || components.hero.minHeight }}</span>
            </div>
            <div v-if="components.hero.overlay" class="flex justify-between">
              <span>Overlay</span>
              <span class="font-mono">{{ components.hero.overlay }}</span>
            </div>
            <div v-if="components.hero.text_align || components.hero.textAlign" class="flex justify-between">
              <span>Text Align</span>
              <span class="font-mono">{{ components.hero.text_align || components.hero.textAlign }}</span>
            </div>
          </div>
        </div>

        <!-- Nav component -->
        <div v-if="components.nav" class="border rounded-lg p-4 space-y-3">
          <h3 class="text-sm font-semibold">Navigation</h3>
          <div class="space-y-1.5 text-xs text-muted-foreground">
            <div v-if="components.nav.height" class="flex justify-between">
              <span>Height</span>
              <span class="font-mono">{{ components.nav.height }}</span>
            </div>
            <div v-if="components.nav.background" class="flex justify-between">
              <span>Background</span>
              <div class="flex items-center gap-1.5">
                <div class="size-3 rounded border" :style="{ backgroundColor: components.nav.background }" />
                <span class="font-mono">{{ components.nav.background }}</span>
              </div>
            </div>
            <div v-if="components.nav.sticky !== undefined" class="flex justify-between">
              <span>Sticky</span>
              <span class="font-mono">{{ components.nav.sticky ? 'Yes' : 'No' }}</span>
            </div>
          </div>
        </div>

        <!-- Generic components -->
        <template v-for="(spec, name) in components" :key="String(name)">
          <div
            v-if="!['card', 'hero', 'nav'].includes(String(name)) && typeof spec === 'object'"
            class="border rounded-lg p-4 space-y-3"
          >
            <h3 class="text-sm font-semibold capitalize">{{ String(name).replace(/_/g, ' ') }}</h3>
            <div class="space-y-1.5 text-xs text-muted-foreground">
              <div v-for="(val, prop) in (spec as Record<string, any>)" :key="String(prop)" class="flex justify-between">
                <span class="capitalize">{{ String(prop).replace(/_/g, ' ') }}</span>
                <span class="font-mono text-[10px] max-w-[160px] truncate text-right">{{ val }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </UiCard>
</template>
