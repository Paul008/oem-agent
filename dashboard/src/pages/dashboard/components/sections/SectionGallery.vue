<script lang="ts" setup>
import { ref } from 'vue'
import { X, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useInlineEdit } from '@/composables/use-inline-edit'

defineProps<{
  section: {
    type: 'gallery'
    title?: string
    images: Array<{ url: string; alt?: string; caption?: string; description?: string }>
    layout: 'carousel' | 'grid'
  }
}>()

const emit = defineEmits<{
  'inline-edit': [field: string, value: string, el: HTMLElement]
  'update-text': [field: string, value: string]
}>()
const titleEdit = useInlineEdit((v) => emit('update-text', 'title', v))
function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) {
  const el = e.target as HTMLElement; edit.startEdit(el); emit('inline-edit', field, el.textContent || '', el)
}
const lightboxIndex = ref<number | null>(null)

function openLightbox(index: number) {
  lightboxIndex.value = index
}

function closeLightbox() {
  lightboxIndex.value = null
}

function prevImage(total: number) {
  if (lightboxIndex.value === null) return
  lightboxIndex.value = (lightboxIndex.value - 1 + total) % total
}

function nextImage(total: number) {
  if (lightboxIndex.value === null) return
  lightboxIndex.value = (lightboxIndex.value + 1) % total
}
</script>

<template>
  <div v-if="section.images?.length" class="px-8 py-10">
    <h3 class="text-xl font-bold mb-4 cursor-text outline-none" :style="{ opacity: section.title ? 1 : 0.4 }" @dblclick="startEditing('title', titleEdit, $event)" @blur="titleEdit.stopEdit()" @keydown="titleEdit.onKeydown" @paste="titleEdit.onPaste">{{ section.title || 'Double-click to add title' }}</h3>

    <!-- Carousel layout -->
    <UiCarousel v-if="section.layout === 'carousel'" class="w-full">
      <UiCarouselContent>
        <UiCarouselItem
          v-for="(image, index) in section.images"
          :key="index"
          class="basis-full md:basis-1/2 lg:basis-1/3"
        >
          <div class="p-1 cursor-pointer" @click="openLightbox(index)">
            <div class="aspect-[4/3] rounded-lg overflow-hidden bg-muted">
              <img
                :src="image.url"
                :alt="image.alt || `Gallery image ${index + 1}`"
                class="w-full h-full object-cover"
              />
            </div>
            <p v-if="image.caption" class="text-xs text-muted-foreground mt-1.5 text-center truncate">
              {{ image.caption }}
            </p>
          </div>
        </UiCarouselItem>
      </UiCarouselContent>
      <UiCarouselPrevious />
      <UiCarouselNext />
    </UiCarousel>

    <!-- Grid layout -->
    <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      <div
        v-for="(image, index) in section.images"
        :key="index"
        class="cursor-pointer group"
        @click="openLightbox(index)"
      >
        <div class="aspect-[4/3] rounded-lg overflow-hidden bg-muted">
          <img
            :src="image.url"
            :alt="image.alt || `Gallery image ${index + 1}`"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        <p v-if="image.caption" class="text-xs text-muted-foreground mt-1.5 text-center truncate">
          {{ image.caption }}
        </p>
      </div>
    </div>

    <!-- Lightbox overlay -->
    <Teleport to="body">
      <div
        v-if="lightboxIndex !== null && section.images[lightboxIndex]"
        class="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center"
        @click.self="closeLightbox"
      >
        <div class="relative max-w-4xl w-full mx-4 bg-card rounded-xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
          <!-- Close button -->
          <button
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
            />

            <!-- Prev / Next arrows -->
            <button
              v-if="section.images.length > 1"
              class="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
              @click.stop="prevImage(section.images.length)"
            >
              <ChevronLeft class="size-5" />
            </button>
            <button
              v-if="section.images.length > 1"
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
