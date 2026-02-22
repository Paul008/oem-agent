<script lang="ts" setup>
defineProps<{
  section: {
    type: 'hero'
    heading: string
    sub_heading: string
    cta_text: string
    cta_url: string
    desktop_image_url: string
    mobile_image_url: string
    background_image_url?: string
    video_url?: string
  }
}>()
</script>

<template>
  <div
    class="relative w-full aspect-[16/7] overflow-hidden bg-muted"
    :style="section.background_image_url && !section.desktop_image_url
      ? { backgroundImage: `url(${section.background_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : undefined"
  >
    <!-- Video background -->
    <video
      v-if="section.video_url"
      :src="section.video_url"
      autoplay
      muted
      loop
      playsinline
      class="absolute inset-0 w-full h-full object-cover"
    />
    <!-- Image -->
    <img
      v-else-if="section.desktop_image_url"
      :src="section.desktop_image_url"
      :alt="section.heading"
      class="w-full h-full object-cover"
    />
    <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
    <div class="absolute inset-x-0 bottom-0 p-8">
      <h2 class="text-white text-3xl font-bold drop-shadow-lg">
        {{ section.heading }}
      </h2>
      <p v-if="section.sub_heading" class="text-white/85 text-lg mt-1 drop-shadow">
        {{ section.sub_heading }}
      </p>
      <a
        v-if="section.cta_text"
        :href="section.cta_url"
        target="_blank"
        class="inline-block mt-4 bg-white text-black text-sm font-semibold px-6 py-2.5 rounded hover:bg-white/90 transition-colors"
      >
        {{ section.cta_text }}
      </a>
    </div>
  </div>
</template>
