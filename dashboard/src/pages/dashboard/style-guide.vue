<script lang="ts" setup>
import { onMounted, ref, computed, watch } from 'vue'
import {
  Loader2, Palette, AlertTriangle, Type, MousePointerClick,
  Image as ImageIcon, Grid3x3, SplitSquareHorizontal, Play,
  Columns3, Database, Megaphone, Layers, Ruler, SquareStack,
  Sparkles, Check, X, Download, FileText, Wand2, Copy, ChevronDown, ScanSearch,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { fetchStyleGuide, extractRecipesFromUrl, saveRecipe, uploadRecipeThumbnail, generateRecipeComponent, crawlLiveTokens, applyCrawledTokens, type StyleGuideData, type ExtractedRecipe } from '@/lib/worker-api'

const PATTERNS = [
  { key: 'hero', label: 'Hero', icon: ImageIcon },
  { key: 'card-grid', label: 'Card Grid', icon: Grid3x3 },
  { key: 'split-content', label: 'Split Content', icon: SplitSquareHorizontal },
  { key: 'media', label: 'Media', icon: Play },
  { key: 'tabs', label: 'Tabs', icon: Columns3 },
  { key: 'data-display', label: 'Data Display', icon: Database },
  { key: 'action-bar', label: 'Action Bar', icon: Megaphone },
  { key: 'utility', label: 'Utility', icon: Layers },
] as const

const TYPO_SCALES = [
  'display', 'h1', 'h2', 'h3', 'h4',
  'body_large', 'body', 'body_small', 'caption',
  'price', 'disclaimer', 'cta', 'nav',
] as const

const { fetchOems } = useOemData()

const oems = ref<{ id: string; name: string }[]>([])
const selectedOem = ref<string>('')
const loading = ref(false)
const loadError = ref<string | null>(null)
const data = ref<StyleGuideData | null>(null)

const styleGuideContent = ref<HTMLElement | null>(null)
const exporting = ref<'png' | 'pdf' | null>(null)

const crawling = ref(false)
const crawlDiff = ref<Array<{ field: string; current: string; crawled: string; changed: boolean }> | null>(null)
const crawledTokens = ref<any>(null)
const showCrawlDialog = ref(false)
const crawlUrl = ref('')
const applyingTokens = ref(false)

const showExtractDialog = ref(false)
const extractUrlText = ref('')
const extracting = ref(false)
const extractProgress = ref('')
const extractResults = ref<ExtractedRecipe[]>([])
const extractScreenshot = ref<string | null>(null)
const extractError = ref<string | null>(null)
const batchResults = ref<Array<{ url: string; recipes: ExtractedRecipe[]; screenshot?: string }>>([])
const savingRecipeIdx = ref<number | null>(null)
const savedRecipeIdxs = ref<Set<number>>(new Set())
const generatingIdx = ref<number | null>(null)
const generatedComponents = ref<Map<number, string>>(new Map())
const expandedPreview = ref<Set<number>>(new Set())

onMounted(async () => {
  try {
    const o = await fetchOems()
    oems.value = o
    if (o.length) {
      const toyota = o.find(x => x.id === 'toyota-au')
      selectedOem.value = toyota?.id ?? o[0].id
    }
  } catch (err: any) {
    loadError.value = 'Failed to load OEMs'
  }
})

watch(selectedOem, async (oemId) => {
  if (!oemId) return
  loading.value = true
  loadError.value = null
  data.value = null
  try {
    data.value = await fetchStyleGuide(oemId)
  } catch (err: any) {
    loadError.value = err.message || 'Failed to load style guide'
  } finally {
    loading.value = false
  }
}, { immediate: true })

const tokens = computed(() => data.value?.brand_tokens ?? null)
const colors = computed(() => tokens.value?.colors ?? null)
const typography = computed(() => tokens.value?.typography ?? null)
const buttons = computed(() => tokens.value?.buttons ?? null)
const spacing = computed(() => tokens.value?.spacing ?? null)

// Dynamic @font-face injection from brand tokens
const fontStyleId = 'oem-font-faces'
watch(tokens, (t) => {
  // Remove previous font faces
  const existing = document.getElementById(fontStyleId)
  if (existing) existing.remove()

  const faces = t?.typography?.font_faces
  if (!faces?.length) return

  const css = faces.map((f: any) => {
    const ext = f.url?.split('.').pop()?.toLowerCase()
    const fmt = ext === 'woff2' ? 'woff2' : 'woff'
    return `@font-face { font-family: '${f.family}'; font-weight: ${f.weight}; src: url('${f.url}') format('${fmt}'); font-display: swap; }`
  }).join('\n')

  const style = document.createElement('style')
  style.id = fontStyleId
  style.textContent = css
  document.head.appendChild(style)
}, { immediate: true })
const components = computed(() => tokens.value?.components ?? null)

const recipesByPattern = computed(() => {
  if (!data.value) return {}
  const grouped: Record<string, Array<{ label: string; variant: string; resolves_to: string; defaults_json: any; source: 'brand' | 'default' }>> = {}
  for (const p of PATTERNS) grouped[p.key] = []

  const brandKeys = new Set<string>()
  for (const r of data.value.brand_recipes ?? []) {
    brandKeys.add(`${r.pattern}::${r.variant}`)
    if (grouped[r.pattern]) {
      grouped[r.pattern].push({ label: r.label, variant: r.variant, resolves_to: r.resolves_to, defaults_json: r.defaults_json, source: 'brand' })
    }
  }
  for (const r of data.value.default_recipes ?? []) {
    if (!brandKeys.has(`${r.pattern}::${r.variant}`) && grouped[r.pattern]) {
      grouped[r.pattern].push({ label: r.label, variant: r.variant, resolves_to: r.resolves_to, defaults_json: r.defaults_json, source: 'default' })
    }
  }
  return grouped
})

const oemDisplayName = computed(() => {
  const oem = oems.value.find(o => o.id === selectedOem.value)
  return oem?.name?.replace(' Australia', '') ?? selectedOem.value
})

/* ---- Helpers ---- */

function isLightColor(hex: string): boolean {
  if (!hex || !hex.startsWith('#')) return false
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 186
}

function capFontSize(size: string | number | undefined, max = 48): string {
  if (!size) return '16px'
  const n = typeof size === 'number' ? size : parseInt(String(size), 10)
  if (isNaN(n)) return String(size)
  return Math.min(n, max) + 'px'
}

function formatColorLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/* ---- Export ---- */

const EXPORT_OPTS = {
  backgroundColor: '#ffffff',
  pixelRatio: 1,
  cacheBust: true,
  filter: (node: Element) => !(node as HTMLElement)?.dataset?.exportIgnore,
}

async function exportPng() {
  if (!styleGuideContent.value || exporting.value) return
  exporting.value = 'png'
  try {
    // Run twice — first pass warms font/image cache, second gets clean render
    await toPng(styleGuideContent.value, EXPORT_OPTS)
    const dataUrl = await toPng(styleGuideContent.value, EXPORT_OPTS)
    const link = document.createElement('a')
    link.download = `${oemDisplayName.value}-style-guide.png`
    link.href = dataUrl
    link.click()
    toast.success('PNG exported')
  } catch (err: any) {
    toast.error('PNG export failed: ' + (err.message || 'Unknown error'))
  } finally {
    exporting.value = null
  }
}

async function exportPdf() {
  if (!styleGuideContent.value || exporting.value) return
  exporting.value = 'pdf'
  try {
    // Warm cache then capture
    await toPng(styleGuideContent.value, EXPORT_OPTS)
    const dataUrl = await toPng(styleGuideContent.value, EXPORT_OPTS)

    const img = new Image()
    img.src = dataUrl
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image'))
    })

    // Scale image to fit A4 width
    const pageW = 210
    const pageH = 297
    const margin = 10
    const contentW = pageW - margin * 2
    const contentH = pageH - margin * 2
    const imgAspect = img.naturalHeight / img.naturalWidth
    const scaledW = contentW
    const scaledH = contentW * imgAspect

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    // Slice the image into page-sized chunks using canvas
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    // How many pixels of the source image fit per PDF page
    const pxPerPage = Math.floor(img.naturalHeight * (contentH / scaledH))
    const totalPages = Math.ceil(img.naturalHeight / pxPerPage)

    for (let p = 0; p < totalPages; p++) {
      if (p > 0) pdf.addPage()

      const srcY = p * pxPerPage
      const srcH = Math.min(pxPerPage, img.naturalHeight - srcY)
      const sliceAspect = srcH / img.naturalWidth
      const drawH = contentW * sliceAspect

      canvas.width = img.naturalWidth
      canvas.height = srcH
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, srcY, img.naturalWidth, srcH, 0, 0, img.naturalWidth, srcH)

      const sliceUrl = canvas.toDataURL('image/jpeg', 0.85)
      pdf.addImage(sliceUrl, 'JPEG', margin, margin, scaledW, drawH)
    }

    pdf.save(`${oemDisplayName.value}-style-guide.pdf`)
    toast.success('PDF exported')
  } catch (err: any) {
    toast.error('PDF export failed: ' + (err.message || 'Unknown error'))
  } finally {
    exporting.value = null
  }
}

