<script lang="ts" setup>
import { getFontEmbedCSS, toSvg } from 'html-to-image'
import { AlertTriangle, CheckCircle2, Loader2, ScanSearch } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'

import type { CandidateGraph } from '@/lib/adaptive-match-contracts'
import type { RegionFidelityStatus } from '@/lib/region-fidelity'

import { candidateGraphToSection } from '@/lib/adaptive-match-contracts'
import { detectAdaptiveMatchInteraction } from '@/lib/adaptive-match-detection'
import { evaluateAdaptiveCandidate } from '@/lib/adaptive-match-qa'
import { inlineFidelityFrameImages, rewriteFidelityCssAssetUrls, rewriteFidelityHtmlAssetUrls, stripFidelitySrcsetAttributes } from '@/lib/fidelity-assets'
import { withFidelityMeasurementTimeout } from '@/lib/fidelity-measurement'
import { compareRegionPixels, measureRegionOverflow } from '@/lib/region-fidelity'
import { requestAdaptiveMatch } from '@/lib/worker-api'

import type { CapturedAdaptiveMatchEvidence } from './use-adaptive-match'

import AdaptiveMatchFrame from './AdaptiveMatchFrame.vue'
import { useAdaptiveMatch } from './use-adaptive-match'

type ViewportName = 'desktop' | 'tablet' | 'mobile'
interface CandidateFrameHandle {
  ready: () => Promise<void>
  root: () => HTMLElement | null
  document: () => Document | null
}

interface CapturedFrame {
  dataUrl: string
  pixels: ImageData
}

interface ViewportResult {
  name: ViewportName
  width: number
  height: number
  mismatchRatio: number
  status: RegionFidelityStatus
  reference: string
  candidate: string
  diff: string
  horizontalOverflow: boolean
  clippedContent: boolean
}

const props = defineProps<{
  open: boolean
  oemId: string
  modelSlug: string
  sourceUrl: string
  regionId: string
  originalHtml: string
  originalCss: string
  recipeArtifact?: Record<string, unknown> | null
  candidateSection: Record<string, any> | null
  modelOverride?: { provider?: string, model?: string, fallbackProvider?: string, fallbackModel?: string }
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'apply': [section: Record<string, any>]
}>()

const VIEWPORTS = [
  { name: 'desktop' as const, width: 1440, height: 1100, timeoutMs: 60_000 },
  { name: 'tablet' as const, width: 1024, height: 900, timeoutMs: 45_000 },
  { name: 'mobile' as const, width: 390, height: 844, timeoutMs: 30_000 },
]
const FRAME_ASSET_TIMEOUT_MS = 10_000
const FRAME_FONT_TIMEOUT_MS = 30_000
const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'

const selectedViewport = ref<ViewportName>('desktop')
const evidenceMode = ref<'side-by-side' | 'overlay' | 'diff'>('side-by-side')
const overlayOpacity = ref(50)
const results = ref<ViewportResult[]>([])
const referenceFrames = new Map<ViewportName, HTMLIFrameElement>()
const candidateFrames = new Map<ViewportName, CandidateFrameHandle>()
const referenceCaptures = new Map<ViewportName, CapturedFrame>()
const frameImageCache = new Map<string, Promise<string>>()

