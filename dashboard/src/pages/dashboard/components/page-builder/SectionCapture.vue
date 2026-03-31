<script lang="ts" setup>
import { ref, nextTick, onMounted, onUnmounted, computed } from 'vue'
import { X, Loader2, MousePointer2, Check, Trash2, Zap, Camera, Crop } from 'lucide-vue-next'
import { buildCaptureInjection } from '@/composables/use-capture-injection'

const props = defineProps<{
  workerBase: string
  oemId?: string
  modelSlug?: string
  defaultUrl?: string
}>()

const emit = defineEmits<{
  close: []
  capture: [html: string]
  smartCapture: [section: { type: string; data: Record<string, any> }]
}>()

const url = ref(props.defaultUrl || '')
const loading = ref(false)
const analyzing = ref(false)
const analyzeStatus = ref('')
const analyzeProgress = ref(0)
const error = ref('')
const completed = ref(0)

// Screenshot mode
const screenshotUrl = ref('')
const screenshotWidth = ref(0)
const screenshotHeight = ref(0)
const imgRef = ref<HTMLImageElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const sectionMap = ref<Array<{ tag: string; classes: string; top: number; height: number; html: string }>>([])

// Region selection on screenshot
const selecting = ref(false)
const selectionStart = ref({ x: 0, y: 0 })
const selectionEnd = ref({ x: 0, y: 0 })
const hasSelection = ref(false)

// Queue
interface QueueItem {
  id: string
  screenshot_base64?: string
  html?: string
  styledHtml?: string
  imageUrls: string[]
  rootStyles: Record<string, string>
  label: string
  thumbUrl?: string
  forcedType?: string
}
const queue = ref<QueueItem[]>([])
const hasQueue = computed(() => queue.value.length > 0)

// Iframe fallback
const iframeRef = ref<HTMLIFrameElement | null>(null)
const pageLoaded = ref(false)
const useScreenshot = ref(false) // default to iframe mode (deterministic parser needs HTML)

async function loadPage() {
  if (!url.value) return
  loading.value = true
  error.value = ''
  screenshotUrl.value = ''
  pageLoaded.value = false
  queue.value = []
  completed.value = 0
  hasSelection.value = false

  if (useScreenshot.value) {
    await loadScreenshot()
  } else {
    await loadIframe()
  }
}

