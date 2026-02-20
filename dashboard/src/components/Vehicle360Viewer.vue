<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Loader2, RotateCw } from 'lucide-vue-next'

const props = defineProps<{
  heroUrl: string
  galleryUrls?: string[]
  name?: string
}>()

// Detect URL pattern: Helios (pov=E01) vs Kia (_00000) vs gallery array
const isHelios = computed(() => /pov=E\d{2}/.test(props.heroUrl))
const isKia360 = computed(() => /_\d{5}\./.test(props.heroUrl))
const hasGallery = computed(() => (props.galleryUrls?.length ?? 0) > 1)

const TOTAL_FRAMES = computed(() => {
  if (hasGallery.value) return props.galleryUrls!.length
  return 36
})

// Generate frame URLs: use gallery array directly, or generate from pattern
const frameUrls = computed(() => {
  // Gallery array provided (Ford GPAS, Subaru, etc.) — use directly
  if (hasGallery.value) return props.galleryUrls!

  const urls: string[] = []
  for (let i = 0; i < TOTAL_FRAMES.value; i++) {
    if (isHelios.value) {
      // Helios: replace pov=E01 with pov=E{01-36}
      const pov = `E${String(i + 1).padStart(2, '0')}`
      const url = props.heroUrl
        .replace(/pov=E\d{2}/, `pov=${pov}`)
        .replace(/width=\d+/, 'width=1200')
        .replace(/quality=\d+/, 'quality=85')
      urls.push(url)
    } else if (isKia360.value) {
      // Kia: replace _00000 with _00000 through _00035
      const frame = String(i).padStart(5, '0')
      urls.push(props.heroUrl.replace(/_\d{5}\./, `_${frame}.`))
    } else {
      urls.push(props.heroUrl)
    }
  }
  return urls
})

// Thumbnail indices: evenly spaced across available frames
const thumbIndices = computed(() => {
  const total = TOTAL_FRAMES.value
  if (total <= 6) return Array.from({ length: total }, (_, i) => i)
  const step = total / 6
  return Array.from({ length: 6 }, (_, i) => Math.round(i * step))
})

const thumbUrls = computed(() => thumbIndices.value.map(i => {
  if (hasGallery.value) return props.galleryUrls![i]
  if (isHelios.value) {
    return props.heroUrl
      .replace(/pov=E\d{2}/, `pov=E${String(i + 1).padStart(2, '0')}`)
      .replace(/width=\d+/, 'width=200')
      .replace(/quality=\d+/, 'quality=60')
  } else if (isKia360.value) {
    const frame = String(i).padStart(5, '0')
    return props.heroUrl.replace(/_\d{5}\./, `_${frame}.`)
  }
  return props.heroUrl
}))

const currentFrame = ref(0)
const loadedCount = ref(0)
const isLoading = ref(true)
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartFrame = ref(0)
const containerRef = ref<HTMLElement | null>(null)

const loadProgress = computed(() => Math.round((loadedCount.value / TOTAL_FRAMES.value) * 100))
const currentAngle = computed(() => Math.round((currentFrame.value / TOTAL_FRAMES.value) * 360))

// Preload all frames
const images = ref<HTMLImageElement[]>([])

function preloadImages() {
  loadedCount.value = 0
  isLoading.value = true
  images.value = []

  for (let i = 0; i < TOTAL_FRAMES.value; i++) {
    const img = new Image()
    img.onload = () => {
      loadedCount.value++
      if (loadedCount.value >= TOTAL_FRAMES.value) {
        isLoading.value = false
      }
    }
    img.onerror = () => {
      loadedCount.value++
      if (loadedCount.value >= TOTAL_FRAMES.value) {
        isLoading.value = false
      }
    }
    img.src = frameUrls.value[i]
    images.value.push(img)
  }
}