function safeHtml(value: string): string {
  return String(value || '')
    .replace(/<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

function referenceSrcdoc(): string {
  const css = rewriteFidelityCssAssetUrls(props.originalCss, props.oemId, WORKER_BASE)
    .replace(/<\/style/gi, '<\\/style')
    .replace(/javascript:/gi, '')
  const html = safeHtml(stripFidelitySrcsetAttributes(rewriteFidelityHtmlAssetUrls(props.originalHtml, props.oemId, WORKER_BASE)))
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n*,*::before,*::after{animation:none!important;transition:none!important}html,body{margin:0;min-height:100%;background:#fff;color:#111}</style></head><body>${html}</body></html>`
}

function setReferenceFrame(name: ViewportName, value: Element | null) {
  if (value instanceof HTMLIFrameElement)
    referenceFrames.set(name, value)
  else
    referenceFrames.delete(name)
}

function setCandidateFrame(name: ViewportName, value: unknown) {
  if (value && typeof value === 'object' && 'ready' in value)
    candidateFrames.set(name, value as CandidateFrameHandle)
  else
    candidateFrames.delete(name)
}

async function waitForAssets(root: HTMLElement, doc: Document, label: string): Promise<void> {
  if (doc.fonts) {
    await withFidelityMeasurementTimeout(() => doc.fonts.ready, FRAME_ASSET_TIMEOUT_MS, `${label} fonts`)
  }
  await withFidelityMeasurementTimeout(
    () => Promise.all(Array.from(root.querySelectorAll('img')).map(image => image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true })
          image.addEventListener('error', () => resolve(), { once: true })
        }))),
    FRAME_ASSET_TIMEOUT_MS,
    `${label} assets`,
  )
  const broken = Array.from(root.querySelectorAll('img')).find(image => Boolean(image.currentSrc || image.src) && image.naturalWidth === 0)
  if (broken)
    throw new Error(`Comparison asset failed to load: ${broken.currentSrc || broken.src}`)
}

async function captureRoot(root: HTMLElement, doc: Document, viewport: typeof VIEWPORTS[number], label: string): Promise<CapturedFrame> {
  await waitForAssets(root, doc, label)
  await withFidelityMeasurementTimeout(
    () => inlineFidelityFrameImages(root, { cache: frameImageCache }),
    FRAME_ASSET_TIMEOUT_MS,
    `${label} image preparation`,
  )
  const fontEmbedCSS = await withFidelityMeasurementTimeout(
    () => getFontEmbedCSS(root, { cacheBust: false }),
    FRAME_FONT_TIMEOUT_MS,
    `${label} font preparation`,
  )
  // WebKit can stall html-to-image's requestAnimationFrame-based canvas path in a
  // background tab, so rasterise the generated SVG directly and sequentially.
  const svg = await withFidelityMeasurementTimeout(
    () => toSvg(root, {
      cacheBust: false,
      fontEmbedCSS,
      pixelRatio: 1,
      width: viewport.width,
      height: viewport.height,
      style: { margin: '0', width: `${viewport.width}px`, height: `${viewport.height}px`, overflow: 'hidden' },
    }),
    viewport.timeoutMs,
    `${viewport.name} ${label} capture`,
  )
  const image = await withFidelityMeasurementTimeout(
    () => new Promise<HTMLImageElement>((resolve, reject) => {
      const raster = new Image()
      raster.onload = () => resolve(raster)
      raster.onerror = () => reject(new Error(`${viewport.name} ${label} capture image failed to render`))
      raster.src = svg
    }),
    viewport.timeoutMs,
    `${viewport.name} ${label} raster`,
  )
  const canvas = doc.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('Canvas comparison is unavailable')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, viewport.width, viewport.height)
  context.drawImage(image, 0, 0, viewport.width, viewport.height)
  return { dataUrl: canvas.toDataURL('image/png'), pixels: context.getImageData(0, 0, viewport.width, viewport.height) }
}

function createDiff(reference: ImageData, candidate: ImageData): string {
  const canvas = document.createElement('canvas')
  canvas.width = reference.width
  canvas.height = reference.height
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('Diff canvas is unavailable')
  const diff = context.createImageData(reference.width, reference.height)
  const threshold = Math.round(0.1 * 255)
  for (let index = 0; index < reference.data.length; index += 4) {
    const delta = Math.max(
      Math.abs(reference.data[index] - candidate.data[index]),
      Math.abs(reference.data[index + 1] - candidate.data[index + 1]),
      Math.abs(reference.data[index + 2] - candidate.data[index + 2]),
      Math.abs(reference.data[index + 3] - candidate.data[index + 3]),
    )
    if (delta > threshold)
      diff.data.set([239, 68, 68, 230], index)
    else diff.data.set([reference.data[index], reference.data[index + 1], reference.data[index + 2], 55], index)
  }
  context.putImageData(diff, 0, 0)
  return canvas.toDataURL('image/png')
}

function stripPngPrefix(value: string): string {
  return value.replace(/^data:image\/png;base64,/i, '')
}

