<script lang="ts" setup>
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import { nextTick, ref, watch } from 'vue'

import { useInlineEdit } from '@/composables/use-inline-edit'

const props = defineProps<{
  section: {
    type: 'gallery'
    title?: string
    description?: string
    images: Array<{ url: string, alt?: string, caption?: string, description?: string }>
    layout: 'carousel' | 'grid'
    initial_index?: number
    lightbox?: boolean
    _adaptive_match?: boolean
    _adaptive_layout?: { desktopColumns?: number, tabletColumns?: number, mobileColumns?: number }
    _adaptive_interaction?: { wrap?: boolean, keyboard?: boolean, showIndicators?: boolean }
  }
}>()

const emit = defineEmits<{
  'inline-edit': [field: string, value: string, el: HTMLElement]
  'update-text': [field: string, value: string]
}>()
const titleEdit = useInlineEdit(v => emit('update-text', 'title', v))
function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) {
  const el = e.target as HTMLElement; edit.startEdit(el); emit('inline-edit', field, el.textContent || '', el)
}
const lightboxIndex = ref<number | null>(null)
const lightboxRoot = ref<HTMLElement | null>(null)
const activeIndex = ref(Math.min(props.section.initial_index ?? 0, Math.max(0, props.section.images.length - 1)))

watch(lightboxIndex, async (index) => {
  if (index === null)
    return
  await nextTick()
  lightboxRoot.value?.focus()
})

function openLightbox(index: number) {
  if (props.section.lightbox === false)
    return
  lightboxIndex.value = index
}

function closeLightbox() {
  lightboxIndex.value = null
}

function prevImage(total: number) {
  if (lightboxIndex.value === null)
    return
  lightboxIndex.value = props.section._adaptive_interaction?.wrap === false
    ? Math.max(0, lightboxIndex.value - 1)
    : (lightboxIndex.value - 1 + total) % total
}

function nextImage(total: number) {
  if (lightboxIndex.value === null)
    return
  lightboxIndex.value = props.section._adaptive_interaction?.wrap === false
    ? Math.min(total - 1, lightboxIndex.value + 1)
    : (lightboxIndex.value + 1) % total
}

function adaptivePrevious() {
  const total = props.section.images.length
  activeIndex.value = activeIndex.value === 0
    ? (props.section._adaptive_interaction?.wrap === false ? 0 : total - 1)
    : activeIndex.value - 1
}

function adaptiveNext() {
  const total = props.section.images.length
  activeIndex.value = activeIndex.value === total - 1
    ? (props.section._adaptive_interaction?.wrap === false ? total - 1 : 0)
    : activeIndex.value + 1
}
</script>

