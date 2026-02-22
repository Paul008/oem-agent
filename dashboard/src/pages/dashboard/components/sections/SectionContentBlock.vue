<script lang="ts" setup>
defineProps<{
  section: {
    type: 'content-block'
    title?: string
    content_html: string
    layout: 'full-width' | 'contained' | 'two-column'
    background?: string
    image_url?: string
  }
}>()
</script>

<template>
  <div
    class="py-10"
    :style="section.background ? { backgroundColor: section.background } : {}"
  >
    <div :class="section.layout === 'full-width' ? 'px-8' : 'px-8 max-w-5xl mx-auto'">
      <h3 v-if="section.title" class="text-xl font-bold mb-4">{{ section.title }}</h3>

      <!-- Two-column layout -->
      <div v-if="section.layout === 'two-column' && section.image_url" class="flex flex-col md:flex-row gap-8 items-center">
        <div
          class="prose prose-sm dark:prose-invert max-w-none flex-1"
          v-html="section.content_html"
        />
        <img
          :src="section.image_url"
          :alt="section.title || ''"
          class="rounded-lg max-w-sm w-full object-cover"
        />
      </div>

      <!-- Single column layout -->
      <div v-else>
        <div
          class="prose prose-sm dark:prose-invert max-w-none"
          v-html="section.content_html"
        />
        <img
          v-if="section.image_url"
          :src="section.image_url"
          :alt="section.title || ''"
          class="rounded-lg mt-4 max-w-2xl w-full object-cover"
        />
      </div>
    </div>
  </div>
</template>
