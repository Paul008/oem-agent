<script lang="ts" setup>
defineProps<{
  section: {
    type: 'video'
    title?: string
    video_url: string
    poster_url?: string
    autoplay: boolean
  }
}>()
</script>

<template>
  <div class="px-8 py-10">
    <h3 v-if="section.title" class="text-xl font-bold mb-4">{{ section.title }}</h3>
    <div class="rounded-lg overflow-hidden bg-black">
      <!-- Video with actual source -->
      <video
        v-if="section.video_url"
        :src="section.video_url"
        :poster="section.poster_url"
        :autoplay="section.autoplay"
        controls
        muted
        playsinline
        class="w-full max-h-[500px]"
      />
      <!-- Poster-only fallback (video has no source, just a poster image) -->
      <div v-else-if="section.poster_url" class="relative">
        <img
          :src="section.poster_url"
          :alt="section.title || 'Video poster'"
          class="w-full max-h-[500px] object-cover"
        />
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="size-16 rounded-full bg-black/60 flex items-center justify-center">
            <svg class="size-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <!-- No video or poster -->
      <div v-else class="aspect-video flex items-center justify-center text-muted-foreground text-sm">
        No video available
      </div>
    </div>
  </div>
</template>