async function loadScreenshot() {
  try {
    const resp = await fetch(`${props.workerBase}/api/v1/oem-agent/admin/capture-screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.value }),
    })
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ error: 'Screenshot failed' }))
      throw new Error(body.error || `HTTP ${resp.status}`)
    }
    const data = await resp.json() as any
    screenshotUrl.value = `${props.workerBase}${data.screenshot_url}`
    screenshotWidth.value = data.width
    screenshotHeight.value = data.height
    sectionMap.value = data.section_map || []
  } catch (e: any) {
    error.value = e.message || 'Failed to capture screenshot'
  } finally {
    loading.value = false
  }
}

async function loadIframe() {
  try {
    const proxyUrl = `${props.workerBase}/api/v1/oem-agent/admin/proxy-html?url=${encodeURIComponent(url.value)}`
    const resp = await fetch(proxyUrl)
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ error: 'Failed to fetch page' }))
      throw new Error(body.error || `HTTP ${resp.status}`)
    }
    const html = await resp.text()
    await nextTick()
    const iframe = iframeRef.value
    if (!iframe) return
    const { earlyStub, lateInjection } = buildCaptureInjection()
    const patchedHtml = html.replace(/<head([^>]*)>/i, `<head$1>${earlyStub}`)
    iframe.srcdoc = patchedHtml + lateInjection
    pageLoaded.value = true
  } catch (e: any) {
    error.value = e.message || 'Failed to load page'
  } finally {
    loading.value = false
  }
}

// Screenshot region selection — use offset relative to image top-left including scroll
function getScaledCoords(e: MouseEvent) {
  const img = imgRef.value
  const container = containerRef.value
  if (!img || !container) return { x: 0, y: 0 }
  const imgRect = img.getBoundingClientRect()
  const scaleX = img.naturalWidth / imgRect.width
  const scaleY = img.naturalHeight / imgRect.height
  return {
    x: Math.max(0, (e.clientX - imgRect.left) * scaleX),
    y: Math.max(0, (e.clientY - imgRect.top) * scaleY),
  }
}

function onMouseDown(e: MouseEvent) {
  if (!screenshotUrl.value) return
  selecting.value = true
  hasSelection.value = false
  const coords = getScaledCoords(e)
  selectionStart.value = coords
  selectionEnd.value = coords
}

function onMouseMove(e: MouseEvent) {
  if (!selecting.value) return
  selectionEnd.value = getScaledCoords(e)
  hasSelection.value = true
}

function onMouseUp() {
  if (!selecting.value) return
  selecting.value = false
  // Minimum size check
  const w = Math.abs(selectionEnd.value.x - selectionStart.value.x)
  const h = Math.abs(selectionEnd.value.y - selectionStart.value.y)
  if (w < 20 || h < 20) {
    hasSelection.value = false
  }
}

// Selection rect is positioned relative to the image (which is the first child of the container)
const selectionStyle = computed(() => {
  if (!hasSelection.value || !imgRef.value) return { display: 'none' }
  const img = imgRef.value
  const scaleX = img.clientWidth / img.naturalWidth
  const scaleY = img.clientHeight / img.naturalHeight

  const x1 = Math.min(selectionStart.value.x, selectionEnd.value.x) * scaleX
  const y1 = Math.min(selectionStart.value.y, selectionEnd.value.y) * scaleY
  const w = Math.abs(selectionEnd.value.x - selectionStart.value.x) * scaleX
  const h = Math.abs(selectionEnd.value.y - selectionStart.value.y) * scaleY

  return {
    left: `${x1}px`,
    top: `${y1}px`,
    width: `${w}px`,
    height: `${h}px`,
  }
})

// Crop the selection from the screenshot and add to queue
async function addSelectionToQueue() {
  if (!hasSelection.value || !imgRef.value) return

  const img = imgRef.value
  const x = Math.min(selectionStart.value.x, selectionEnd.value.x)
  const y = Math.min(selectionStart.value.y, selectionEnd.value.y)
  const w = Math.abs(selectionEnd.value.x - selectionStart.value.x)
  const h = Math.abs(selectionEnd.value.y - selectionStart.value.y)

  // Map the drawn region to a section from the section_map
  // Y coordinates are in the original screenshot/page space
  const selTop = y
  const selBottom = y + h

  // Find the section with the most overlap
  let bestMatch: typeof sectionMap.value[0] | null = null
  let bestOverlap = 0

  for (const sec of sectionMap.value) {
    const secTop = sec.top
    const secBottom = sec.top + sec.height
    const overlapTop = Math.max(selTop, secTop)
    const overlapBottom = Math.min(selBottom, secBottom)
    const overlap = Math.max(0, overlapBottom - overlapTop)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      bestMatch = sec
    }
  }

  if (bestMatch && bestMatch.html) {
    // Found matching HTML section — use the parser
    const cls = (bestMatch.classes || '').split(/\s+/).find(c => c && c.length > 3) || bestMatch.tag
    completed.value = 0
    queue.value.push({
      id: `q${Date.now().toString(36)}`,
      html: bestMatch.html,
      imageUrls: [],
      rootStyles: {},
      label: cls,
    })
    hasSelection.value = false
  } else {
    // No matching section — try canvas crop as fallback
    try {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h)
      const thumbUrl = canvas.toDataURL('image/jpeg', 0.3)

      error.value = 'No matching section found at this position. Try drawing closer to the section center.'
      hasSelection.value = false
    } catch {
      error.value = 'Could not map selection to a page section.'
      hasSelection.value = false
    }
  }
}

// Context menu state
const contextMenu = ref<{ show: boolean; x: number; y: number; data: any }>({
  show: false, x: 0, y: 0, data: null,
})

const SECTION_TYPE_OPTIONS = [
  { value: '_raw_html', label: 'HTML → Tailwind', divider: true },
  { value: 'content-block', label: 'Content Block' },
  { value: 'feature-cards', label: 'Feature Cards' },
  { value: 'hero', label: 'Hero' },
  { value: 'intro', label: 'Intro' },
  { value: 'image', label: 'Image' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'heading', label: 'Heading' },
  { value: 'testimonial', label: 'Testimonial' },
  { value: 'stats', label: 'Stats' },
  { value: 'cta-banner', label: 'CTA Banner' },
]

function addToQueue(data: any, forcedType?: string) {
  completed.value = 0 // reset for next batch
  const cls = (data.classes || '').split(/\s+/).find((c: string) => c && !c.startsWith('d-') && !c.startsWith('test-')) || data.tag || 'section'
  queue.value.push({
    id: `q${Date.now().toString(36)}`,
    html: data.html,
    styledHtml: data.styledHtml || undefined,
    imageUrls: data.imageUrls || [],
    rootStyles: data.rootStyles || {},
    label: forcedType === '_raw_html' ? 'HTML → Tailwind' : (forcedType || cls),
    forcedType,
  })
}

function onContextMenuSelect(type: string) {
  if (!contextMenu.value.data) { contextMenu.value.show = false; return }

  if (type === '_raw_html') {
    // Add styled HTML to queue — will create content-block with _generated_html when captured
    const twHtml = contextMenu.value.data.styledHtml || contextMenu.value.data.html || ''
    completed.value = 0
    queue.value.push({
      id: `q${Date.now().toString(36)}`,
      html: twHtml,
      imageUrls: contextMenu.value.data.imageUrls || [],
      rootStyles: {},
      label: 'HTML clone',
      forcedType: '_raw_html',
    })
    contextMenu.value.show = false
    return
  }

  addToQueue(contextMenu.value.data, type)
  contextMenu.value.show = false
}

function closeContextMenu() {
  contextMenu.value.show = false
}

// Iframe message handler
function onMessage(e: MessageEvent) {
  if (!e.data?.html) return

  if (e.data.type === 'section-capture') {
    // Left-click: auto-detect type
    addToQueue(e.data)
  } else if (e.data.type === 'section-capture-menu') {
    // Right-click: show context menu for type selection
    contextMenu.value = {
      show: true,
      x: e.data.clientX || 200,
      y: e.data.clientY || 200,
      data: e.data,
    }
  }
}

function removeFromQueue(id: string) {
  queue.value = queue.value.filter(q => q.id !== id)
}

function clearQueue() {
  queue.value = []
}

async function captureAll() {
  if (!queue.value.length) return
  analyzing.value = true
  analyzeProgress.value = 0
  const total = queue.value.length

  for (let i = 0; i < queue.value.length; i++) {
    const item = queue.value[i]
    analyzeStatus.value = `Processing ${i + 1}/${total}: ${item.label}`
    analyzeProgress.value = ((i) / total) * 100

    try {
      // HTML clone: create content-block directly, no API call needed
      if (item.forcedType === '_raw_html') {
        emit('smartCapture', {
          type: 'content-block',
          data: { title: '', content_html: '', _generated_html: item.html, animation: 'fade-in' },
        })
        completed.value++
        continue
      }

      const resp = await fetch(`${props.workerBase}/api/v1/oem-agent/admin/smart-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: item.html || undefined,
          screenshot_base64: item.screenshot_base64 || undefined,
          source_url: url.value,
          oem_id: props.oemId,
          model_slug: props.modelSlug,
          image_urls: item.imageUrls,
          root_styles: item.rootStyles,
          forced_type: item.forcedType || undefined,
        }),
      })
      if (resp.ok) {
        const result: any = await resp.json()
        emit('smartCapture', { type: result.type, data: result.data })
        completed.value++
      } else {
        const errBody = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
        const rawHint = errBody.raw ? ` — AI said: "${errBody.raw.slice(0, 150)}..."` : ''
        error.value = `Capture failed: ${errBody.error || resp.statusText}${rawHint}`
        if (item.html) emit('capture', item.html)
        completed.value++
      }
    } catch (e: any) {
      error.value = `Capture error: ${e.message}`
      if (item.html) emit('capture', item.html)
      completed.value++
    }
  }

  analyzeProgress.value = 100
  analyzeStatus.value = `Done — ${completed.value} sections captured`
  queue.value = []
  // Keep iframe loaded — user can continue selecting more sections
  setTimeout(() => { analyzing.value = false; analyzeStatus.value = ''; analyzeProgress.value = 0 }, 1500)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeContextMenu()
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  window.removeEventListener('message', onMessage)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex flex-col bg-background">
      <!-- Header -->
      <div class="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <button class="p-1.5 rounded-md hover:bg-muted text-muted-foreground" title="Close" @click="emit('close')">
          <X class="size-4" />
        </button>
        <div class="flex-1 flex items-center gap-2">
          <input
            v-model="url"
            type="url"
            placeholder="Paste OEM page URL..."
            class="flex-1 h-9 px-3 text-sm bg-muted rounded-md border-0 outline-none focus:ring-2 ring-primary"
            @keydown.enter="loadPage"
          />
          <!-- Mode toggle -->
          <button
            class="h-9 px-3 text-xs font-medium rounded-md flex items-center gap-1.5 border transition-colors"
            :class="useScreenshot ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' : 'bg-muted border-transparent text-muted-foreground'"
            title="Toggle between screenshot capture (real browser) and iframe capture"
            @click="useScreenshot = !useScreenshot"
          >
            <Camera class="size-3.5" />
            {{ useScreenshot ? 'Screenshot' : 'Iframe' }}
          </button>
          <button
            class="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            :disabled="!url || loading"
            @click="loadPage"
          >
            <Loader2 v-if="loading" class="size-4 animate-spin" />
            {{ loading ? (useScreenshot ? 'Capturing...' : 'Loading...') : 'Load Page' }}
          </button>
        </div>
      </div>

      <!-- Queue bar -->
      <div v-if="screenshotUrl || pageLoaded" class="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 shrink-0">
        <div class="flex-1 flex items-center gap-2 min-w-0">
          <template v-if="analyzing">
            <Loader2 class="size-4 animate-spin text-blue-600 shrink-0" />
            <span class="text-sm text-blue-600 truncate">{{ analyzeStatus }}</span>
          </template>
          <template v-else-if="!hasQueue && completed === 0">
            <Crop v-if="useScreenshot" class="size-4 text-muted-foreground shrink-0" />
            <MousePointer2 v-else class="size-4 text-muted-foreground shrink-0" />
            <span class="text-sm text-muted-foreground">
              {{ useScreenshot ? 'Click and drag to select regions.' : 'Click to auto-detect, right-click to choose section type. Alt+Scroll to resize.' }}
            </span>
          </template>
          <template v-else-if="!hasQueue && completed > 0">
            <Check class="size-4 text-green-600 shrink-0" />
            <span class="text-sm text-green-600">{{ completed }} captured — select more or close</span>
          </template>
          <template v-else>
            <div class="flex items-center gap-1.5 flex-wrap">
              <div
                v-for="item in queue"
                :key="item.id"
                class="flex items-center gap-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded-full"
              >
                <img v-if="item.thumbUrl" :src="item.thumbUrl" class="w-6 h-4 object-cover rounded" />
                <span class="truncate max-w-[120px]">{{ item.label }}</span>
                <button class="hover:text-destructive" @click="removeFromQueue(item.id)"><X class="size-3" /></button>
              </div>
            </div>
          </template>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <!-- Add selection button (screenshot mode) -->
          <button
            v-if="useScreenshot && hasSelection && !analyzing"
            class="h-8 px-3 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-1.5"
            @click="addSelectionToQueue"
          >
            <Check class="size-3.5" />
            Add Selection
          </button>
          <button
            v-if="hasQueue && !analyzing"
            class="h-8 px-3 text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
            @click="clearQueue"
          >
            <Trash2 class="size-3.5" />
          </button>
          <button
            v-if="hasQueue && !analyzing"
            class="h-8 px-4 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            @click="captureAll"
          >
            <Zap class="size-4" />
            Capture {{ queue.length }}
          </button>
        </div>
      </div>

      <!-- Progress bar -->
      <div v-if="analyzing && analyzeProgress > 0" class="h-1 bg-muted shrink-0">
        <div class="h-full bg-blue-600 transition-all duration-300" :style="{ width: analyzeProgress + '%' }" />
      </div>

      <!-- Error -->
      <div v-if="error" class="px-4 py-2 bg-destructive/10 text-destructive text-sm border-b">{{ error }}</div>

      <!-- Empty state -->
      <div v-if="!loading && !screenshotUrl && !pageLoaded" class="flex-1 flex items-center justify-center text-muted-foreground">
        <div class="text-center space-y-3 max-w-md">
          <Camera class="size-12 mx-auto opacity-30" />
          <p class="text-sm font-medium">Enter a URL and click Load Page</p>
          <p class="text-xs leading-relaxed">
            Click sections to add them to a capture queue. The parser instantly extracts text, images, and layout — no AI, no waiting.
            Toggle to <strong>Screenshot</strong> mode for visual reference on complex pages.
          </p>
        </div>
      </div>

      <!-- Screenshot view -->
      <div
        v-if="screenshotUrl"
        ref="containerRef"
        class="flex-1 overflow-auto cursor-crosshair"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
      >
        <div class="relative inline-block w-full">
          <img
            ref="imgRef"
            :src="screenshotUrl"
            crossorigin="anonymous"
            class="w-full block"
            draggable="false"
          />
          <!-- Selection rectangle (positioned relative to image wrapper) -->
          <div
            v-if="hasSelection"
            class="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none z-10"
            :style="selectionStyle"
          />
        </div>
      </div>

      <!-- Iframe view (fallback) -->
      <iframe
        v-if="!useScreenshot"
        ref="iframeRef"
        class="flex-1 w-full border-0"
        :class="{ 'hidden': !pageLoaded && !loading }"
        sandbox="allow-same-origin allow-scripts"
      />

      <!-- Loading overlay -->
      <div v-if="loading" class="flex-1 flex items-center justify-center">
        <div class="text-center space-y-3">
          <Loader2 class="size-8 mx-auto animate-spin text-muted-foreground" />
          <p class="text-sm text-muted-foreground">{{ useScreenshot ? 'Rendering page in browser...' : 'Loading page...' }}</p>
        </div>
      </div>
      <!-- Right-click context menu -->
      <div
        v-if="contextMenu.show"
        class="fixed inset-0 z-[60]"
        @click="closeContextMenu"
      >
        <div
          class="absolute bg-popover border rounded-lg shadow-xl py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
          @click.stop
        >
          <div class="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Import as...</div>
          <template v-for="opt in SECTION_TYPE_OPTIONS" :key="opt.value">
            <div v-if="opt.divider" class="border-b my-1" />
            <button
              class="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              :class="opt.value === '_raw_html' ? 'font-medium' : ''"
              @click="onContextMenuSelect(opt.value)"
            >
              {{ opt.label }}
            </button>
            <div v-if="opt.divider" class="border-b my-1" />
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