/* ---- Thumbnail Cropping ---- */

const thumbnails = ref<Map<number, string>>(new Map())

async function generateThumbnails() {
  if (!extractScreenshot.value || !extractResults.value.length) return
  thumbnails.value = new Map()

  const img = new Image()
  img.src = 'data:image/png;base64,' + extractScreenshot.value

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load screenshot'))
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const thumbWidth = 280
  const thumbMaxHeight = 180

  for (let i = 0; i < extractResults.value.length; i++) {
    const bounds = extractResults.value[i].bounds
    if (!bounds) continue

    const srcY = Math.round((bounds.top_pct / 100) * img.naturalHeight)
    const srcH = Math.round((bounds.height_pct / 100) * img.naturalHeight)
    if (srcH <= 0) continue

    const aspect = img.naturalWidth / srcH
    const drawH = Math.min(thumbMaxHeight, Math.round(thumbWidth / aspect))

    canvas.width = thumbWidth
    canvas.height = drawH
    ctx.drawImage(img, 0, srcY, img.naturalWidth, srcH, 0, 0, thumbWidth, drawH)

    thumbnails.value.set(i, canvas.toDataURL('image/jpeg', 0.75))
  }
}

/* ---- Extract from URL ---- */

async function handleExtract() {
  if (!extractUrlText.value.trim() || !selectedOem.value) return
  const urls = extractUrlText.value.split('\n').map(u => u.trim()).filter(Boolean)
  if (!urls.length) return

  extracting.value = true
  extractError.value = null
  extractResults.value = []
  extractScreenshot.value = null
  batchCrawlResults.value = []
  savedRecipeIdxs.value = new Set()
  generatedComponents.value = new Map()
  thumbnails.value = new Map()

  try {
    for (let i = 0; i < urls.length; i++) {
      extractProgress.value = urls.length > 1 ? `Extracting ${i + 1} of ${urls.length}: ${urls[i]}` : ''
      const result = await extractRecipesFromUrl(urls[i], selectedOem.value!)
      const recipes = result.suggestions ?? []
      batchResults.value.push({ url: urls[i], recipes, screenshot: result.screenshot_base64 })
    }

    // Flatten for backward compat (thumbnails, save, generate still use flat list)
    extractResults.value = batchResults.value.flatMap(b => b.recipes)
    extractScreenshot.value = batchResults.value[0]?.screenshot ?? null

    if (!extractResults.value.length) {
      extractError.value = 'No recipes extracted — try different URLs'
    } else {
      await generateThumbnails()
    }
  } catch (err: any) {
    extractError.value = err.message || 'Extraction failed'
  } finally {
    extracting.value = false
    extractProgress.value = ''
  }
}

async function saveExtractedRecipe(recipe: ExtractedRecipe, index: number) {
  if (!selectedOem.value) return
  savingRecipeIdx.value = index
  try {
    const variantKey = `${recipe.variant}-extracted-${Date.now().toString(36)}`
    const defaults = { ...recipe.defaults_json }

    // Upload thumbnail if available
    const thumbDataUrl = thumbnails.value.get(index)
    if (thumbDataUrl) {
      const base64 = thumbDataUrl.split(',')[1]
      if (base64) {
        try {
          const { url } = await uploadRecipeThumbnail(selectedOem.value, `${recipe.pattern}-${variantKey}`, base64)
          defaults.thumbnail_url = url
        } catch {
          // Non-fatal — save recipe without thumbnail
        }
      }
    }

    await saveRecipe({
      oem_id: selectedOem.value,
      pattern: recipe.pattern,
      variant: variantKey,
      label: recipe.label,
      resolves_to: recipe.resolves_to,
      defaults_json: defaults,
    })
    savedRecipeIdxs.value.add(index)
    toast.success(`Saved: ${recipe.label}`)
  } catch (err: any) {
    toast.error(err.message || 'Failed to save recipe')
  } finally {
    savingRecipeIdx.value = null
  }
}

