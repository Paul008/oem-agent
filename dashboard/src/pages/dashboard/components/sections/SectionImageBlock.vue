<script lang="ts" setup>
defineProps<{
  section: {
    type: 'image'
    desktop_image_url: string
    mobile_image_url?: string
    alt?: string
    caption?: string
    layout: 'full-width' | 'contained' | 'center' | 'left' | 'right'
    aspect_ratio?: 'auto' | '16:9' | '21:9' | '4:3' | '1:1'
    rounded?: boolean
    shadow?: boolean
  }
}>()

function aspectClass(ratio?: string) {
  const map: Record<string, string> = {
    '16:9': 'aspect-video',
    '21:9': 'aspect-[21/9]',
    '4:3': 'aspect-[4/3]',
    '1:1': 'aspect-square',
  }
  return map[ratio || ''] || ''
}
</script>

<template>
  <div v-if="section.desktop_image_url">
    <!-- Full-width: raw edge-to-edge, 100% of container -->
    <template v-if="section.layout === 'full-width'">
      <div class="w-full overflow-hidden" :class="[aspectClass(section.aspect_ratio)]">
        <picture>
          <source v-if="section.mobile_image_url" :srcset="section.mobile_image_url" media="(max-width: 768px)" />
          <img
            :src="section.desktop_image_url"
            :alt="section.alt || ''"
            class="block w-full"
            :class="section.aspect_ratio && section.aspect_ratio !== 'auto' ? 'h-full object-cover' : 'h-auto'"
            loading="lazy"
          />
        </picture>
      </div>
      <p v-if="section.caption" class="text-xs text-muted-foreground mt-2 px-8">{{ section.caption }}</p>
    </template>

    <!-- Contained: max-width with optional rounding/shadow -->
    <template v-else-if="section.layout === 'contained'">
      <div class="px-8 py-4">
        <div
          class="max-w-4xl mx-auto overflow-hidden bg-muted"
          :class="[
            section.rounded ? 'rounded-lg' : '',
            section.shadow ? 'shadow-lg' : '',
            aspectClass(section.aspect_ratio),
          ]"
        >
          <picture>
            <source v-if="section.mobile_image_url" :srcset="section.mobile_image_url" media="(max-width: 768px)" />
            <img
              :src="section.desktop_image_url"
              :alt="section.alt || ''"
              class="w-full"
              :class="section.aspect_ratio && section.aspect_ratio !== 'auto' ? 'h-full object-cover' : 'h-auto'"
              loading="lazy"
            />
          </picture>
        </div>
        <p v-if="section.caption" class="text-xs text-muted-foreground mt-2 text-center max-w-4xl mx-auto">{{ section.caption }}</p>
      </div>
    </template>

    <!-- Center -->
    <template v-else-if="section.layout === 'center'">
      <div class="px-8 py-4 text-center">
        <div
          class="inline-block overflow-hidden bg-muted"
          :class="[
            section.rounded ? 'rounded-lg' : '',
            section.shadow ? 'shadow-lg' : '',
            aspectClass(section.aspect_ratio),
          ]"
        >
          <picture>
            <source v-if="section.mobile_image_url" :srcset="section.mobile_image_url" media="(max-width: 768px)" />
            <img
              :src="section.desktop_image_url"
              :alt="section.alt || ''"
              class="block max-w-full"
              :class="section.aspect_ratio && section.aspect_ratio !== 'auto' ? 'h-full object-cover' : 'h-auto'"
              loading="lazy"
            />
          </picture>
        </div>
        <p v-if="section.caption" class="text-xs text-muted-foreground mt-2">{{ section.caption }}</p>
      </div>
    </template>

    <!-- Left / Right aligned -->
    <template v-else>
      <div class="px-8 py-4" :class="section.layout === 'right' ? 'text-right' : 'text-left'">
        <div
          class="inline-block max-w-xl overflow-hidden bg-muted"
          :class="[
            section.rounded ? 'rounded-lg' : '',
            section.shadow ? 'shadow-lg' : '',
            aspectClass(section.aspect_ratio),
          ]"
        >
          <picture>
            <source v-if="section.mobile_image_url" :srcset="section.mobile_image_url" media="(max-width: 768px)" />
            <img
              :src="section.desktop_image_url"
              :alt="section.alt || ''"
              class="block max-w-full"
              :class="section.aspect_ratio && section.aspect_ratio !== 'auto' ? 'h-full object-cover' : 'h-auto'"
              loading="lazy"
            />
          </picture>
        </div>
        <p v-if="section.caption" class="text-xs text-muted-foreground mt-2">{{ section.caption }}</p>
      </div>
    </template>
  </div>

  <!-- Empty state -->
  <div v-else class="px-8 py-12 text-center bg-muted/30">
    <p class="text-sm text-muted-foreground">No image set</p>
  </div>
</template>
