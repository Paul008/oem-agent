<script lang="ts" setup>
import { onMounted, ref, computed, watch } from 'vue'
import {
  Loader2, Palette, AlertTriangle,
  Sparkles, Check, X, Download, FileText, Wand2, Copy, ChevronDown, ScanSearch,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { fetchStyleGuide, extractRecipesFromUrl, saveRecipe, uploadRecipeThumbnail, generateRecipeComponent, crawlLiveTokens, applyCrawledTokens, type StyleGuideData, type ExtractedRecipe } from '@/lib/worker-api'

import StyleGuideBrandHeader from './components/style-guide/StyleGuideBrandHeader.vue'
import StyleGuideColors from './components/style-guide/StyleGuideColors.vue'
import StyleGuideTypography from './components/style-guide/StyleGuideTypography.vue'
import StyleGuideButtons from './components/style-guide/StyleGuideButtons.vue'
import StyleGuideSpacing from './components/style-guide/StyleGuideSpacing.vue'
import StyleGuideRecipes from './components/style-guide/StyleGuideRecipes.vue'
import StyleGuideComponents from './components/style-guide/StyleGuideComponents.vue'

const PATTERNS = [
  { key: 'hero', label: 'Hero' },
  { key: 'card-grid', label: 'Card Grid' },
  { key: 'split-content', label: 'Split Content' },
  { key: 'media', label: 'Media' },
  { key: 'tabs', label: 'Tabs' },
  { key: 'data-display', label: 'Data Display' },
  { key: 'action-bar', label: 'Action Bar' },
  { key: 'utility', label: 'Utility' },
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
      <StyleGuideBrandHeader
        :oem-display-name="oemDisplayName"
        :colors="colors"
        :typography="typography"
        :spacing="spacing"
      />
      <StyleGuideColors :colors="colors" />
      <StyleGuideTypography :typography="typography" />
      <StyleGuideButtons :buttons="buttons" :colors="colors" />
      <StyleGuideSpacing :spacing="spacing" :colors="colors" />
      <StyleGuideRecipes
        :recipes-by-pattern="recipesByPattern"
        :colors="colors"
        :patterns="PATTERNS"
      />
      <StyleGuideComponents :components="components" />
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
