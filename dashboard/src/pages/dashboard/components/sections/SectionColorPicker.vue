<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Loader2, Database } from 'lucide-vue-next'
import { useInlineEdit } from '@/composables/use-inline-edit'
import { useOemData, type VariantColor } from '@/composables/use-oem-data'
import Vehicle360Viewer from '@/components/Vehicle360Viewer.vue'

const props = defineProps<{
  section: {
    type: 'color-picker'
    title?: string
    start_angle?: number // 1-6 thumbnail position
    colors: Array<{
      name: string
      code?: string
      swatch_url?: string
      hero_image_url?: string
      hex?: string
    }>
  }
  oemId?: string
  modelSlug?: string
}>()

const { fetchColorsForModel } = useOemData()

const emit = defineEmits<{ 'inline-edit': [field: string, value: string, el: HTMLElement]; 'update-text': [field: string, value: string] }>()
const titleEdit = useInlineEdit((v) => emit('update-text', 'title', v))
function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) { const el = e.target as HTMLElement; edit.startEdit(el); emit('inline-edit', field, el.textContent || '', el) }

const dbColors = ref<VariantColor[]>([])
const loadingColors = ref(false)
const selectedIndex = ref(0)

// Use DB colors when available, fall back to section data
const colors = computed(() => {
  if (dbColors.value.length) {
    return dbColors.value.map(c => ({
      name: c.color_name,
      code: c.color_code,
      swatch_url: c.swatch_url,
      hero_image_url: c.hero_image_url,
      gallery_urls: c.gallery_urls ?? [],
      color_type: c.color_type,
      price_delta: c.price_delta,
      is_standard: c.is_standard,
      hex: null as string | null,
    }))
  }
  return props.section.colors?.map(c => ({
    ...c,
    gallery_urls: [] as string[],
    color_type: null as string | null,
    price_delta: null as number | null,
    is_standard: false,
  })) ?? []
})

const selectedColor = computed(() => colors.value[selectedIndex.value])

// Detect 360-capable URLs (Kia _00000 pattern, Nissan Helios, or multi-angle gallery)
const is360 = computed(() => {
  const c = selectedColor.value
  if (!c) return false
  if (c.hero_image_url && /_\d{5}\./.test(c.hero_image_url)) return true
  if (c.hero_image_url && /pov=E\d{2}/.test(c.hero_image_url)) return true
  if (c.gallery_urls.length > 1) return true
  return false
})

function selectColor(index: number) {
  selectedIndex.value = index
}

async function loadDbColors() {
  if (!props.oemId || !props.modelSlug) return
  loadingColors.value = true
  try {
    dbColors.value = await fetchColorsForModel(props.oemId, props.modelSlug)
    selectedIndex.value = 0
  } catch (e) {
    console.warn('Failed to load DB colors:', e)
  } finally {
    loadingColors.value = false
  }
}

onMounted(loadDbColors)
watch(() => [props.oemId, props.modelSlug], loadDbColors)
</script>

<template>
  <div class="px-8 py-10">
    <!-- Loading state -->
    <div v-if="loadingColors" class="flex items-center justify-center py-12">
      <Loader2 class="size-6 animate-spin text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">Loading colours...</span>
    </div>

    <template v-else-if="colors.length">
      <!-- Header -->
      <div class="flex items-center gap-2 mb-6">
        <h3 class="text-xl font-bold cursor-text outline-none" :style="{ opacity: section.title ? 1 : 0.4 }" @dblclick="startEditing('title', titleEdit, $event)" @blur="titleEdit.stopEdit()" @keydown="titleEdit.onKeydown" @paste="titleEdit.onPaste">{{ section.title || 'Double-click to add title' }}</h3>
        <span v-if="dbColors.length" class="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          <Database class="size-2.5" />
          {{ colors.length }} colours from database
        </span>
      </div>

      <!-- 360 Viewer when available -->
      <div v-if="is360 && selectedColor?.hero_image_url" class="mb-6">
        <Vehicle360Viewer
          :hero-url="selectedColor.hero_image_url"
          :gallery-urls="selectedColor.gallery_urls.length > 1 ? selectedColor.gallery_urls : undefined"
          :name="selectedColor.name"
          :initial-thumb="section.start_angle ? section.start_angle - 1 : undefined"
        />
      </div>

      <!-- Static hero image fallback -->
      <div v-else-if="selectedColor?.hero_image_url" class="mb-6 rounded-lg overflow-hidden bg-muted">
        <img
          :src="selectedColor.hero_image_url"
          :alt="selectedColor.name"
          class="w-full max-h-[400px] object-contain mx-auto transition-all duration-300"
        />
      </div>

      <!-- Color info -->
      <div class="text-center mb-5">
        <p class="text-sm font-medium">
          {{ selectedColor?.name }}
          <span v-if="selectedColor?.code" class="text-muted-foreground ml-1">({{ selectedColor.code }})</span>
        </p>
        <div class="flex items-center justify-center gap-2 mt-1">
          <span v-if="selectedColor?.color_type" class="text-xs text-muted-foreground capitalize">
            {{ selectedColor.color_type }}
          </span>
          <span
            v-if="selectedColor?.price_delta && selectedColor.price_delta > 0"
            class="text-xs text-muted-foreground"
          >
            +${{ selectedColor.price_delta.toLocaleString() }}
          </span>
          <span v-if="selectedColor?.is_standard" class="text-xs text-emerald-600 font-medium">
            Standard
          </span>
        </div>
      </div>

      <!-- Swatches -->
      <div class="flex flex-wrap justify-center gap-2">
        <button
          v-for="(color, index) in colors"
          :key="color.code || color.name"
          class="relative size-10 rounded-full border-2 transition-all overflow-hidden hover:scale-110"
          :class="index === selectedIndex ? 'border-primary ring-2 ring-primary/30 scale-110' : 'border-border'"
          :title="color.name"
          @click="selectColor(index)"
        >
          <img
            v-if="color.swatch_url"
            :src="color.swatch_url"
            :alt="color.name"
            class="w-full h-full object-cover"
          />
          <div
            v-else-if="color.hex"
            class="w-full h-full"
            :style="{ backgroundColor: color.hex }"
          />
          <div v-else class="w-full h-full bg-muted flex items-center justify-center text-[8px] text-muted-foreground font-medium">
            {{ color.code }}
          </div>
        </button>
      </div>
    </template>

    <!-- Empty state -->
    <div v-else class="text-center py-8 text-sm text-muted-foreground">
      No colours available for this model.
    </div>
  </div>
</template>
