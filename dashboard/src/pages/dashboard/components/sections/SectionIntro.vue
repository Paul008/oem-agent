<script lang="ts" setup>
defineProps<{
  section: {
    type: 'intro'
    title?: string
    body_html: string
    image_url?: string
    image_position: 'left' | 'right' | 'background'
  }
}>()
</script>

<template>
  <!-- Background image variant -->
  <div
    v-if="section.image_url && section.image_position === 'background'"
    class="relative bg-cover bg-center min-h-[300px] flex items-center"
    :style="{ backgroundImage: `url(${section.image_url})` }"
  >
    <div class="absolute inset-0 bg-black/50" />
    <div class="relative z-10 px-8 py-10 w-full">
      <h3 v-if="section.title" class="text-xl font-bold mb-4 text-white">{{ section.title }}</h3>
      <div
        class="prose prose-sm prose-invert max-w-none"
        v-html="section.body_html"
      />
    </div>
  </div>

  <!-- Standard left/right variant -->
  <div v-else class="px-8 py-10">
    <h3 v-if="section.title" class="text-xl font-bold mb-4">{{ section.title }}</h3>
    <div
      :class="[
        'gap-8',
        section.image_url
          ? 'flex flex-col md:flex-row items-center'
          : '',
        section.image_position === 'left' ? 'md:flex-row-reverse' : '',
      ]"
    >
      <div
        class="prose prose-sm dark:prose-invert max-w-none flex-1"
        v-html="section.body_html"
      />
      <img
        v-if="section.image_url"
        :src="section.image_url"
        :alt="section.title || ''"
        class="rounded-lg max-w-sm w-full object-cover"
      />
    </div>
  </div>
</template>
