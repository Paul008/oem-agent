<script lang="ts" setup>
import { ChevronDown, Database, Loader2 } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'

import type { Product, VariantColor } from '@/composables/use-oem-data'

import { useOemData } from '@/composables/use-oem-data'

interface ExplorerColor {
  name: string
  code?: string
  swatch_url?: string | null
  hero_image_url?: string | null
  hex?: string | null
}

interface ExplorerVariant {
  id?: string
  title: string
  description?: string
  price_label?: string
  cta_text?: string
  cta_url?: string
  key_features?: string[]
  image_url?: string | null
  colors?: ExplorerColor[]
}

const props = defineProps<{
  section: {
    type: 'variant-color-explorer'
    data_source?: 'database' | 'manual'
    oem_id?: string
    model_slug?: string
    eyebrow?: string
    heading?: string
    cta_text?: string
    cta_url?: string
    variants?: ExplorerVariant[]
  }
  oemId?: string
  modelSlug?: string
}>()

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'

function encodeUrl(url: string): string {
  const bytes = new TextEncoder().encode(url)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function proxiedUrl(url: string | null | undefined, oemId: string | undefined): string | null {
  if (!url)
    return null
  if (url.startsWith('/media/'))
    return `${WORKER_BASE}${url}`
  if (url.includes('oem-agent') || url.includes('workers.dev'))
    return url
  if (!url.startsWith('http'))
    return url
  if (!oemId)
    return url
  return `${WORKER_BASE}/media/${oemId}/${encodeUrl(url)}`
}

function variantTitle(product: Product): string {
  return product.variant_name || product.subtitle || product.title || 'Variant'
}

function productDescription(product: Product): string {
  const summary = product.specs_json?.summary
  if (typeof summary === 'string')
    return summary
  return product.subtitle || product.body_type || ''
}

function productFeatures(product: Product): string[] {
  if (Array.isArray(product.key_features) && product.key_features.length)
    return product.key_features.filter(Boolean).slice(0, 8)

  const specs = product.specs_json || {}
  const candidates = [
    specs.engine,
    specs.drivetrain,
    specs.transmission,
    specs.safety,
    specs.infotainment,
  ]

  return candidates
    .flatMap((item) => {
      if (!item)
        return []
      if (typeof item === 'string')
        return [item]
      return Object.values(item).filter((value): value is string => typeof value === 'string' && value.length > 0)
    })
    .slice(0, 8)
}

function priceLabel(product: Product): string {
  if (product.price_raw_string)
    return product.price_raw_string
  if (typeof product.price_amount === 'number')
    return `${product.price_qualifier || 'From'} $${product.price_amount.toLocaleString()}`
  return ''
}

function normalizeManualVariant(variant: ExplorerVariant, oemId: string | undefined): ExplorerVariant {
  return {
    ...variant,
    image_url: proxiedUrl(variant.image_url, oemId),
    colors: (variant.colors || []).map(color => ({
      ...color,
      swatch_url: proxiedUrl(color.swatch_url, oemId),
      hero_image_url: proxiedUrl(color.hero_image_url, oemId),
    })),
  }
}

function normalizeDbVariant(product: Product, colors: VariantColor[], oemId: string | undefined): ExplorerVariant {
  const normalizedColors = colors.map(color => ({
    name: color.color_name,
    code: color.color_code,
    swatch_url: proxiedUrl(color.swatch_url || color.source_swatch_url, oemId),
    hero_image_url: proxiedUrl(color.hero_image_url || color.source_hero_url, oemId),
    hex: null,
  }))
  const selectedImage = normalizedColors.find(color => color.hero_image_url)?.hero_image_url || null

  return {
    id: product.id,
    title: variantTitle(product),
    description: productDescription(product),
    price_label: priceLabel(product),
    cta_text: '',
    cta_url: '',
    key_features: productFeatures(product),
    image_url: selectedImage,
    colors: normalizedColors,
  }
}

const { fetchProductsForModel, fetchVariantColors } = useOemData()
const loading = ref(false)
const products = ref<Product[]>([])
const colors = ref<VariantColor[]>([])
const selectedVariantIndex = ref(0)
const selectedColorIndex = ref(0)
const featuresOpen = ref(false)

const resolvedOemId = computed(() => props.section.oem_id || props.oemId || '')
const resolvedModelSlug = computed(() => props.section.model_slug || props.modelSlug || '')
const shouldUseDatabase = computed(() => props.section.data_source !== 'manual' && !!resolvedOemId.value && !!resolvedModelSlug.value)

const colorsByProductId = computed(() => {
  const map = new Map<string, VariantColor[]>()
  for (const color of colors.value) {
    const list = map.get(color.product_id) || []
    list.push(color)
    map.set(color.product_id, list)
  }
  return map
})

const manualVariants = computed(() => (props.section.variants || []).map(variant => normalizeManualVariant(variant, resolvedOemId.value)))
const dbVariants = computed(() => products.value.map(product => normalizeDbVariant(product, colorsByProductId.value.get(product.id) || [], resolvedOemId.value)))
const variants = computed(() => dbVariants.value.length ? dbVariants.value : manualVariants.value)
const selectedVariant = computed(() => variants.value[selectedVariantIndex.value] || variants.value[0])
const selectedColors = computed(() => selectedVariant.value?.colors || [])
const selectedColor = computed(() => selectedColors.value[selectedColorIndex.value] || selectedColors.value[0])
const selectedImage = computed(() => selectedColor.value?.hero_image_url || selectedVariant.value?.image_url || null)
const selectedColorName = computed(() => selectedColor.value?.name || '')
const ctaText = computed(() => selectedVariant.value?.cta_text || props.section.cta_text || 'Build your own')
const ctaUrl = computed(() => selectedVariant.value?.cta_url || props.section.cta_url || '#')

function selectVariant(index: number) {
  selectedVariantIndex.value = index
  selectedColorIndex.value = 0
  featuresOpen.value = false
}

function selectColor(index: number) {
  selectedColorIndex.value = index
}

async function loadDatabaseData() {
  if (!shouldUseDatabase.value)
    return

  loading.value = true
  try {
    const rows = await fetchProductsForModel(resolvedOemId.value, resolvedModelSlug.value)
    products.value = rows
    colors.value = rows.length ? await fetchVariantColors(rows.map(product => product.id)) : []
    selectedVariantIndex.value = 0
    selectedColorIndex.value = 0
  }
  catch (error) {
    console.warn('Failed to load variant explorer data:', error)
    products.value = []
    colors.value = []
  }
  finally {
    loading.value = false
  }
}

onMounted(loadDatabaseData)
watch(() => [resolvedOemId.value, resolvedModelSlug.value, props.section.data_source], loadDatabaseData)
</script>

<template>
  <section class="bg-white text-neutral-950 px-5 py-14 md:px-10 md:py-20">
    <div class="mx-auto max-w-7xl">
      <div class="text-center">
        <p v-if="section.eyebrow" class="text-[0.7rem] font-bold uppercase tracking-[0.34em] text-neutral-500">
          {{ section.eyebrow }}
        </p>
        <h2 class="mt-5 text-3xl font-black leading-tight md:text-5xl">
          {{ section.heading || 'Make Your Mark.' }}
        </h2>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-20 text-sm text-neutral-500">
        <Loader2 class="mr-2 size-5 animate-spin" />
        Loading variants...
      </div>

      <div v-else-if="variants.length" class="mt-10 md:mt-14">
        <div class="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
          <div class="mx-auto flex w-max min-w-full items-center justify-start gap-8 md:justify-center">
            <button
              v-for="(variant, index) in variants"
              :key="variant.id || variant.title || index"
              class="relative whitespace-nowrap pb-4 text-base font-medium text-neutral-950 transition-colors md:text-lg"
              :class="index === selectedVariantIndex ? 'font-black' : 'hover:text-neutral-600'"
              @click="selectVariant(index)"
            >
              {{ variant.title }}
              <span
                v-if="index === selectedVariantIndex"
                class="absolute bottom-0 left-0 h-[3px] w-7 bg-red-600"
              />
            </button>
          </div>
        </div>

        <div class="mt-12 grid gap-8 lg:grid-cols-[0.42fr_0.58fr] lg:items-start">
          <div class="order-2 lg:order-1">
            <h3 class="text-4xl font-black leading-none md:text-5xl">
              {{ selectedVariant?.title }}
            </h3>
            <p v-if="selectedVariant?.description" class="mt-8 max-w-md text-lg leading-8 text-neutral-900">
              {{ selectedVariant.description }}
            </p>
            <p v-if="selectedVariant?.price_label" class="mt-5 text-sm font-bold text-neutral-600">
              {{ selectedVariant.price_label }}
            </p>

            <div class="mt-10 border-y border-neutral-300">
              <button
                class="flex w-full items-center justify-between py-5 text-left text-xl font-black"
                @click="featuresOpen = !featuresOpen"
              >
                Key Features
                <ChevronDown class="size-5 transition-transform" :class="{ 'rotate-180': featuresOpen }" />
              </button>
              <ul v-if="featuresOpen" class="grid gap-3 pb-6 text-sm leading-6 text-neutral-700 md:grid-cols-2">
                <li v-for="feature in selectedVariant?.key_features || []" :key="feature" class="border-l-2 border-red-600 pl-3">
                  {{ feature }}
                </li>
              </ul>
            </div>

            <a
              :href="ctaUrl"
              class="mt-10 inline-flex min-h-14 items-center justify-center bg-red-600 px-7 text-base font-black text-white transition-colors hover:bg-red-700"
            >
              {{ ctaText }}
            </a>
          </div>

          <div class="order-1 lg:order-2">
            <div class="flex min-h-[260px] items-center justify-center md:min-h-[430px]">
              <img
                v-if="selectedImage"
                :src="selectedImage"
                :alt="[selectedVariant?.title, selectedColorName].filter(Boolean).join(' ')"
                class="max-h-[260px] w-full object-contain md:max-h-[430px]"
              >
              <div v-else class="flex aspect-[16/9] w-full items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-500">
                Vehicle image unavailable
              </div>
            </div>

            <div v-if="selectedColors.length" class="mt-8 text-center">
              <p class="text-base font-black">
                {{ selectedColorName }}
              </p>
              <div class="mt-7 flex flex-wrap justify-center gap-x-10 gap-y-8">
                <button
                  v-for="(color, index) in selectedColors"
                  :key="color.code || color.name || index"
                  class="grid place-items-center"
                  :title="color.name"
                  @click="selectColor(index)"
                >
                  <span
                    class="block size-14 rounded-full border border-white shadow-[0_4px_12px_rgba(0,0,0,0.28)] ring-offset-4 transition"
                    :class="index === selectedColorIndex ? 'ring-2 ring-neutral-300' : 'ring-0 hover:ring-2 hover:ring-neutral-200'"
                  >
                    <img v-if="color.swatch_url" :src="color.swatch_url" :alt="color.name" class="size-full rounded-full object-cover">
                    <span v-else class="block size-full rounded-full bg-neutral-200" :style="{ backgroundColor: color.hex || undefined }" />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="products.length" class="mt-8 flex justify-center text-[0.7rem] font-medium uppercase tracking-[0.2em] text-neutral-400">
          <Database class="mr-2 size-3.5" />
          Bound to catalog data
        </div>
      </div>

      <div v-else class="mt-12 bg-neutral-100 px-6 py-10 text-center text-sm text-neutral-500">
        Add manual variants or bind this section to an OEM model.
      </div>
    </div>
  </section>
</template>
