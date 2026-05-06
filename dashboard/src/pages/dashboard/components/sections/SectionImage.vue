<script lang="ts" setup>
interface ShowcaseImage {
  url: string
  alt?: string
  caption?: string
  description?: string
  overlay_position?: 'bottom-left' | 'bottom-center' | 'bottom-right' | 'center' | 'top-left'
}

defineProps<{
  section: {
    type: 'image-showcase'
    title?: string
    images: ShowcaseImage[]
    layout: 'full-width' | 'centered' | 'stacked' | 'side-by-side'
    height?: 'small' | 'medium' | 'large' | 'auto'
    overlay_style?: 'dark' | 'light' | 'none'
  }
}>()

function heightClass(h?: string) {
  return h === 'small' ? 'h-48 md:h-64' : h === 'medium' ? 'h-64 md:h-96' : h === 'large' ? 'h-80 md:h-[32rem]' : ''
}

function overlayPos(p?: string) {
  const m: Record<string, string> = { 'bottom-left': 'bottom-4 left-4', 'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 text-center', 'bottom-right': 'bottom-4 right-4 text-right', 'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center', 'top-left': 'top-4 left-4' }
  return m[p || 'bottom-left'] || m['bottom-left']
}
</script>

<template>
  <div v-if="section.images?.length" class="py-6">
    <h3 v-if="section.title" class="text-xl font-bold mb-4 px-8">
      {{ section.title }}
    </h3>

    <!-- Full-Width -->
    <template v-if="section.layout === 'full-width'">
      <div v-for="(img, i) in section.images" :key="i" class="relative overflow-hidden" :class="heightClass(section.height)">
        <img :src="img.url" :alt="img.alt || ''" class="w-full h-full object-cover" loading="lazy">
        <div v-if="img.caption && section.overlay_style !== 'none'" class="absolute px-4 py-2 rounded-lg max-w-md" :class="[section.overlay_style === 'light' ? 'bg-white/70 text-foreground' : 'bg-black/50 text-white', overlayPos(img.overlay_position)]">
          <p class="font-semibold text-sm">
            {{ img.caption }}
          </p>
          <p v-if="img.description" class="text-xs mt-0.5 opacity-80">
            {{ img.description }}
          </p>
        </div>
      </div>
    </template>

    <!-- Centered -->
    <div v-else-if="section.layout === 'centered'" class="px-8">
      <div v-for="(img, i) in section.images" :key="i" class="max-w-4xl mx-auto" :class="{ 'mb-6': i < section.images.length - 1 }">
        <div class="rounded-lg overflow-hidden bg-muted" :class="heightClass(section.height)">
          <img :src="img.url" :alt="img.alt || ''" class="w-full h-full" :class="section.height && section.height !== 'auto' ? 'object-cover' : 'object-contain'" loading="lazy">
        </div>
        <p v-if="img.caption" class="text-xs text-muted-foreground mt-2 text-center">
          {{ img.caption }}
        </p>
      </div>
    </div>

    <!-- Stacked -->
    <div v-else-if="section.layout === 'stacked'" class="px-8 space-y-4">
      <div v-for="(img, i) in section.images" :key="i" class="relative overflow-hidden rounded-lg bg-muted" :class="heightClass(section.height)">
        <img :src="img.url" :alt="img.alt || ''" class="w-full h-full" :class="section.height && section.height !== 'auto' ? 'object-cover' : 'object-contain'" loading="lazy">
        <div v-if="img.caption && section.overlay_style !== 'none'" class="absolute px-4 py-2 rounded-lg max-w-md" :class="[section.overlay_style === 'light' ? 'bg-white/70 text-foreground' : 'bg-black/50 text-white', overlayPos(img.overlay_position)]">
          <p class="font-semibold text-sm">
            {{ img.caption }}
          </p>
        </div>
      </div>
    </div>

    <!-- Side by Side -->
    <div v-else class="px-8">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="(img, i) in section.images" :key="i" class="relative overflow-hidden rounded-lg bg-muted" :class="heightClass(section.height)">
          <img :src="img.url" :alt="img.alt || ''" class="w-full h-full object-cover" loading="lazy">
          <div v-if="img.caption && section.overlay_style !== 'none'" class="absolute px-3 py-1.5 rounded max-w-xs" :class="[section.overlay_style === 'light' ? 'bg-white/70 text-foreground' : 'bg-black/50 text-white', overlayPos(img.overlay_position)]">
            <p class="font-semibold text-xs">
              {{ img.caption }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
