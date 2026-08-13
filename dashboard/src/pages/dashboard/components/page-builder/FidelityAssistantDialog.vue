<script lang="ts" setup>
import { toPng } from 'html-to-image'
import { AlertTriangle, CheckCircle2, Eye, Loader2, ScanSearch, Sparkles } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import type { RegionFidelityStatus } from '@/lib/region-fidelity'

import { compareRegionPixels } from '@/lib/region-fidelity'
import { scoreRegionQuality } from '@/lib/worker-api'

type ViewportName = 'desktop' | 'tablet' | 'mobile'

interface ViewportResult {
  name: ViewportName
  width: number
  height: number
  mismatchRatio: number
  status: RegionFidelityStatus
  reference: string
  candidate: string
  diff: string
}

const props = defineProps<{
  open: boolean
  oemId: string
  regionId: string
  originalHtml: string
  originalCss: string
  candidateSection: Record<string, any> | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'apply': [section: Record<string, any>]
}>()

const VIEWPORTS = [
  { name: 'desktop' as const, width: 1440, height: 1100 },
  { name: 'tablet' as const, width: 1024, height: 900 },
  { name: 'mobile' as const, width: 390, height: 844 },
]

const selectedViewport = ref<ViewportName>('desktop')
const evidenceMode = ref<'side-by-side' | 'overlay' | 'diff'>('side-by-side')
const overlayOpacity = ref(50)
const measuring = ref(false)
const measureError = ref('')
const results = ref<ViewportResult[]>([])
const aiReviewing = ref(false)
const aiReview = ref<{ score: number, feedback: string, suggestions: string[] } | null>(null)
const framePairs = new Map<ViewportName, { reference?: HTMLIFrameElement, candidate?: HTMLIFrameElement }>()
let runToken = 0

const selectedResult = computed(() => results.value.find(result => result.name === selectedViewport.value) ?? null)
const worstResult = computed(() => [...results.value].sort((a, b) => b.mismatchRatio - a.mismatchRatio)[0] ?? null)
const overallStatus = computed<RegionFidelityStatus>(() => worstResult.value?.status ?? 'mismatch')
const canApply = computed(() => Boolean(props.candidateSection && results.value.length === VIEWPORTS.length && !measuring.value))

watch(() => props.open, async (open) => {
  if (!open) {
    runToken += 1
    return
  }
  selectedViewport.value = 'desktop'
  evidenceMode.value = 'side-by-side'
  results.value = []
  aiReview.value = null
  measureError.value = ''
  await nextTick()
})

function setFrame(name: ViewportName, kind: 'reference' | 'candidate', value: Element | null) {
  const pair = framePairs.get(name) ?? {}
  if (value instanceof HTMLIFrameElement)
    pair[kind] = value
  else
    delete pair[kind]
  framePairs.set(name, pair)
}

function safeHtml(value: string): string {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, '')
    .replace(/javascript:/gi, '')
}

function frameDocument(html: string, css = ''): string {
  const safeCss = String(css || '').replace(/<\/style/gi, '<\\/style').replace(/javascript:/gi, '')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"><\/script><style>${safeCss}\n*,*::before,*::after{animation:none!important;transition:none!important}html,body{margin:0;min-height:100%;background:#fff;color:#111}</style></head><body>${safeHtml(html)}</body></html>`
}

function referenceSrcdoc(): string {
  return frameDocument(props.originalHtml, props.originalCss)
}

function candidateSrcdoc(): string {
  return frameDocument(
    String(props.candidateSection?._generated_html || props.candidateSection?.content_html || ''),
    [props.candidateSection?._generated_css, props.candidateSection?._tailwind_leftover_css].filter(Boolean).join('\n'),
  )
}

async function waitForFrame(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument
  if (!doc)
    throw new Error('Comparison frame is unavailable')
  await doc.fonts?.ready
  await Promise.all(Array.from(doc.images).map(image => image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      })))
  await new Promise(resolve => setTimeout(resolve, 150))
}

