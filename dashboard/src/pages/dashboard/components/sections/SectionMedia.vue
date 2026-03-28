<script lang="ts" setup>
import { ref, computed } from 'vue'
import { X, ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  section: {
    type: 'media' | 'image' | 'image-showcase' | 'gallery' | 'video' | 'embed'
    title?: string
    // Gallery / Image-showcase
    images?: Array<{ url: string; alt?: string; caption?: string; description?: string; overlay_position?: string }>
    layout?: string
    height?: string
    overlay_style?: string
    // Video
    video_url?: string
    poster_url?: string
    autoplay?: boolean
    // Embed
    embed_url?: string
    embed_type?: string
    aspect_ratio?: string
    max_width?: string
    // Image (single)
    desktop_image_url?: string
    mobile_image_url?: string
    alt?: string
    caption?: string
    rounded?: boolean
    shadow?: boolean
  }
}>()

const variant = computed(() => {
  const t = props.section.type
  if (t === 'embed') return 'video' // embed uses same rendering as video
  if (t === 'image') return 'image-showcase' // single image → showcase
  return t
})

// ---- Gallery lightbox ----
const lightboxIndex = ref<number | null>(null)
function openLightbox(i: number) { lightboxIndex.value = i }
function closeLightbox() { lightboxIndex.value = null }
function prevImage(total: number) { if (lightboxIndex.value !== null) lightboxIndex.value = (lightboxIndex.value - 1 + total) % total }
function nextImage(total: number) { if (lightboxIndex.value !== null) lightboxIndex.value = (lightboxIndex.value + 1) % total }

// ---- Video embed detection ----
const embedUrl = computed(() => {
  const url = props.section.video_url || props.section.embed_url || ''
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0${props.section.autoplay ? '&autoplay=1&mute=1' : ''}`
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?${props.section.autoplay ? 'autoplay=1&muted=1' : ''}`
  if (props.section.embed_url) return props.section.embed_url // generic iframe
  return null
})
const isDirectVideo = computed(() => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(props.section.video_url || ''))
const videoLayout = computed(() => props.section.layout || 'contained')

// ---- Image-showcase helpers ----
function heightClass(h?: string) {
  return h === 'small' ? 'h-48 md:h-64' : h === 'medium' ? 'h-64 md:h-96' : h === 'large' ? 'h-80 md:h-[32rem]' : ''
}
function overlayPos(p?: string) {
  const m: Record<string, string> = { 'bottom-left': 'bottom-4 left-4', 'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 text-center', 'bottom-right': 'bottom-4 right-4 text-right', 'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center', 'top-left': 'top-4 left-4' }
  return m[p || 'bottom-left'] || m['bottom-left']
}

// Normalize single image to images array for showcase rendering
const showcaseImages = computed(() => {
  if (props.section.images?.length) return props.section.images
  if (props.section.desktop_image_url) return [{ url: props.section.desktop_image_url, alt: props.section.alt, caption: props.section.caption }]
  return []
})
</script>