<template>
  <div v-if="section.images?.length" class="px-8 py-10" data-adaptive-section="gallery">
    <h3 class="text-xl font-bold mb-4 cursor-text outline-none" :style="{ opacity: section.title ? 1 : 0.4 }" @dblclick="startEditing('title', titleEdit, $event)" @blur="titleEdit.stopEdit()" @keydown="titleEdit.onKeydown" @paste="titleEdit.onPaste">
      {{ section.title || 'Double-click to add title' }}
    </h3>
    <p v-if="section.description" class="mb-6 text-sm leading-relaxed text-muted-foreground">
      {{ section.description }}
    </p>

    <!-- Carousel layout -->
    <div
      v-if="section.layout === 'carousel' && section._adaptive_match"
      class="relative w-full"
      :tabindex="section._adaptive_interaction?.keyboard ? 0 : undefined"
      aria-roledescription="carousel"
      :style="{
        '--adaptive-desktop-columns': section._adaptive_layout?.desktopColumns || 3,
        '--adaptive-tablet-columns': section._adaptive_layout?.tabletColumns || 2,
        '--adaptive-mobile-columns': section._adaptive_layout?.mobileColumns || 1,
      }"
      @keydown.left.prevent="section._adaptive_interaction?.keyboard && adaptivePrevious()"
      @keydown.right.prevent="section._adaptive_interaction?.keyboard && adaptiveNext()"
    >
      <div class="overflow-hidden">
        <div
          class="adaptive-gallery-track"
          :style="{ transform: `translateX(calc(${activeIndex} * -100% / var(--adaptive-columns)))` }"
        >
          <article
            v-for="(image, index) in section.images"
            :key="index"
            class="adaptive-gallery-item p-1 cursor-pointer"
            :data-adaptive-item="index"
            :data-adaptive-active="index === activeIndex"
            @click="openLightbox(index)"
          >
            <div class="aspect-[4/3] rounded-lg overflow-hidden bg-muted">
              <img :src="image.url" :alt="image.alt || `Gallery image ${index + 1}`" class="w-full h-full object-cover">
            </div>
            <p v-if="image.caption" class="text-xs text-muted-foreground mt-1.5 text-center truncate">
              {{ image.caption }}
            </p>
          </article>
        </div>
      </div>
      <button type="button" data-adaptive-prev aria-label="Previous image" class="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow" @click="adaptivePrevious">
        <ChevronLeft class="size-5" />
      </button>
      <button type="button" data-adaptive-next aria-label="Next image" class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow" @click="adaptiveNext">
        <ChevronRight class="size-5" />
      </button>
      <div v-if="section._adaptive_interaction?.showIndicators" class="mt-3 flex justify-center gap-2" aria-label="Choose image">
        <button
          v-for="(_, index) in section.images"
          :key="index"
          type="button"
          data-adaptive-indicator
          :aria-label="`Show image ${index + 1}`"
          :aria-current="index === activeIndex ? 'true' : undefined"
          class="size-2.5 rounded-full bg-muted-foreground/30"
          :class="index === activeIndex && 'bg-foreground'"
          @click="activeIndex = index"
        />
      </div>
    </div>

    <UiCarousel v-else-if="section.layout === 'carousel'" class="w-full">
      <UiCarouselContent>
        <UiCarouselItem
          v-for="(image, index) in section.images"
          :key="index"
          class="basis-full md:basis-1/2 lg:basis-1/3"
          :data-adaptive-item="index"
        >
          <div class="p-1 cursor-pointer" @click="openLightbox(index)">
            <div class="aspect-[4/3] rounded-lg overflow-hidden bg-muted">
              <img
                :src="image.url"
                :alt="image.alt || `Gallery image ${index + 1}`"
                class="w-full h-full object-cover"
              >
            </div>
            <p v-if="image.caption" class="text-xs text-muted-foreground mt-1.5 text-center truncate">
              {{ image.caption }}
            </p>
          </div>
        </UiCarouselItem>
      </UiCarouselContent>
      <UiCarouselPrevious data-adaptive-prev aria-label="Previous image" />
      <UiCarouselNext data-adaptive-next aria-label="Next image" />
    </UiCarousel>

    <!-- Grid layout -->
    <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      <div
        v-for="(image, index) in section.images"
        :key="index"
        class="cursor-pointer group"
        :data-adaptive-item="index"
        @click="openLightbox(index)"
      >
        <div class="aspect-[4/3] rounded-lg overflow-hidden bg-muted">
          <img
            :src="image.url"
            :alt="image.alt || `Gallery image ${index + 1}`"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          >
        </div>
        <p v-if="image.caption" class="text-xs text-muted-foreground mt-1.5 text-center truncate">
          {{ image.caption }}
        </p>
      </div>
    </div>

    <!-- Lightbox overlay -->
    <Teleport to="body" :disabled="Boolean(section._adaptive_match)">
      <div
        v-if="lightboxIndex !== null && section.images[lightboxIndex]"
        ref="lightboxRoot"
        data-adaptive-lightbox
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        class="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center"
        @click.self="closeLightbox"
        @keydown.esc="closeLightbox"
      >
        <div class="relative max-w-4xl w-full mx-4 bg-card rounded-xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
          <!-- Close button -->
          <button
            type="button"
            aria-label="Close gallery"
            class="absolute top-3 right-3 z-10 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
            @click="closeLightbox"
          >
            <X class="size-5" />
          </button>

          <!-- Image -->
          <div class="relative bg-muted">
            <img
              :src="section.images[lightboxIndex].url"
              :alt="section.images[lightboxIndex].alt || ''"
              class="w-full max-h-[60vh] object-contain"
            >

            <!-- Prev / Next arrows -->
            <button
              v-if="section.images.length > 1"
              type="button"
              aria-label="Previous image"
              class="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
              @click.stop="prevImage(section.images.length)"
            >
              <ChevronLeft class="size-5" />
            </button>
            <button
              v-if="section.images.length > 1"
              type="button"
              aria-label="Next image"
              class="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
              @click.stop="nextImage(section.images.length)"
            >
              <ChevronRight class="size-5" />
            </button>
          </div>

          <!-- Caption & description -->
          <div
            v-if="section.images[lightboxIndex].caption || section.images[lightboxIndex].description"
            class="px-6 py-4 border-t"
          >
            <h4 v-if="section.images[lightboxIndex].caption" class="font-semibold text-sm">
              {{ section.images[lightboxIndex].caption }}
            </h4>
            <p v-if="section.images[lightboxIndex].description" class="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              {{ section.images[lightboxIndex].description }}
            </p>
            <p class="text-xs text-muted-foreground/50 mt-2">
              {{ lightboxIndex + 1 }} / {{ section.images.length }}
            </p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.adaptive-gallery-track {
  --adaptive-columns: var(--adaptive-mobile-columns);
  display: flex;
  transition: transform 220ms ease;
}

.adaptive-gallery-item {
  flex: 0 0 calc(100% / var(--adaptive-columns));
}

@media (min-width: 768px) {
  .adaptive-gallery-track {
    --adaptive-columns: var(--adaptive-tablet-columns);
  }
}

@media (min-width: 1024px) {
  .adaptive-gallery-track {
    --adaptive-columns: var(--adaptive-desktop-columns);
  }
}
</style>
