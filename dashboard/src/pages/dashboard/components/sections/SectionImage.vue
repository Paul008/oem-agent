<script lang="ts" setup>
defineProps<{
  section: {
    type: 'image'
    url: string
    alt?: string
    caption?: string
    layout: 'full-width' | 'contained' | 'center' | 'left' | 'right'
    aspect_ratio?: '16:9' | '4:3' | '3:2' | '21:9' | 'auto'
    rounded?: boolean
    shadow?: boolean
    link_url?: string
    max_width?: string
    background?: string
  }
}>()
</script>

<template>
  <div
    class="py-6"
    :class="{
      'px-0': section.layout === 'full-width',
      'px-8': section.layout !== 'full-width',
      'bg-muted/30': section.background === 'muted',
      'bg-black': section.background === 'dark',
    }"
  >
    <div
      :class="{
        'w-full': section.layout === 'full-width',
        'max-w-4xl mx-auto': section.layout === 'contained' || section.layout === 'center',
        'max-w-2xl mr-auto': section.layout === 'left',
        'max-w-2xl ml-auto': section.layout === 'right',
      }"
      :style="section.max_width ? { maxWidth: section.max_width } : undefined"
    >
      <component
        :is="section.link_url ? 'a' : 'div'"
        :href="section.link_url || undefined"
        :target="section.link_url ? '_blank' : undefined"
        :rel="section.link_url ? 'noopener' : undefined"
        class="block"
        :class="{ 'cursor-pointer hover:opacity-90 transition-opacity': section.link_url }"
      >
        <div
          class="overflow-hidden"
          :class="{
            'rounded-lg': section.rounded !== false && section.layout !== 'full-width',
            'shadow-lg': section.shadow,
            'aspect-video': section.aspect_ratio === '16:9',
            'aspect-[4/3]': section.aspect_ratio === '4:3',
            'aspect-[3/2]': section.aspect_ratio === '3:2',
            'aspect-[21/9]': section.aspect_ratio === '21:9',
          }"
        >
          <img
            v-if="section.url"
            :src="section.url"
            :alt="section.alt || ''"
            class="w-full h-full"
            :class="{
              'object-cover': section.aspect_ratio && section.aspect_ratio !== 'auto',
              'object-contain': !section.aspect_ratio || section.aspect_ratio === 'auto',
            }"
            loading="lazy"
          />
        </div>
      </component>

      <p
        v-if="section.caption"
        class="text-xs text-muted-foreground mt-2"
        :class="{
          'text-center': section.layout === 'center' || section.layout === 'contained',
          'text-left': section.layout === 'left' || section.layout === 'full-width',
          'text-right': section.layout === 'right',
        }"
      >
        {{ section.caption }}
      </p>
    </div>
  </div>
</template>
