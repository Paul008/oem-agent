<script lang="ts" setup>
defineProps<{
  section: {
    type: 'cta-banner'
    heading: string
    body?: string
    cta_text: string
    cta_url: string
    background_color?: string
  }
}>()
</script>

<template>
  <div
    class="px-8 py-12 text-center"
    :style="section.background_color ? { backgroundColor: section.background_color } : {}"
    :class="section.background_color ? 'text-white' : 'bg-primary text-primary-foreground'"
  >
    <h3 class="text-2xl font-bold mb-2">{{ section.heading }}</h3>
    <p v-if="section.body" class="mb-4 opacity-90">{{ section.body }}</p>
    <a
      :href="section.cta_url"
      target="_blank"
      class="inline-block bg-white text-black text-sm font-semibold px-6 py-2.5 rounded hover:bg-white/90 transition-colors"
    >
      {{ section.cta_text }}
    </a>
  </div>
</template>
