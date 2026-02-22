<script lang="ts" setup>
defineProps<{
  section: {
    type: 'map'
    title?: string
    sub_heading?: string
    embed_url: string
  }
}>()
</script>

<template>
  <div class="px-8 py-10">
    <h3 v-if="section.title" class="text-xl font-bold mb-2">{{ section.title }}</h3>
    <p v-if="section.sub_heading" class="text-sm text-muted-foreground mb-6">{{ section.sub_heading }}</p>
    <div v-if="section.embed_url" class="rounded-lg overflow-hidden border">
      <iframe
        :src="section.embed_url"
        width="100%"
        height="400"
        style="border: 0"
        allowfullscreen
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
      />
    </div>
    <div v-else class="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center bg-muted/20 h-[400px] flex items-center justify-center">
      <p class="text-sm text-muted-foreground">Paste a Google Maps embed URL to display the map</p>
    </div>
  </div>
</template>