// Drag handlers
function onPointerDown(e: PointerEvent) {
  isDragging.value = true
  dragStartX.value = e.clientX
  dragStartFrame.value = currentFrame.value
  ;(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  e.preventDefault()

  const container = containerRef.value
  if (!container) return

  const dx = e.clientX - dragStartX.value
  const containerWidth = container.offsetWidth
  // Map drag distance to frames: full width = full rotation
  const frameDelta = Math.round((dx / containerWidth) * TOTAL_FRAMES.value)
  let newFrame = (dragStartFrame.value - frameDelta) % TOTAL_FRAMES.value
  if (newFrame < 0) newFrame += TOTAL_FRAMES.value
  currentFrame.value = newFrame
}

function onPointerUp() {
  isDragging.value = false
}

// Mouse wheel rotation
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const direction = e.deltaY > 0 ? 1 : -1
  let newFrame = (currentFrame.value + direction) % TOTAL_FRAMES.value
  if (newFrame < 0) newFrame += TOTAL_FRAMES.value
  currentFrame.value = newFrame
}

// Keyboard
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    let f = (currentFrame.value - 1) % TOTAL_FRAMES.value
    if (f < 0) f += TOTAL_FRAMES.value
    currentFrame.value = f
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    currentFrame.value = (currentFrame.value + 1) % TOTAL_FRAMES.value
  }
}

function goToFrame(idx: number) {
  currentFrame.value = idx
}

onMounted(() => {
  preloadImages()
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})

watch(() => props.heroUrl, () => {
  preloadImages()
  currentFrame.value = 0
})
</script>

<template>
  <div class="flex flex-col items-center w-full select-none">
    <!-- Main viewer -->
    <div
      ref="containerRef"
      class="relative w-full bg-white rounded-xl overflow-hidden"
      :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
    >
      <!-- Loading overlay -->
      <div
        v-if="isLoading"
        class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90"
      >
        <Loader2 class="size-8 animate-spin text-neutral-400 mb-3" />
        <div class="w-48 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
          <div
            class="h-full bg-neutral-800 rounded-full transition-all duration-200"
            :style="{ width: `${loadProgress}%` }"
          />
        </div>
        <p class="text-xs text-neutral-400 mt-2">Loading {{ TOTAL_FRAMES }} frames... {{ loadProgress }}%</p>
      </div>

      <!-- Frame display -->
      <div class="aspect-[16/9] relative">
        <img
          v-for="(url, idx) in frameUrls"
          :key="idx"
          :src="url"
          :alt="`${name || 'Vehicle'} — ${Math.round((idx / TOTAL_FRAMES) * 360)}°`"
          class="absolute inset-0 w-full h-full object-contain"
          :class="idx === currentFrame ? 'opacity-100' : 'opacity-0'"
          draggable="false"
        />
      </div>

      <!-- Drag hint -->
      <div
        v-if="!isLoading && !isDragging"
        class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/50 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none transition-opacity"
        :class="currentFrame === 0 ? 'opacity-100' : 'opacity-0'"
      >
        <RotateCw class="size-3" />
        Drag to rotate
      </div>

      <!-- Angle indicator -->
      <div class="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
        {{ currentAngle }}°
      </div>
    </div>

    <!-- Thumbnail strip -->
    <div class="flex items-center gap-2 mt-3">
      <button
        v-for="(thumbIdx, i) in thumbIndices"
        :key="i"
        class="w-16 h-10 rounded-md overflow-hidden border-2 transition-all hover:scale-105 bg-white"
        :class="currentFrame === thumbIdx ? 'border-neutral-800 ring-1 ring-neutral-800/20' : 'border-neutral-200 opacity-60 hover:opacity-100'"
        @click="goToFrame(thumbIdx)"
      >
        <img
          :src="thumbUrls[i]"
          :alt="`Angle ${Math.round((thumbIdx / TOTAL_FRAMES) * 360)}°`"
          class="w-full h-full object-contain"
          draggable="false"
        />
      </button>
    </div>

    <!-- Name + angle label -->
    <p v-if="name" class="text-sm text-neutral-500 mt-2 text-center">{{ name }}</p>
  </div>
</template>