async function saveAllExtracted() {
  for (let i = 0; i < extractResults.value.length; i++) {
    if (!savedRecipeIdxs.value.has(i)) {
      await saveExtractedRecipe(extractResults.value[i], i)
    }
  }
  // Reload style guide data to show new recipes
  if (selectedOem.value) {
    data.value = await fetchStyleGuide(selectedOem.value)
  }
}

async function handleGenerate(recipe: ExtractedRecipe, index: number) {
  if (!selectedOem.value || generatingIdx.value !== null) return
  generatingIdx.value = index
  try {
    const thumbDataUrl = thumbnails.value.get(index)
    const thumbBase64 = thumbDataUrl ? thumbDataUrl.split(',')[1] : undefined
    const result = await generateRecipeComponent(selectedOem.value, recipe, thumbBase64)
    if (result.success && result.template_html) {
      generatedComponents.value.set(index, result.template_html)
      expandedPreview.value.add(index)
      toast.success('Component generated')
    } else {
      toast.error(result.error || 'Generation failed')
    }
  } catch (err: any) {
    toast.error(err.message || 'Generation failed')
  } finally {
    generatingIdx.value = null
  }
}

function buildPreviewSrcdoc(html: string): string {
  const fontFaces = tokens.value?.typography?.font_faces?.map((f: any) => {
    const ext = f.url?.split('.').pop()?.toLowerCase()
    const fmt = ext === 'woff2' ? 'woff2' : 'woff'
    return `@font-face { font-family: '${f.family}'; font-weight: ${f.weight}; src: url('${f.url}') format('${fmt}'); font-display: swap; }`
  }).join('\n') || ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer><\/script>
<style>${fontFaces}\nbody { font-family: ${tokens.value?.typography?.font_primary || 'system-ui, sans-serif'}; margin: 0; }</style>
</head>
<body>${html}</body>
</html>`
}

function copyHtml(index: number) {
  const html = generatedComponents.value.get(index)
  if (html) {
    navigator.clipboard.writeText(html)
    toast.success('HTML copied to clipboard')
  }
}

/* ---- Token Crawling ---- */

async function handleCrawlTokens() {
  if (!selectedOem.value || !crawlUrl.value || crawling.value) return
  crawling.value = true
  crawlDiff.value = null
  crawledTokens.value = null
  try {
    const result = await crawlLiveTokens(selectedOem.value, crawlUrl.value)
    crawlDiff.value = result.diff
    crawledTokens.value = result.crawled
  } catch (err: any) {
    toast.error(err.message || 'Crawl failed')
  } finally {
    crawling.value = false
  }
}

const batchCrawling = ref(false)
const batchProgress = ref('')
const batchCrawlResults = ref<Array<{ oem_id: string; changes: number; error?: string }>>([])

async function handleBatchCrawl() {
  if (batchCrawling.value) return
  batchCrawling.value = true
  batchCrawlResults.value = []
  try {
    for (let i = 0; i < oems.value.length; i++) {
      const oem = oems.value[i] as any
      const url = oem.base_url || `https://www.${oem.id.replace('-au', '')}.com.au`
      batchProgress.value = `Crawling ${i + 1} of ${oems.value.length}: ${oem.id}`
      try {
        const result = await crawlLiveTokens(oem.id, url)
        const changes = result.diff?.filter((d: any) => d.changed).length || 0
        if (changes > 0) {
          await applyCrawledTokens(oem.id, result.crawled)
        }
        batchCrawlResults.value.push({ oem_id: oem.id, changes })
      } catch (err: any) {
        batchCrawlResults.value.push({ oem_id: oem.id, changes: 0, error: err.message })
      }
    }
    toast.success(`Batch crawl complete: ${oems.value.length} OEMs`)
  } finally {
    batchCrawling.value = false
    batchProgress.value = ''
  }
}

async function handleApplyTokens() {
  if (!selectedOem.value || !crawledTokens.value || applyingTokens.value) return
  applyingTokens.value = true
  try {
    await applyCrawledTokens(selectedOem.value, crawledTokens.value)
    toast.success('Tokens updated')
    showCrawlDialog.value = false
    crawlDiff.value = null
    crawledTokens.value = null
    // Reload style guide
    data.value = await fetchStyleGuide(selectedOem.value)
  } catch (err: any) {
    toast.error(err.message || 'Apply failed')
  } finally {
    applyingTokens.value = false
  }
}
</script>