async function captureFrame(frame: HTMLIFrameElement, width: number, height: number): Promise<string> {
  await waitForFrame(frame)
  const body = frame.contentDocument?.body
  if (!body)
    throw new Error('Comparison body is unavailable')
  return toPng(body, {
    backgroundColor: '#ffffff',
    cacheBust: true,
    pixelRatio: 1,
    width,
    height,
    canvasWidth: width,
    canvasHeight: height,
    style: { margin: '0', width: `${width}px`, height: `${height}px`, overflow: 'hidden' },
  })
}

async function dataUrlImageData(dataUrl: string, width: number, height: number): Promise<ImageData> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('Canvas comparison is unavailable')
  context.drawImage(image, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
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
    if (delta > threshold) {
      diff.data.set([239, 68, 68, 230], index)
    }
    else {
      const gray = Math.round((reference.data[index] + reference.data[index + 1] + reference.data[index + 2]) / 3)
      diff.data.set([gray, gray, gray, 65], index)
    }
  }
  context.putImageData(diff, 0, 0)
  return canvas.toDataURL('image/png')
}

async function measure() {
  const token = ++runToken
  measuring.value = true
  measureError.value = ''
  results.value = []
  aiReview.value = null
  try {
    const measured: ViewportResult[] = []
    for (const viewport of VIEWPORTS) {
      const pair = framePairs.get(viewport.name)
      if (!pair?.reference || !pair.candidate)
        throw new Error(`${viewport.name} comparison frames are not ready`)
      const [reference, candidate] = await Promise.all([
        captureFrame(pair.reference, viewport.width, viewport.height),
        captureFrame(pair.candidate, viewport.width, viewport.height),
      ])
      if (token !== runToken)
        return
      const [referencePixels, candidatePixels] = await Promise.all([
        dataUrlImageData(reference, viewport.width, viewport.height),
        dataUrlImageData(candidate, viewport.width, viewport.height),
      ])
      const comparison = compareRegionPixels(referencePixels.data, candidatePixels.data)
      measured.push({
        ...viewport,
        mismatchRatio: comparison.mismatchRatio,
        status: comparison.status,
        reference,
        candidate,
        diff: createDiff(referencePixels, candidatePixels),
      })
    }
    if (token === runToken)
      results.value = measured
  }
  catch (error: any) {
    if (token === runToken)
      measureError.value = error?.message || 'Unable to compare this region'
  }
  finally {
    if (token === runToken)
      measuring.value = false
  }
}