<template>
  <!-- ═══ Gallery variant ═══ -->
  <div v-if="variant === 'gallery' && section.images?.length" class="px-8 py-10">
    <h3 v-if="section.title" class="text-xl font-bold mb-4">{{ section.title }}</h3>

    <UiCarousel v-if="section.layout === 'carousel'" class="w-full">
      <UiCarouselContent>
        <UiCarouselItem v-for="(image, index) in section.images" :key="index" class="basis-full md:basis-1/2 lg:basis-1/3">
          <div class="p-1 cursor-pointer" @click="openLightbox(index)">
            <div class="aspect-[4/3] rounded-lg overflow-hidden bg-muted">
              <img :src="image.url" :alt="image.alt || `Gallery image ${index + 1}`" class="w-full h-full object-cover" />
            </div>
            <p v-if="image.caption" class="text-xs text-muted-foreground mt-1.5 text-center truncate">{{ image.caption }}</p>
          </div>
        </UiCarouselItem>
      </UiCarouselContent>
      <UiCarouselPrevious />
      <UiCarouselNext />
    </UiCarousel>

    <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      <div v-for="(image, index) in section.images" :key="index" class="cursor-pointer group" @click="openLightbox(index)">
        <div class="aspect-[4/3] rounded-lg overflow-hidden bg-muted">
          <img :src="image.url" :alt="image.alt || ''" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
        <p v-if="image.caption" class="text-xs text-muted-foreground mt-1.5 text-center truncate">{{ image.caption }}</p>
      </div>
    </div>

    <!-- Lightbox -->
    <Teleport to="body">
      <div v-if="lightboxIndex !== null && section.images?.[lightboxIndex]" class="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center" @click.self="closeLightbox">
        <div class="relative max-w-4xl w-full mx-4 bg-card rounded-xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
          <button class="absolute top-3 right-3 z-10 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors" @click="closeLightbox"><X class="size-5" /></button>
          <div class="relative bg-muted">
            <img :src="section.images[lightboxIndex].url" :alt="section.images[lightboxIndex].alt || ''" class="w-full max-h-[60vh] object-contain" />
            <button v-if="section.images.length > 1" class="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white" @click.stop="prevImage(section.images.length)"><ChevronLeft class="size-5" /></button>
            <button v-if="section.images.length > 1" class="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white" @click.stop="nextImage(section.images.length)"><ChevronRight class="size-5" /></button>
          </div>
          <div v-if="section.images[lightboxIndex].caption || section.images[lightboxIndex].description" class="px-6 py-4 border-t">
            <h4 v-if="section.images[lightboxIndex].caption" class="font-semibold text-sm">{{ section.images[lightboxIndex].caption }}</h4>
            <p v-if="section.images[lightboxIndex].description" class="text-sm text-muted-foreground mt-1.5">{{ section.images[lightboxIndex].description }}</p>
            <p class="text-xs text-muted-foreground/50 mt-2">{{ lightboxIndex + 1 }} / {{ section.images.length }}</p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>

  <!-- ═══ Video / Embed variant ═══ -->
  <div v-else-if="variant === 'video'" :class="videoLayout === 'full-width' ? '' : 'py-6 px-8'">
    <h3 v-if="section.title" class="text-xl font-bold mb-4" :class="{ 'px-8 pt-6': videoLayout === 'full-width' }">{{ section.title }}</h3>
    <div :class="{ 'w-full': videoLayout === 'full-width', 'max-w-5xl mx-auto': videoLayout === 'wide', 'max-w-4xl mx-auto': videoLayout === 'contained' }">
      <div class="overflow-hidden" :class="{ 'rounded-lg': videoLayout !== 'full-width' }">
        <div v-if="embedUrl" class="relative w-full aspect-video">
          <iframe :src="embedUrl" class="absolute inset-0 w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen />
        </div>
        <div v-else-if="isDirectVideo || section.video_url" class="relative w-full aspect-video">
          <video :src="section.video_url" :poster="section.poster_url" :autoplay="section.autoplay" controls muted playsinline class="absolute inset-0 w-full h-full" :class="videoLayout === 'full-width' ? 'object-cover' : 'object-contain'" />
        </div>
        <div v-else-if="section.poster_url" class="relative w-full aspect-video">
          <img :src="section.poster_url" :alt="section.title || ''" class="absolute inset-0 w-full h-full object-cover" />
          <div class="absolute inset-0 flex items-center justify-center"><div class="size-16 rounded-full bg-black/60 flex items-center justify-center"><svg class="size-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></div></div>
        </div>
        <div v-else class="aspect-video flex items-center justify-center text-muted-foreground text-sm">No video available</div>
      </div>
    </div>
  </div>

  <!-- ═══ Image / Image-Showcase variant ═══ -->
  <div v-else-if="showcaseImages.length" class="py-6">
    <h3 v-if="section.title" class="text-xl font-bold mb-4 px-8">{{ section.title }}</h3>

    <template v-if="section.layout === 'full-width'">
      <div v-for="(img, i) in showcaseImages" :key="i" class="relative overflow-hidden" :class="heightClass(section.height)">
        <img :src="img.url" :alt="img.alt || ''" class="w-full h-full object-cover" loading="lazy" />
        <div v-if="img.caption && section.overlay_style !== 'none'" class="absolute px-4 py-2 rounded-lg max-w-md" :class="[section.overlay_style === 'light' ? 'bg-white/70 text-foreground' : 'bg-black/50 text-white', overlayPos(img.overlay_position)]">
          <p class="font-semibold text-sm">{{ img.caption }}</p>
          <p v-if="img.description" class="text-xs mt-0.5 opacity-80">{{ img.description }}</p>
        </div>
      </div>
    </template>

    <div v-else-if="section.layout === 'centered'" class="px-8">
      <div v-for="(img, i) in showcaseImages" :key="i" class="max-w-4xl mx-auto" :class="{ 'mb-6': i < showcaseImages.length - 1 }">
        <div class="rounded-lg overflow-hidden bg-muted" :class="heightClass(section.height)">
          <img :src="img.url" :alt="img.alt || ''" class="w-full h-full" :class="section.height && section.height !== 'auto' ? 'object-cover' : 'object-contain'" loading="lazy" />
        </div>
        <p v-if="img.caption" class="text-xs text-muted-foreground mt-2 text-center">{{ img.caption }}</p>
      </div>
    </div>

    <div v-else-if="section.layout === 'side-by-side'" class="px-8">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="(img, i) in showcaseImages" :key="i" class="relative overflow-hidden rounded-lg bg-muted" :class="heightClass(section.height)">
          <img :src="img.url" :alt="img.alt || ''" class="w-full h-full object-cover" loading="lazy" />
          <div v-if="img.caption && section.overlay_style !== 'none'" class="absolute px-3 py-1.5 rounded max-w-xs" :class="[section.overlay_style === 'light' ? 'bg-white/70 text-foreground' : 'bg-black/50 text-white', overlayPos(img.overlay_position)]">
            <p class="font-semibold text-xs">{{ img.caption }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Stacked (default) -->
    <div v-else class="px-8 space-y-4">
      <div v-for="(img, i) in showcaseImages" :key="i" class="relative overflow-hidden rounded-lg bg-muted" :class="heightClass(section.height)">
        <img :src="img.url" :alt="img.alt || ''" class="w-full h-full" :class="section.height && section.height !== 'auto' ? 'object-cover' : 'object-contain'" loading="lazy" />
        <div v-if="img.caption && section.overlay_style !== 'none'" class="absolute px-4 py-2 rounded-lg max-w-md" :class="[section.overlay_style === 'light' ? 'bg-white/70 text-foreground' : 'bg-black/50 text-white', overlayPos(img.overlay_position)]">
          <p class="font-semibold text-sm">{{ img.caption }}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Fallback -->
  <div v-else class="px-8 py-10 text-sm text-muted-foreground">No media content</div>
</template>