<template>
  <BasicPage title="Style Guide" description="Visual brand catalog for each OEM's design tokens, recipes, and components.">
    <!-- OEM Selector -->
    <div class="flex items-center gap-4 mb-6">
      <UiSelect v-model="selectedOem">
        <UiSelectTrigger class="w-[240px]">
          <UiSelectValue placeholder="Select OEM" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
            {{ oem.name?.replace(' Australia', '') }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiButton variant="outline" size="sm" @click="showExtractDialog = true" data-export-ignore>
        <Sparkles class="size-4 mr-1" /> Extract from URL
      </UiButton>
      <div class="ml-auto flex gap-2" data-export-ignore>
        <UiButton variant="outline" size="sm" :disabled="!data" @click="showCrawlDialog = true; crawlUrl = ''">
          <ScanSearch class="size-4 mr-1" />
          Crawl Tokens
        </UiButton>
        <UiButton variant="outline" size="sm" :disabled="!data || !!exporting" @click="exportPng">
          <Loader2 v-if="exporting === 'png'" class="size-4 mr-1 animate-spin" />
          <Download v-else class="size-4 mr-1" />
          PNG
        </UiButton>
        <UiButton variant="outline" size="sm" :disabled="!data || !!exporting" @click="exportPdf">
          <Loader2 v-if="exporting === 'pdf'" class="size-4 mr-1 animate-spin" />
          <FileText v-else class="size-4 mr-1" />
          PDF
        </UiButton>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin text-muted-foreground" />
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="flex flex-col items-center justify-center h-64 gap-2">
      <AlertTriangle class="size-8 text-destructive" />
      <p class="text-sm text-muted-foreground">{{ loadError }}</p>
    </div>

    <!-- No tokens -->
    <div v-else-if="!tokens" class="flex flex-col items-center justify-center h-64 gap-3">
      <Palette class="size-10 text-muted-foreground/30" />
      <p class="text-sm text-muted-foreground">No brand tokens seeded for this OEM</p>
      <p class="text-xs text-muted-foreground/60">Run the design capture job to populate brand tokens.</p>
    </div>

    <!-- Style Guide Content -->
    <div v-else ref="styleGuideContent" class="space-y-10">

      <!-- ═══════ Brand Header ═══════ -->
      <div
        class="rounded-xl overflow-hidden"
        :style="{
          background: colors?.primary
            ? `linear-gradient(135deg, ${colors.primary}, ${colors.secondary || colors.primary}dd)`
            : 'linear-gradient(135deg, #1a1a2e, #16213e)',
        }"
      >
        <div class="px-8 py-10">
          <h1
            class="text-3xl font-bold mb-2"
            :style="{ color: colors?.primary && !isLightColor(colors.primary) ? '#ffffff' : '#111827', fontFamily: typography?.font_primary?.split(',')[0] || 'inherit' }"
          >
            {{ oemDisplayName }}
          </h1>
          <p
            class="text-sm opacity-80"
            :style="{ color: colors?.primary && !isLightColor(colors.primary) ? '#ffffffcc' : '#111827cc' }"
          >
            Brand Style Guide
          </p>
          <div class="flex items-center gap-4 mt-6">
            <div
              v-if="typography?.font_primary"
              class="text-xs px-3 py-1.5 rounded-full"
              :style="{
                backgroundColor: 'rgba(255,255,255,0.15)',
                color: colors?.primary && !isLightColor(colors.primary) ? '#ffffffcc' : '#111827cc',
              }"
            >
              Font: {{ typography.font_primary.split(',')[0] }}
            </div>
            <div
              v-if="spacing?.container_max_width"
              class="text-xs px-3 py-1.5 rounded-full"
              :style="{
                backgroundColor: 'rgba(255,255,255,0.15)',
                color: colors?.primary && !isLightColor(colors.primary) ? '#ffffffcc' : '#111827cc',
              }"
            >
              Container: {{ spacing.container_max_width }}px
            </div>
          </div>
        </div>
      </div>

      <!-- ═══════ 1. Color Palette ═══════ -->
      <UiCard v-if="colors" class="overflow-hidden">
        <div class="px-6 pt-6 pb-2">
          <div class="flex items-center gap-2 mb-1">
            <Palette class="size-5 text-muted-foreground" />
            <h2 class="text-2xl font-bold">Color Palette</h2>
          </div>
          <p class="text-sm text-muted-foreground">Core brand colors and extended palette</p>
        </div>

        <!-- Core colors -->
        <div class="px-6 pb-4">
          <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 mt-4">Core Colors</h3>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div
              v-for="key in ['primary', 'secondary', 'accent', 'surface']"
              :key="key"
            >
              <template v-if="colors[key]">
                <div
                  class="rounded-lg border overflow-hidden"
                  :class="{ 'border-border/50': isLightColor(colors[key]) }"
                >
                  <div
                    class="h-20"
                    :style="{ backgroundColor: colors[key] }"
                  />
                  <div class="px-3 py-2 bg-background">
                    <p class="text-sm font-medium capitalize">{{ key }}</p>
                    <p class="text-xs text-muted-foreground font-mono">{{ colors[key] }}</p>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Additional colors (text, bg, border, etc.) -->
          <template v-if="colors.text || colors.background || colors.border || colors.muted || colors.error || colors.success">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 mt-6">Semantic Colors</h3>
            <div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
              <div
                v-for="key in ['text', 'background', 'border', 'muted', 'error', 'success', 'warning', 'info']"
                :key="key"
              >
                <template v-if="colors[key]">
                  <div class="text-center">
                    <div
                      class="h-12 w-full rounded-lg border mb-1.5"
                      :class="{ 'border-border/50': isLightColor(colors[key]) }"
                      :style="{ backgroundColor: colors[key] }"
                    />
                    <p class="text-xs font-medium capitalize">{{ key }}</p>
                    <p class="text-[10px] text-muted-foreground font-mono">{{ colors[key] }}</p>
                  </div>
                </template>
              </div>
            </div>
          </template>

          <!-- Extended palette -->
          <template v-if="colors.palette_extended && Object.keys(colors.palette_extended).length">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 mt-6">Extended Palette</h3>
            <div class="grid grid-cols-4 sm:grid-cols-8 gap-2">
              <div
                v-for="(hex, name) in colors.palette_extended"
                :key="String(name)"
                class="text-center"
              >
                <div
                  class="h-10 w-full rounded border mb-1"
                  :class="{ 'border-border/50': isLightColor(String(hex)) }"
                  :style="{ backgroundColor: String(hex) }"
                />
                <p class="text-[10px] font-medium truncate">{{ formatColorLabel(String(name)) }}</p>
                <p class="text-[9px] text-muted-foreground font-mono">{{ hex }}</p>
              </div>
            </div>
          </template>
        </div>
      </UiCard>

      <!-- ═══════ 2. Typography ═══════ -->
      <UiCard v-if="typography" class="overflow-hidden">
        <div class="px-6 pt-6 pb-2">
          <div class="flex items-center gap-2 mb-1">
            <Type class="size-5 text-muted-foreground" />
            <h2 class="text-2xl font-bold">Typography</h2>
          </div>
          <p class="text-sm text-muted-foreground">
            Primary font: <span class="font-semibold">{{ typography.font_primary?.split(',')[0] || 'System' }}</span>
            <template v-if="typography.font_secondary">
              &middot; Secondary: <span class="font-semibold">{{ typography.font_secondary?.split(',')[0] }}</span>
            </template>
          </p>
        </div>

        <div class="px-6 pb-6">
          <div class="space-y-0 divide-y">
            <template v-for="scale in TYPO_SCALES" :key="scale">
              <div
                v-if="typography.scale?.[scale]"
                class="py-4 flex items-baseline gap-6"
              >
                <div class="w-24 shrink-0">
                  <p class="text-xs font-medium text-muted-foreground">{{ scale.replace(/_/g, ' ') }}</p>
                </div>
                <div class="flex-1 min-w-0">
                  <p
                    class="truncate"
                    :style="{
                      fontSize: capFontSize(typography.scale[scale].fontSize, 48),
                      fontWeight: typography.scale[scale].fontWeight || 'normal',
                      letterSpacing: typography.scale[scale].letterSpacing || 'normal',
                      lineHeight: typography.scale[scale].lineHeight || 'normal',
                      fontFamily: typography.font_primary?.split(',')[0] || 'inherit',
                    }"
                  >
                    The quick brown fox jumps
                  </p>
                </div>
                <div class="w-48 shrink-0 text-right">
                  <span class="text-[10px] text-muted-foreground font-mono">
                    {{ typography.scale[scale].fontSize }}
                    <template v-if="typography.scale[scale].fontWeight"> / {{ typography.scale[scale].fontWeight }}</template>
                    <template v-if="typography.scale[scale].letterSpacing"> / {{ typography.scale[scale].letterSpacing }}</template>
                  </span>
                </div>
              </div>
            </template>
          </div>

          <!-- Fallback when no scale entries exist -->
          <div
            v-if="!typography.scale || !Object.keys(typography.scale).length"
            class="py-8 text-center"
          >
            <p class="text-sm text-muted-foreground">No type scale defined. Font family is available but no scale entries.</p>
          </div>

          <!-- Font files -->
          <div v-if="typography.font_faces?.length" class="mt-4 pt-4 border-t">
            <p class="text-xs font-medium text-muted-foreground mb-3">Font Files</p>
            <div class="flex flex-wrap gap-2">
              <a
                v-for="face in typography.font_faces"
                :key="face.url"
                :href="face.url"
                download
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted transition-colors"
              >
                <Download class="size-3" />
                {{ face.family }} {{ face.weight }}
              </a>
            </div>
          </div>
        </div>
      </UiCard>

      <!-- ═══════ 3. Buttons ═══════ -->
      <UiCard v-if="buttons" class="overflow-hidden">
        <div class="px-6 pt-6 pb-2">
          <div class="flex items-center gap-2 mb-1">
            <MousePointerClick class="size-5 text-muted-foreground" />
            <h2 class="text-2xl font-bold">Buttons</h2>
          </div>
          <p class="text-sm text-muted-foreground">All button variants with their computed styles</p>
        </div>

        <div class="px-6 pb-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
            <div
              v-for="variant in ['primary', 'secondary', 'outline', 'text']"
              :key="variant"
            >
              <template v-if="buttons[variant]">
                <div class="space-y-3">
                  <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{{ variant }}</h3>

                  <!-- Rendered button -->
                  <div class="flex items-center gap-4">
                    <div
                      class="inline-flex items-center justify-center cursor-default select-none transition-colors"
                      :style="{
                        backgroundColor: buttons[variant].background || 'transparent',
                        color: buttons[variant].color || 'inherit',
                        border: buttons[variant].border || 'none',
                        borderRadius: buttons[variant].borderRadius || buttons[variant].radius || '6px',
                        padding: buttons[variant].padding || '10px 24px',
                        fontSize: buttons[variant].fontSize || '14px',
                        fontWeight: buttons[variant].fontWeight || '500',
                        letterSpacing: buttons[variant].letterSpacing || 'normal',
                        textTransform: buttons[variant].textTransform || 'none',
                      }"
                    >
                      {{ variant === 'text' ? 'Learn More' : 'Button Label' }}
                    </div>
                  </div>

                  <!-- Metadata -->
                  <div class="text-[10px] text-muted-foreground font-mono leading-relaxed">
                    <span v-if="buttons[variant].background">bg: {{ buttons[variant].background }}</span>
                    <span v-if="buttons[variant].color"> &middot; color: {{ buttons[variant].color }}</span>
                    <span v-if="buttons[variant].borderRadius || buttons[variant].radius"> &middot; radius: {{ buttons[variant].borderRadius || buttons[variant].radius }}</span>
                    <span v-if="buttons[variant].padding"> &middot; padding: {{ buttons[variant].padding }}</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </UiCard>

      <!-- ═══════ 4. Spacing ═══════ -->
      <UiCard v-if="spacing" class="overflow-hidden">
        <div class="px-6 pt-6 pb-2">
          <div class="flex items-center gap-2 mb-1">
            <Ruler class="size-5 text-muted-foreground" />
            <h2 class="text-2xl font-bold">Spacing</h2>
          </div>
          <p class="text-sm text-muted-foreground">Layout spacing scale and container dimensions</p>
        </div>

        <div class="px-6 pb-6">
          <!-- Key metrics -->
          <div class="grid grid-cols-3 gap-4 mt-4 mb-6">
            <div v-if="spacing.container_max_width" class="border rounded-lg px-4 py-3">
              <p class="text-xs text-muted-foreground mb-1">Container Max Width</p>
              <p class="text-lg font-semibold font-mono">{{ spacing.container_max_width }}px</p>
            </div>
            <div v-if="spacing.section_gap" class="border rounded-lg px-4 py-3">
              <p class="text-xs text-muted-foreground mb-1">Section Gap</p>
              <p class="text-lg font-semibold font-mono">{{ spacing.section_gap }}px</p>
            </div>
            <div v-if="spacing.container_padding" class="border rounded-lg px-4 py-3">
              <p class="text-xs text-muted-foreground mb-1">Container Padding</p>
              <p class="text-lg font-semibold font-mono">{{ spacing.container_padding }}px</p>
            </div>
          </div>

          <!-- Scale bars -->
          <template v-if="spacing.scale && Object.keys(spacing.scale).length">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Spacing Scale</h3>
            <div class="space-y-2">
              <div
                v-for="(value, name) in spacing.scale"
                :key="String(name)"
                class="flex items-center gap-3"
              >
                <span class="w-16 text-xs text-muted-foreground font-mono text-right shrink-0">{{ name }}</span>
                <div
                  class="h-5 rounded"
                  :style="{
                    width: Math.min(Number(value) || 0, 400) + 'px',
                    backgroundColor: colors?.primary || 'hsl(var(--primary))',
                    opacity: 0.6,
                  }"
                />
                <span class="text-xs text-muted-foreground font-mono">{{ value }}px</span>
              </div>
            </div>
          </template>
        </div>
      </UiCard>

      <!-- ═══════ 5. Recipes ═══════ -->
      <UiCard class="overflow-hidden">
        <div class="px-6 pt-6 pb-2">
          <div class="flex items-center gap-2 mb-1">
            <SquareStack class="size-5 text-muted-foreground" />
            <h2 class="text-2xl font-bold">Recipes</h2>
          </div>
          <p class="text-sm text-muted-foreground">Section layout recipes grouped by pattern</p>
        </div>

        <div class="px-6 pb-6">
          <div class="space-y-6 mt-4">
            <template v-for="pattern in PATTERNS" :key="pattern.key">
              <div v-if="recipesByPattern[pattern.key]?.length">
                <div class="flex items-center gap-2 mb-3">
                  <component :is="pattern.icon" class="size-4 text-muted-foreground" />
                  <h3 class="text-sm font-semibold">{{ pattern.label }}</h3>
                  <UiBadge variant="secondary" class="text-[10px]">
                    {{ recipesByPattern[pattern.key].length }}
                  </UiBadge>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div
                    v-for="(recipe, idx) in recipesByPattern[pattern.key]"
                    :key="idx"
                    class="border rounded-lg overflow-hidden"
                  >
                    <!-- Mini preview -->
                    <div class="h-28 bg-muted/30 relative overflow-hidden">
                      <!-- Saved thumbnail from extraction -->
                      <template v-if="recipe.defaults_json?.thumbnail_url">
                        <img
                          :src="recipe.defaults_json.thumbnail_url"
                          class="w-full h-full object-cover object-top"
                          loading="lazy"
                        />
                      </template>

                      <!-- Card-grid preview -->
                      <template v-else-if="pattern.key === 'card-grid'">
                        <div
                          class="p-3 h-full flex items-center justify-center"
                          :style="{ backgroundColor: recipe.defaults_json?.section_style?.background || '#f9fafb' }"
                        >
                          <div
                            class="grid gap-1.5 w-full"
                            :style="{
                              gridTemplateColumns: `repeat(${recipe.defaults_json?.columns || 3}, 1fr)`,
                            }"
                          >
                            <div
                              v-for="c in Math.min(recipe.defaults_json?.columns || 3, 4)"
                              :key="c"
                              class="flex flex-col gap-1 overflow-hidden"
                              :style="{
                                backgroundColor: recipe.defaults_json?.card_style?.background || '#fff',
                                border: recipe.defaults_json?.card_style?.border || '1px solid #e5e7eb',
                                borderRadius: (recipe.defaults_json?.card_style?.border_radius ?? 6) + 'px',
                              }"
                            >
                              <template v-for="slot in (recipe.defaults_json?.card_composition || ['image', 'title', 'body'])" :key="slot">
                                <div v-if="slot === 'image'" class="w-full h-6 bg-muted rounded-t" />
                                <div v-else-if="slot === 'title'" class="text-[7px] font-semibold px-1.5 truncate">Title</div>
                                <div v-else-if="slot === 'body'" class="text-[6px] text-muted-foreground px-1.5">Body text</div>
                                <div v-else-if="slot === 'cta'" class="text-[6px] px-1.5 pb-1" :style="{ color: colors?.primary || 'hsl(var(--primary))' }">CTA</div>
                                <div v-else-if="slot === 'badge'" class="px-1.5"><span class="text-[5px] px-1 py-0.5 rounded-full bg-primary/10 text-primary">Tag</span></div>
                              </template>
                            </div>
                          </div>
                        </div>
                      </template>

                      <!-- Hero preview -->
                      <template v-else-if="pattern.key === 'hero'">
                        <div class="h-full bg-gradient-to-br from-zinc-700 to-zinc-900 relative">
                          <div
                            class="absolute p-3"
                            :style="{
                              ...(recipe.defaults_json?.overlay_position === 'center'
                                ? { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }
                                : recipe.defaults_json?.overlay_position === 'top-center'
                                  ? { top: '12px', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }
                                  : recipe.defaults_json?.overlay_position === 'bottom-center'
                                    ? { bottom: '12px', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }
                                    : recipe.defaults_json?.overlay_position === 'top-left'
                                      ? { top: '12px', left: '12px', textAlign: 'left' }
                                      : { bottom: '12px', left: '12px', textAlign: 'left' }),
                            }"
                          >
                            <div
                              class="text-xs font-bold"
                              :style="{ color: recipe.defaults_json?.text_color || '#fff' }"
                            >
                              Hero Heading
                            </div>
                            <div
                              class="text-[8px] mt-0.5 opacity-70"
                              :style="{ color: recipe.defaults_json?.text_color || '#fff' }"
                            >
                              Sub heading
                            </div>
                          </div>
                        </div>
                      </template>

                      <!-- Split content preview -->
                      <template v-else-if="pattern.key === 'split-content'">
                        <div
                          class="h-full p-3 flex gap-2"
                          :style="{
                            backgroundColor: recipe.defaults_json?.section_style?.background || '#f9fafb',
                            flexDirection: (recipe.defaults_json?.image_position || 'left') === 'right' ? 'row' : 'row-reverse',
                          }"
                        >
                          <div class="flex-1 flex flex-col justify-center gap-1">
                            <div class="text-[8px] font-semibold">Section Title</div>
                            <div class="text-[6px] text-muted-foreground">Content preview text here...</div>
                          </div>
                          <div class="flex-1 bg-muted rounded" />
                        </div>
                      </template>

                      <!-- Generic preview -->
                      <template v-else>
                        <div
                          class="h-full flex items-center justify-center"
                          :style="{ backgroundColor: recipe.defaults_json?.section_style?.background || '#f9fafb' }"
                        >
                          <div class="text-center">
                            <div class="text-[8px] font-medium text-muted-foreground mb-1">{{ pattern.label }}</div>
                            <div class="border rounded px-3 py-2 bg-background inline-block">
                              <div class="text-[7px] font-semibold">Content</div>
                            </div>
                          </div>
                        </div>
                      </template>
                    </div>

                    <!-- Recipe info -->
                    <div class="px-3 py-2.5 bg-background">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-medium truncate">{{ recipe.label }}</span>
                        <UiBadge
                          :variant="recipe.source === 'brand' ? 'default' : 'secondary'"
                          class="text-[9px] shrink-0"
                        >
                          {{ recipe.source === 'brand' ? 'Brand' : 'Default' }}
                        </UiBadge>
                      </div>
                      <div class="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span class="font-mono">{{ recipe.variant }}</span>
                        <span>&rarr;</span>
                        <UiBadge variant="outline" class="text-[9px]">{{ recipe.resolves_to }}</UiBadge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Empty state -->
            <div
              v-if="!Object.values(recipesByPattern).some(arr => arr.length)"
              class="py-8 text-center"
            >
              <p class="text-sm text-muted-foreground">No recipes available for this OEM</p>
            </div>
          </div>
        </div>
      </UiCard>

      <!-- ═══════ 6. Components ═══════ -->
      <UiCard v-if="components && Object.keys(components).length" class="overflow-hidden">
        <div class="px-6 pt-6 pb-2">
          <div class="flex items-center gap-2 mb-1">
            <Layers class="size-5 text-muted-foreground" />
            <h2 class="text-2xl font-bold">Components</h2>
          </div>
          <p class="text-sm text-muted-foreground">Component-level design specifications</p>
        </div>

        <div class="px-6 pb-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            <!-- Card component -->
            <div v-if="components.card" class="border rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-semibold">Card</h3>
              <div class="space-y-1.5 text-xs text-muted-foreground">
                <div v-if="components.card.background" class="flex justify-between">
                  <span>Background</span>
                  <div class="flex items-center gap-1.5">
                    <div class="size-3 rounded border" :style="{ backgroundColor: components.card.background }" />
                    <span class="font-mono">{{ components.card.background }}</span>
                  </div>
                </div>
                <div v-if="components.card.radius || components.card.borderRadius" class="flex justify-between">
                  <span>Radius</span>
                  <span class="font-mono">{{ components.card.radius || components.card.borderRadius }}</span>
                </div>
                <div v-if="components.card.shadow || components.card.boxShadow" class="flex justify-between">
                  <span>Shadow</span>
                  <span class="font-mono text-[10px]">{{ components.card.shadow || components.card.boxShadow }}</span>
                </div>
                <div v-if="components.card.padding" class="flex justify-between">
                  <span>Padding</span>
                  <span class="font-mono">{{ components.card.padding }}</span>
                </div>
              </div>
            </div>

            <!-- Hero component -->
            <div v-if="components.hero" class="border rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-semibold">Hero</h3>
              <div class="space-y-1.5 text-xs text-muted-foreground">
                <div v-if="components.hero.min_height || components.hero.minHeight" class="flex justify-between">
                  <span>Min Height</span>
                  <span class="font-mono">{{ components.hero.min_height || components.hero.minHeight }}</span>
                </div>
                <div v-if="components.hero.overlay" class="flex justify-between">
                  <span>Overlay</span>
                  <span class="font-mono">{{ components.hero.overlay }}</span>
                </div>
                <div v-if="components.hero.text_align || components.hero.textAlign" class="flex justify-between">
                  <span>Text Align</span>
                  <span class="font-mono">{{ components.hero.text_align || components.hero.textAlign }}</span>
                </div>
              </div>
            </div>

            <!-- Nav component -->
            <div v-if="components.nav" class="border rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-semibold">Navigation</h3>
              <div class="space-y-1.5 text-xs text-muted-foreground">
                <div v-if="components.nav.height" class="flex justify-between">
                  <span>Height</span>
                  <span class="font-mono">{{ components.nav.height }}</span>
                </div>
                <div v-if="components.nav.background" class="flex justify-between">
                  <span>Background</span>
                  <div class="flex items-center gap-1.5">
                    <div class="size-3 rounded border" :style="{ backgroundColor: components.nav.background }" />
                    <span class="font-mono">{{ components.nav.background }}</span>
                  </div>
                </div>
                <div v-if="components.nav.sticky !== undefined" class="flex justify-between">
                  <span>Sticky</span>
                  <span class="font-mono">{{ components.nav.sticky ? 'Yes' : 'No' }}</span>
                </div>
              </div>
            </div>

            <!-- Generic components -->
            <template v-for="(spec, name) in components" :key="String(name)">
              <div
                v-if="!['card', 'hero', 'nav'].includes(String(name)) && typeof spec === 'object'"
                class="border rounded-lg p-4 space-y-3"
              >
                <h3 class="text-sm font-semibold capitalize">{{ String(name).replace(/_/g, ' ') }}</h3>
                <div class="space-y-1.5 text-xs text-muted-foreground">
                  <div v-for="(val, prop) in (spec as Record<string, any>)" :key="String(prop)" class="flex justify-between">
                    <span class="capitalize">{{ String(prop).replace(/_/g, ' ') }}</span>
                    <span class="font-mono text-[10px] max-w-[160px] truncate text-right">{{ val }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </UiCard>

    </div>

    <!-- Extract from URL Dialog -->
    <div
      v-if="showExtractDialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="showExtractDialog = false"
    >
      <div class="bg-background border rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <h2 class="text-lg font-semibold">Extract Recipes from URL</h2>
          <button class="text-muted-foreground hover:text-foreground" @click="showExtractDialog = false">
            <X class="size-5" />
          </button>
        </div>

        <div class="p-6 space-y-4 overflow-y-auto flex-1">
          <!-- URL input (supports multiple, one per line) -->
          <div class="space-y-2">
            <textarea
              v-model="extractUrlText"
              placeholder="Enter one or more URLs (one per line)&#10;https://www.toyota.com.au&#10;https://www.toyota.com.au/rav4"
              class="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              :disabled="extracting"
            />
            <div class="flex justify-end">
              <UiButton :disabled="extracting || !extractUrlText.trim()" @click="handleExtract">
                <Loader2 v-if="extracting" class="size-4 mr-1 animate-spin" />
                <Sparkles v-else class="size-4 mr-1" />
                {{ extracting ? 'Extracting...' : 'Extract' }}
              </UiButton>
            </div>
          </div>

          <p v-if="extracting" class="text-sm text-muted-foreground">
            {{ extractProgress || 'Capturing screenshot and analyzing layout patterns... This may take 30-60 seconds per URL.' }}
          </p>

          <!-- Error -->
          <div v-if="extractError" class="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
            {{ extractError }}
          </div>

          <!-- Results -->
          <div v-if="extractResults.length" class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium">
                {{ extractResults.length }} recipes extracted
                <span v-if="batchResults.length > 1" class="text-muted-foreground"> from {{ batchResults.length }} URLs</span>
              </p>
              <UiButton size="sm" variant="outline" @click="saveAllExtracted">
                <Check class="size-3.5 mr-1" /> Save All
              </UiButton>
            </div>

            <!-- Batch URL headers -->
            <template v-if="batchResults.length > 1">
              <div v-for="batch in batchResults" :key="batch.url" class="space-y-2">
                <p class="text-xs font-medium text-muted-foreground border-b pb-1">{{ batch.url }} ({{ batch.recipes.length }})</p>
              </div>
            </template>

            <div
              v-for="(recipe, idx) in extractResults"
              :key="idx"
              class="border rounded-lg p-3 flex gap-3"
              :class="savedRecipeIdxs.has(idx) ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' : ''"
            >
              <!-- Section thumbnail (canvas-cropped) -->
              <div
                v-if="thumbnails.has(idx)"
                class="flex-shrink-0 w-[140px] h-[90px] rounded border overflow-hidden bg-muted"
              >
                <img
                  :src="thumbnails.get(idx)"
                  class="w-full h-full object-cover object-top"
                />
              </div>

              <!-- Recipe info -->
              <div class="flex-1 min-w-0 space-y-1.5">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-semibold">{{ recipe.label }}</span>
                    <UiBadge variant="outline" class="text-[10px]">{{ recipe.pattern }}</UiBadge>
                    <UiBadge variant="secondary" class="text-[10px]">{{ recipe.variant }}</UiBadge>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-[10px] text-muted-foreground">
                      {{ Math.round(recipe.confidence * 100) }}%
                    </span>
                    <UiButton
                      size="sm"
                      variant="outline"
                      :disabled="generatingIdx !== null"
                      @click="handleGenerate(recipe, idx)"
                    >
                      <Loader2 v-if="generatingIdx === idx" class="size-3.5 mr-1 animate-spin" />
                      <Wand2 v-else class="size-3.5 mr-1" />
                      {{ generatingIdx === idx ? 'Generating...' : 'Generate' }}
                    </UiButton>
                    <UiButton
                      v-if="!savedRecipeIdxs.has(idx)"
                      size="sm"
                      variant="outline"
                      :disabled="savingRecipeIdx === idx"
                      @click="saveExtractedRecipe(recipe, idx)"
                    >
                      <Loader2 v-if="savingRecipeIdx === idx" class="size-3.5 mr-1 animate-spin" />
                      <Check v-else class="size-3.5 mr-1" />
                      Save
                    </UiButton>
                    <span v-else class="text-xs text-green-600 font-medium">Saved</span>
                  </div>
                </div>
                <div class="flex gap-4 text-xs text-muted-foreground">
                  <span>Resolves to: <code class="bg-muted px-1 rounded">{{ recipe.resolves_to }}</code></span>
                </div>

                <!-- Generated component preview -->
                <div v-if="generatedComponents.has(idx)" class="mt-2">
                  <button
                    class="flex items-center gap-1 text-xs text-primary hover:underline"
                    @click="expandedPreview.has(idx) ? expandedPreview.delete(idx) : expandedPreview.add(idx)"
                  >
                    <ChevronDown class="size-3" :class="{ 'rotate-180': !expandedPreview.has(idx) }" />
                    {{ expandedPreview.has(idx) ? 'Hide' : 'Show' }} Component Preview
                  </button>
                  <div v-if="expandedPreview.has(idx)" class="mt-2 space-y-2">
                    <iframe
                      :srcdoc="buildPreviewSrcdoc(generatedComponents.get(idx)!)"
                      class="w-full border rounded-lg bg-white"
                      style="min-height: 200px; max-height: 400px;"
                      sandbox="allow-scripts"
                    />
                    <button
                      class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      @click="copyHtml(idx)"
                    >
                      <Copy class="size-3" /> Copy HTML
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Crawl Tokens Dialog -->
    <div
      v-if="showCrawlDialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="showCrawlDialog = false"
    >
      <div class="bg-background border rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <h2 class="text-lg font-semibold">Crawl Live Tokens</h2>
          <button class="text-muted-foreground hover:text-foreground" @click="showCrawlDialog = false">
            <X class="size-5" />
          </button>
        </div>

        <div class="p-6 space-y-4 overflow-y-auto flex-1">
          <div class="flex gap-2">
            <UiInput
              v-model="crawlUrl"
              :placeholder="`https://www.${selectedOem?.replace('-au','')}.com.au`"
              class="flex-1"
              @keydown.enter="handleCrawlTokens"
            />
            <UiButton :disabled="crawling || batchCrawling || !crawlUrl" @click="handleCrawlTokens">
              <Loader2 v-if="crawling" class="size-4 mr-1 animate-spin" />
              <ScanSearch v-else class="size-4 mr-1" />
              {{ crawling ? 'Crawling...' : 'Crawl' }}
            </UiButton>
          </div>

          <div class="flex items-center gap-2 pt-2 border-t">
            <UiButton variant="outline" size="sm" :disabled="batchCrawling || crawling" @click="handleBatchCrawl">
              <Loader2 v-if="batchCrawling" class="size-3.5 mr-1 animate-spin" />
              <ScanSearch v-else class="size-3.5 mr-1" />
              {{ batchCrawling ? 'Crawling All...' : 'Crawl All OEMs' }}
            </UiButton>
            <span v-if="batchProgress" class="text-xs text-muted-foreground">{{ batchProgress }}</span>
          </div>

          <!-- Batch crawl results -->
          <div v-if="batchCrawlResults.length" class="border rounded-lg overflow-hidden">
            <table class="w-full text-xs">
              <thead><tr class="bg-muted/50"><th class="px-3 py-1.5 text-left">OEM</th><th class="px-3 py-1.5 text-center">Changes</th><th class="px-3 py-1.5 text-center">Status</th></tr></thead>
              <tbody class="divide-y">
                <tr v-for="r in batchCrawlResults" :key="r.oem_id">
                  <td class="px-3 py-1.5">{{ r.oem_id.replace('-au','') }}</td>
                  <td class="px-3 py-1.5 text-center" :class="r.changes > 0 ? 'font-semibold text-amber-600' : ''">{{ r.changes }}</td>
                  <td class="px-3 py-1.5 text-center">
                    <span v-if="r.error" class="text-destructive">{{ r.error.slice(0, 30) }}</span>
                    <span v-else class="text-green-600">{{ r.changes > 0 ? 'Updated' : 'No changes' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-if="crawling" class="text-sm text-muted-foreground">
            Visiting site and extracting CSS tokens... This may take 15-30 seconds.
          </p>

          <!-- Diff table -->
          <div v-if="crawlDiff" class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium">{{ crawlDiff.filter(d => d.changed).length }} values changed</p>
              <UiButton
                v-if="crawlDiff.some(d => d.changed)"
                size="sm"
                :disabled="applyingTokens"
                @click="handleApplyTokens"
              >
                <Loader2 v-if="applyingTokens" class="size-3.5 mr-1 animate-spin" />
                <Check v-else class="size-3.5 mr-1" />
                Apply Changes
              </UiButton>
            </div>

            <div class="border rounded-lg overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-muted/50 text-left">
                    <th class="px-3 py-2 font-medium">Token</th>
                    <th class="px-3 py-2 font-medium">Current</th>
                    <th class="px-3 py-2 font-medium">Crawled</th>
                  </tr>
                </thead>
                <tbody class="divide-y">
                  <tr
                    v-for="row in crawlDiff"
                    :key="row.field"
                    :class="row.changed ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''"
                  >
                    <td class="px-3 py-2 font-mono text-xs">{{ row.field }}</td>
                    <td class="px-3 py-2">
                      <div class="flex items-center gap-1.5">
                        <div
                          v-if="row.current.startsWith('#')"
                          class="size-4 rounded border"
                          :style="{ backgroundColor: row.current }"
                        />
                        <span class="text-xs">{{ row.current }}</span>
                      </div>
                    </td>
                    <td class="px-3 py-2">
                      <div class="flex items-center gap-1.5">
                        <div
                          v-if="row.crawled.startsWith('#')"
                          class="size-4 rounded border"
                          :style="{ backgroundColor: row.crawled }"
                        />
                        <span class="text-xs" :class="row.changed ? 'font-semibold text-amber-700 dark:text-amber-400' : ''">
                          {{ row.crawled }}
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </BasicPage>
</template>
