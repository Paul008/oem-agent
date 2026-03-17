<script lang="ts" setup>
const props = defineProps<{
  section: {
    type: 'logo-strip'
    title?: string
    logos: Array<{ name: string; image_url: string; link_url?: string }>
    grayscale: boolean
  }
}>()
</script>

<template>
  <div class="px-8 py-6">
    <h2 v-if="section.title" class="text-sm font-semibold text-center text-muted-foreground mb-4">{{ section.title }}</h2>
    <div class="flex flex-wrap items-center justify-center gap-6">
      <component
        v-for="(logo, i) in section.logos"
        :key="i"
        :is="logo.link_url ? 'a' : 'div'"
        v-bind="logo.link_url ? { href: logo.link_url, target: '_blank' } : {}"
        class="shrink-0"
      >
        <img
          v-if="logo.image_url"
          :src="logo.image_url"
          :alt="logo.name"
          class="h-10 max-w-[120px] object-contain transition-all"
          :class="section.grayscale ? 'grayscale opacity-50 hover:grayscale-0 hover:opacity-100' : ''"
        />
        <div
          v-else
          class="h-10 px-4 flex items-center justify-center bg-muted rounded text-xs text-muted-foreground"
        >
          {{ logo.name || 'Logo' }}
        </div>
      </component>
    </div>
  </div>
</template>
