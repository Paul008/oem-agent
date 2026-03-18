<script lang="ts" setup>
import { computed } from 'vue'

const props = defineProps<{
  section: {
    type: 'video'
    title?: string
    video_url: string
    poster_url?: string
    autoplay: boolean
    layout?: 'full-width' | 'contained' | 'wide'
  }
}>()

/** Detect YouTube/Vimeo and return embed URL */
const embedUrl = computed(() => {
  const url = props.section.video_url || ''
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0${props.section.autoplay ? '&autoplay=1&mute=1' : ''}`
  // Vimeo
  const vmMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vmMatch) return `https://player.vimeo.com/video/${vmMatch[1]}?${props.section.autoplay ? 'autoplay=1&muted=1' : ''}`
  return null
})

const isDirectVideo = computed(() => {
  const url = props.section.video_url || ''
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)
})

const layout = computed(() => props.section.layout || 'contained')
</script>

<template>
  <div
    class="py-6"
    :class="{
      'px-0': layout === 'full-width',
      'px-8': layout !== 'full-width',
    }"
  >
    <h3
      v-if="section.title"
      class="text-xl font-bold mb-4"
      :class="{ 'px-8': layout === 'full-width' }"
    >
      {{ section.title }}
    </h3>

    <div
      :class="{
        'w-full': layout === 'full-width',
        'max-w-5xl mx-auto': layout === 'wide',
        'max-w-4xl mx-auto': layout === 'contained',
      }"
    >
      <div
        class="overflow-hidden"
        :class="{ 'rounded-lg': layout !== 'full-width' }"
      >
        <!-- YouTube / Vimeo embed -->
        <div v-if="embedUrl" class="relative w-full" style="padding-bottom: 56.25%">
          <iframe
            :src="embedUrl"
            class="absolute inset-0 w-full h-full"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          />
        </div>

        <!-- Direct video file -->
        <div v-else-if="isDirectVideo || section.video_url" class="relative w-full" style="padding-bottom: 56.25%">
          <video
            v-if="section.video_url"
            :src="section.video_url"
            :poster="section.poster_url"
            :autoplay="section.autoplay"
            controls
            muted
            playsinline
            class="absolute inset-0 w-full h-full object-contain"
          />
        </div>

        <!-- Poster-only fallback -->
        <div v-else-if="section.poster_url" class="relative w-full" style="padding-bottom: 56.25%">
          <img
            :src="section.poster_url"
            :alt="section.title || 'Video poster'"
            class="absolute inset-0 w-full h-full object-cover"
          />
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="size-16 rounded-full bg-black/60 flex items-center justify-center">
              <svg class="size-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>

        <!-- No video -->
        <div v-else class="aspect-video flex items-center justify-center text-muted-foreground text-sm">
          No video available
        </div>
      </div>
    </div>
  </div>
</template>