async function requestAiReview() {
  const evidence = worstResult.value
  if (!evidence || !props.oemId)
    return
  aiReviewing.value = true
  try {
    aiReview.value = await scoreRegionQuality(props.oemId, evidence.reference, evidence.candidate)
  }
  catch (error: any) {
    toast.error(error?.message || 'AI visual review failed')
  }
  finally {
    aiReviewing.value = false
  }
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function statusLabel(status: RegionFidelityStatus): string {
  if (status === 'pixel-perfect')
    return 'Pixel stable'
  if (status === 'review')
    return 'Review'
  return 'Mismatch'
}

function applyCandidate() {
  if (props.candidateSection)
    emit('apply', props.candidateSection)
}
</script>

<template>
  <UiDialog :open="open" @update:open="emit('update:open', $event)">
    <UiDialogContent class="max-h-[92vh] overflow-y-auto sm:max-w-[1100px]">
      <UiDialogHeader>
        <UiDialogTitle class="flex items-center gap-2">
          <ScanSearch class="size-5" /> Match OEM
        </UiDialogTitle>
        <UiDialogDescription>
          Compare the captured OEM region with its editable Tailwind conversion before adding it to the draft.
        </UiDialogDescription>
      </UiDialogHeader>

      <div class="flex flex-wrap items-center gap-2">
        <UiButton :disabled="measuring" @click="measure">
          <Loader2 v-if="measuring" class="mr-2 size-4 animate-spin" />
          <Eye v-else class="mr-2 size-4" />
          {{ results.length ? 'Measure again' : 'Measure all viewports' }}
        </UiButton>
        <UiBadge v-if="results.length" :variant="overallStatus === 'pixel-perfect' ? 'default' : overallStatus === 'review' ? 'secondary' : 'destructive'">
          {{ statusLabel(overallStatus) }} · worst {{ percent(worstResult?.mismatchRatio || 0) }}
        </UiBadge>
        <span class="text-xs text-muted-foreground">Pass ≤1% · review ≤3% · mismatch &gt;3%</span>
      </div>

      <div v-if="measureError" class="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertTriangle class="mr-1 inline size-4" /> {{ measureError }}
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
              </figcaption>
              <img :src="selectedResult.reference" alt="OEM reference region capture" class="h-auto w-full object-contain">
            </figure>
            <figure>
              <figcaption class="border-b px-3 py-2 text-xs font-semibold">
                Dashboard conversion
              </figcaption>
              <img :src="selectedResult.candidate" alt="Dashboard converted region capture" class="h-auto w-full object-contain">
            </figure>
          </div>
          <div v-else-if="evidenceMode === 'overlay'" class="space-y-2 p-3">
            <div class="relative overflow-hidden rounded border bg-white">
              <img :src="selectedResult.reference" alt="OEM reference beneath comparison overlay" class="h-auto w-full">
              <img :src="selectedResult.candidate" alt="Dashboard conversion overlay" class="absolute inset-0 h-auto w-full" :style="{ opacity: overlayOpacity / 100 }">
            </div>
            <label class="flex items-center gap-3 text-xs"><span>Candidate opacity</span><input v-model.number="overlayOpacity" type="range" min="0" max="100" class="flex-1"><span>{{ overlayOpacity }}%</span></label>
          </div>
          <figure v-else>
            <figcaption class="border-b px-3 py-2 text-xs font-semibold">
              Pixel diff · red pixels exceed the channel threshold
            </figcaption>
            <img :src="selectedResult.diff" alt="Pixel difference evidence" class="h-auto w-full object-contain">
          </figure>
        </div>

        <div class="rounded-lg border p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="font-medium">
                AI visual review
              </p>
              <p class="text-xs text-muted-foreground">
                Uses the worst viewport and cannot change the draft automatically.
              </p>
            </div>
            <UiButton variant="outline" :disabled="aiReviewing" @click="requestAiReview">
              <Loader2 v-if="aiReviewing" class="mr-2 size-4 animate-spin" />
              <Sparkles v-else class="mr-2 size-4" />
              Review differences
            </UiButton>
          </div>
          <div v-if="aiReview" class="mt-3 space-y-2 text-sm">
            <p><strong>{{ aiReview.score }}/100</strong> · {{ aiReview.feedback }}</p>
            <ul v-if="aiReview.suggestions.length" class="list-disc space-y-1 pl-5 text-muted-foreground">
              <li v-for="suggestion in aiReview.suggestions" :key="suggestion">
                {{ suggestion }}
              </li>
            </ul>
          </div>
        </div>
      </template>

      <div class="pointer-events-none fixed left-[-100000px] top-0 opacity-0" aria-hidden="true">
        <template v-for="viewport in VIEWPORTS" :key="viewport.name">
          <iframe :ref="value => setFrame(viewport.name, 'reference', value as Element | null)" title="Hidden OEM fidelity reference" sandbox="allow-scripts allow-same-origin" :srcdoc="referenceSrcdoc()" :style="{ width: `${viewport.width}px`, height: `${viewport.height}px` }" />
          <iframe :ref="value => setFrame(viewport.name, 'candidate', value as Element | null)" title="Hidden dashboard fidelity candidate" sandbox="allow-scripts allow-same-origin" :srcdoc="candidateSrcdoc()" :style="{ width: `${viewport.width}px`, height: `${viewport.height}px` }" />
        </template>
      </div>

      <UiDialogFooter>
        <UiButton variant="outline" @click="emit('update:open', false)">
          Cancel
        </UiButton>
        <UiButton :disabled="!canApply" @click="applyCandidate">
          <CheckCircle2 class="mr-2 size-4" /> Add conversion to draft
        </UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>
