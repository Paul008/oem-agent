<script lang="ts" setup>
import { computed } from 'vue'

const props = defineProps<{
  section: {
    type: 'split-content' | 'intro' | 'content-block'
    title?: string
    body_html?: string
    content_html?: string
    image_url?: string
    image_position?: 'left' | 'right' | 'background'
    layout?: 'full-width' | 'contained' | 'two-column'
    background?: string
  }
}>()

const html = computed(() => props.section.body_html || props.section.content_html || '')
const imgPos = computed(() => props.section.image_position || (props.section.layout === 'two-column' ? 'right' : undefined))
const isBackground = computed(() => imgPos.value === 'background')
const isContained = computed(() => props.section.layout === 'contained')
</script>

<template>
  <!-- Background image variant -->
  <div
    v-if="isBackground && section.image_url"
    class="relative bg-cover bg-center min-h-[300px] flex items-center"
    :style="{ backgroundImage: `url(${section.image_url})` }"
  >
    <div class="absolute inset-0 bg-black/50" />
    <div class="relative z-10 px-8 py-10 w-full">
      <h3 v-if="section.title" class="text-xl font-bold mb-4 text-white">{{ section.title }}</h3>
      <div class="prose prose-sm prose-invert max-w-none" v-html="html" />
    </div>
  </div>

  <!-- Standard text + optional image -->
  <div
    v-else
    class="py-10"
    :style="section.background ? { backgroundColor: section.background } : {}"
  >
    <div :class="isContained ? 'px-8 max-w-5xl mx-auto' : 'px-8'">
      <h3 v-if="section.title" class="text-xl font-bold mb-4">{{ section.title }}</h3>

      <!-- Split layout (image left or right) -->
      <div
        v-if="section.image_url && imgPos"
        :class="[
          'flex flex-col md:flex-row gap-8 items-center',
          imgPos === 'left' ? 'md:flex-row-reverse' : '',
        ]"
      >
        <div class="prose prose-sm dark:prose-invert max-w-none flex-1" v-html="html" />
        <img
          :src="section.image_url"
          :alt="section.title || ''"
          class="rounded-lg max-w-sm w-full object-cover"
        />
      </div>

      <!-- Single column (no image or no position) -->
      <div v-else>
        <div class="prose prose-sm dark:prose-invert max-w-none" v-html="html" />
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