async function createContactSheet(dataUrls: string[]): Promise<string> {
  const images = await Promise.all(dataUrls.map(dataUrl => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Adaptive Match contact sheet image failed to render'))
    image.src = dataUrl
  })))
  const width = 720
  const cellHeight = 480
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = cellHeight * images.length
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('Adaptive Match contact sheet canvas is unavailable')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  images.forEach((image, index) => {
    const scale = Math.min(width / image.width, cellHeight / image.height)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    context.drawImage(image, (width - drawWidth) / 2, index * cellHeight + (cellHeight - drawHeight) / 2, drawWidth, drawHeight)
  })
  return stripPngPrefix(canvas.toDataURL('image/png'))
}

function resolvedSourceUrl(): string {
  return new URL(props.sourceUrl || '/', window.location.origin).toString()
}

function extractEvidenceContent() {
  const parsed = new DOMParser().parseFromString(safeHtml(props.originalHtml), 'text/html')
  const text = [...new Set(Array.from(parsed.querySelectorAll('h1,h2,h3,h4,p,li,button,a'))
    .map(node => String(node.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean))].slice(0, 500)
  const assets = Array.from(parsed.querySelectorAll('img')).slice(0, 200).flatMap((image) => {
    const raw = image.getAttribute('src') || ''
    try {
      const url = new URL(raw, resolvedSourceUrl()).toString()
      return [{ url, alt: image.getAttribute('alt') || '', required: true }]
    }
    catch {
      return []
    }
  })
  return { text, assets }
}

async function captureEvidence(): Promise<CapturedAdaptiveMatchEvidence> {
  referenceCaptures.clear()
  results.value = []
  const detection = detectAdaptiveMatchInteraction({ html: props.originalHtml, artifact: props.recipeArtifact })
  for (const viewport of VIEWPORTS) {
    const frame = referenceFrames.get(viewport.name)
    const doc = frame?.contentDocument
    if (!doc?.body)
      throw new Error(`${viewport.name} OEM comparison frame is unavailable`)
    const capture = await captureRoot(doc.body, doc, viewport, 'OEM')
    referenceCaptures.set(viewport.name, capture)
  }
  const referenceContactSheet = await createContactSheet(VIEWPORTS.map((viewport) => {
    const capture = referenceCaptures.get(viewport.name)
    if (!capture)
      throw new Error(`${viewport.name} OEM evidence was not captured`)
    return capture.dataUrl
  }))
  return {
    contactSheetBase64: referenceContactSheet,
    evidence: {
      version: 1 as const,
      oemId: props.oemId,
      modelSlug: props.modelSlug,
      sourceUrl: resolvedSourceUrl(),
      regionId: props.regionId,
      html: props.originalHtml,
      css: props.originalCss,
      recipeArtifact: props.recipeArtifact ?? null,
      detection,
      interactionStates: [{
        id: 'initial',
        ...(detection.itemCount ? { activeIndex: 0 } : {}),
        visibleItems: detection.itemCount ? [0] : [],
        expandedItems: [],
      }],
      viewports: VIEWPORTS.map(({ name, width, height }) => ({ name, width, height })),
      content: extractEvidenceContent(),
    },
  }
}

async function probeInteractions(root: HTMLElement, graph: CandidateGraph) {
  const failures: string[] = []
  let required = 0
  let passed = 0
  if (graph.kind === 'carousel') {
    required += 1
    const before = root.querySelector('[data-adaptive-active="true"]')?.getAttribute('data-adaptive-item')
    ;(root.querySelector('[data-adaptive-next]') as HTMLButtonElement | null)?.click()
    await nextTick()
    const after = root.querySelector('[data-adaptive-active="true"]')?.getAttribute('data-adaptive-item')
    if (before !== after)
      passed += 1
    else failures.push('Carousel next control did not change the active item')
    ;(root.querySelector('[data-adaptive-prev]') as HTMLButtonElement | null)?.click()
    await nextTick()
  }
  else if (graph.kind === 'gallery-lightbox') {
    required += 2
    ;(root.querySelector('[data-adaptive-item="0"]') as HTMLElement | null)?.click()
    await nextTick()
    const lightbox = root.querySelector('[data-adaptive-lightbox]') as HTMLElement | null
    if (lightbox)
      passed += 1
    else failures.push('Gallery item did not open the lightbox')
    lightbox?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    if (!root.querySelector('[data-adaptive-lightbox]'))
      passed += 1
    else failures.push('Gallery lightbox did not close with Escape')
  }
  else if (graph.kind === 'tabs') {
    required += 1
    const tabs = root.querySelectorAll<HTMLButtonElement>('[data-adaptive-tab]')
    tabs[1]?.click()
    await nextTick()
    if (tabs.length < 2 || tabs[1]?.getAttribute('aria-selected') === 'true')
      passed += 1
    else failures.push('Tab selection did not update the visible panel')
    tabs[0]?.click()
    await nextTick()
  }
  else if (graph.kind === 'accordion') {
    required += 1
    const trigger = root.querySelector<HTMLButtonElement>('[data-adaptive-accordion-trigger="0"]')
    trigger?.click()
    await nextTick()
    if (trigger?.getAttribute('aria-expanded') === 'true')
      passed += 1
    else failures.push('Accordion trigger did not expand its panel')
    trigger?.click()
    await nextTick()
  }
  return { required, passed, failures }
}

function contentMatches(root: HTMLElement, evidence: CapturedAdaptiveMatchEvidence['evidence']) {
  const renderedText = String(root.textContent || '').replace(/\s+/g, ' ').toLowerCase()
  const matchedText = evidence.content.text.filter(item => renderedText.includes(item.toLowerCase())).length
  const images = Array.from(root.querySelectorAll('img'))
  const matchedAssets = evidence.content.assets.filter(asset => images.some((image) => {
    const altMatches = asset.alt && image.alt === asset.alt
    const sourceMatches = image.src === asset.url || image.src.endsWith(new URL(asset.url).pathname)
    return Boolean(altMatches || sourceMatches)
  })).length
  return {
    expectedText: evidence.content.text.length,
    matchedText,
    expectedAssets: evidence.content.assets.filter(asset => asset.required).length,
    matchedAssets,
  }
}

async function evaluateCandidate(graph: CandidateGraph, context: { evidence: CapturedAdaptiveMatchEvidence, attempt: number }) {
  await nextTick()
  const desktopHandle = candidateFrames.get('desktop')
  await desktopHandle?.ready()
  const desktopRoot = desktopHandle?.root()
  if (!desktopRoot)
    throw new Error('Adaptive candidate frame is unavailable')
  const interaction = await probeInteractions(desktopRoot, graph)
  const content = contentMatches(desktopRoot, context.evidence.evidence)
  const measured: ViewportResult[] = []
  for (const viewport of VIEWPORTS) {
    const handle = candidateFrames.get(viewport.name)
    await handle?.ready()
    const root = handle?.root()
    const doc = handle?.document()
    const reference = referenceCaptures.get(viewport.name)
    if (!root || !doc || !reference)
      throw new Error(`${viewport.name} candidate comparison frame is unavailable`)
    const overflow = measureRegionOverflow(root)
    const candidate = await captureRoot(root, doc, viewport, `candidate ${context.attempt}`)
    const comparison = compareRegionPixels(reference.pixels.data, candidate.pixels.data)
    measured.push({
      name: viewport.name,
      width: viewport.width,
      height: viewport.height,
      mismatchRatio: comparison.mismatchRatio,
      status: comparison.status,
      reference: reference.dataUrl,
      candidate: candidate.dataUrl,
      diff: createDiff(reference.pixels, candidate.pixels),
      horizontalOverflow: overflow.horizontalOverflow,
      clippedContent: overflow.clippedContent,
    })
    results.value = [...measured]
  }
  const qa = evaluateAdaptiveCandidate({
    viewports: measured.map(result => ({
      name: result.name,
      mismatchRatio: result.mismatchRatio,
      horizontalOverflow: result.horizontalOverflow,
      clippedContent: result.clippedContent,
    })),
    interaction,
    content,
  })
  const worst = [...measured].sort((left, right) => right.mismatchRatio - left.mismatchRatio)[0]
  return {
    qa,
    contactSheetBase64: worst ? await createContactSheet([worst.reference, worst.candidate]) : undefined,
  }
}

const controller = useAdaptiveMatch({
  captureEvidence,
  deterministicSection: props.candidateSection,
  evaluateCandidate,
  requestAdaptiveMatch,
  modelOverride: props.modelOverride,
})

const selectedResult = computed(() => results.value.find(result => result.name === selectedViewport.value) ?? null)
const isRunning = computed(() => ['capturing', 'detecting', 'building', 'testing', 'repairing'].includes(controller.state.stage))
const canApply = computed(() => controller.state.stage === 'ready' && Boolean(controller.bestAttempt.value?.safe && controller.bestCandidate.value))
const applyAnyway = computed(() => canApply.value && controller.bestAttempt.value?.qa?.passed === false)
const stageLabel = computed(() => ({
  idle: 'Ready',
  capturing: 'Capturing OEM evidence',
  detecting: 'Detecting interaction pattern',
  building: 'Interpreting OEM region',
  testing: 'Testing candidate',
  repairing: 'Repairing candidate',
  ready: controller.bestAttempt.value?.qa?.passed ? 'Candidate passed' : 'Best candidate ready for review',
  failed: 'No safe candidate',
  cancelled: 'Cancelled',
}[controller.state.stage]))

watch(() => props.open, async (open) => {
  if (!open) {
    controller.cancel()
    return
  }
  selectedViewport.value = 'desktop'
  evidenceMode.value = 'side-by-side'
  results.value = []
  referenceCaptures.clear()
  await nextTick()
  await controller.start()
}, { immediate: true })

function close() {
  controller.cancel()
  emit('update:open', false)
}

function applyCandidate() {
  const best = controller.bestAttempt.value
  if (!canApply.value || !best?.graph || !best.qa)
    return
  emit('apply', candidateGraphToSection(best.graph, {
    runId: controller.state.runId,
    qa: { passed: best.qa.passed, worstMismatchRatio: best.qa.worstMismatchRatio },
  }))
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}
</script>

<template>
  <UiDialog :open="open" @update:open="emit('update:open', $event)">
    <UiDialogContent class="max-h-[92vh] overflow-y-auto sm:max-w-[1100px]" :aria-busy="isRunning">
      <UiDialogHeader>
        <UiDialogTitle class="flex items-center gap-2">
          <ScanSearch class="size-5" /> Adaptive Match OEM
        </UiDialogTitle>
        <UiDialogDescription>
          Interprets static and interactive OEM regions, tests up to three candidates, then waits for your explicit Apply.
        </UiDialogDescription>
      </UiDialogHeader>

      <div role="status" aria-live="polite" class="space-y-2 rounded-md border bg-muted/30 p-3">
        <div class="flex items-center gap-2 text-sm font-medium">
          <Loader2 v-if="isRunning" class="size-4 animate-spin" />
          <CheckCircle2 v-else-if="controller.state.stage === 'ready'" class="size-4 text-emerald-600" />
          <AlertTriangle v-else-if="controller.state.stage === 'failed'" class="size-4 text-destructive" />
          {{ stageLabel }}
        </div>
        <p v-if="controller.progress.value" class="text-xs text-muted-foreground capitalize">
          {{ controller.progress.value.event.replace('-', ' ') }} · attempt {{ controller.progress.value.data.attempt || controller.attempts.value.length + 1 }} of 3
        </p>
        <p v-if="controller.state.error" class="text-sm text-destructive">
          {{ controller.state.error }}
        </p>
      </div>

      <div v-if="controller.attempts.value.length" class="grid gap-2 sm:grid-cols-3" data-adaptive-attempts>
        <div v-for="attempt in controller.attempts.value" :key="attempt.attempt" class="rounded-md border p-3 text-xs" :class="attempt.qa?.passed ? 'border-emerald-500/50 bg-emerald-500/5' : ''">
          <p class="font-semibold">
            Attempt {{ attempt.attempt }} · {{ attempt.qa?.passed ? 'Passed' : attempt.safe ? 'Review' : 'Rejected' }}
          </p>
          <p v-if="attempt.qa" class="mt-1 text-muted-foreground">
            Worst mismatch {{ percent(attempt.qa.worstMismatchRatio) }} · {{ attempt.qa.failureCount }} failure{{ attempt.qa.failureCount === 1 ? '' : 's' }}
          </p>
          <p v-if="attempt.error" class="mt-1 text-destructive">
            {{ attempt.error }}
          </p>
        </div>
      </div>

      <div v-if="applyAnyway" class="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200">
        <AlertTriangle class="mr-1 inline size-4" /> No candidate passed the balanced gate. This is the best safe candidate from three attempts; applying it may retain visible differences.
      </div>

      <template v-if="results.length">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex gap-1 rounded-md bg-muted p-1">
            <button v-for="viewport in VIEWPORTS" :key="viewport.name" class="rounded px-3 py-1.5 text-xs font-medium capitalize" :class="selectedViewport === viewport.name ? 'bg-background shadow-sm' : 'text-muted-foreground'" @click="selectedViewport = viewport.name">
              {{ viewport.name }} · {{ percent(results.find(result => result.name === viewport.name)?.mismatchRatio || 0) }}
            </button>
          </div>
          <div class="flex gap-1 rounded-md bg-muted p-1">
            <button v-for="mode in ['side-by-side', 'overlay', 'diff'] as const" :key="mode" class="rounded px-3 py-1.5 text-xs font-medium capitalize" :class="evidenceMode === mode ? 'bg-background shadow-sm' : 'text-muted-foreground'" @click="evidenceMode = mode">
              {{ mode.replace('-', ' ') }}
            </button>
          </div>
        </div>

        <div v-if="selectedResult" class="overflow-hidden rounded-lg border bg-muted/20">
          <div v-if="evidenceMode === 'side-by-side'" class="grid md:grid-cols-2">
            <figure class="border-b md:border-b-0 md:border-r">
              <figcaption class="border-b px-3 py-2 text-xs font-semibold">
                OEM reference
              </figcaption><img :src="selectedResult.reference" alt="OEM reference region capture" class="h-auto w-full object-contain">
            </figure>
            <figure>
              <figcaption class="border-b px-3 py-2 text-xs font-semibold">
                Adaptive candidate
              </figcaption><img :src="selectedResult.candidate" alt="Adaptive candidate region capture" class="h-auto w-full object-contain">
            </figure>
          </div>
          <div v-else-if="evidenceMode === 'overlay'" class="space-y-2 p-3">
            <div class="relative overflow-hidden rounded border bg-white">
              <img :src="selectedResult.reference" alt="OEM reference beneath overlay" class="h-auto w-full"><img :src="selectedResult.candidate" alt="Adaptive candidate overlay" class="absolute inset-0 h-auto w-full" :style="{ opacity: overlayOpacity / 100 }">
            </div>
            <label class="flex items-center gap-3 text-xs"><span>Candidate opacity</span><input v-model.number="overlayOpacity" type="range" min="0" max="100" class="flex-1"><span>{{ overlayOpacity }}%</span></label>
          </div>
          <figure v-else>
            <figcaption class="border-b px-3 py-2 text-xs font-semibold">
              Pixel diff
            </figcaption><img :src="selectedResult.diff" alt="Pixel difference evidence" class="h-auto w-full object-contain">
          </figure>
        </div>
      </template>

      <div v-if="open" class="pointer-events-none fixed left-[-100000px] top-0 opacity-0" aria-hidden="true">
        <template v-for="viewport in VIEWPORTS" :key="viewport.name">
          <iframe :ref="value => setReferenceFrame(viewport.name, value as Element | null)" title="Hidden OEM Adaptive Match reference" sandbox="allow-same-origin" :srcdoc="referenceSrcdoc()" :style="{ width: `${viewport.width}px`, height: `${viewport.height}px` }" />
          <AdaptiveMatchFrame v-if="controller.candidateGraph.value" :ref="value => setCandidateFrame(viewport.name, value)" :graph="controller.candidateGraph.value" :oem-id="oemId" :viewport="viewport" />
        </template>
      </div>

      <UiDialogFooter>
        <UiButton variant="outline" @click="close">
          Cancel
        </UiButton>
        <UiButton data-adaptive-apply :disabled="!canApply" @click="applyCandidate">
          <CheckCircle2 class="mr-2 size-4" /> {{ applyAnyway ? 'Apply anyway' : 'Apply' }}
        </UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>
