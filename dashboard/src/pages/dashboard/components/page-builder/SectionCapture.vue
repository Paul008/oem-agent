<script lang="ts" setup>
import { ref, nextTick, onMounted, onUnmounted, computed } from 'vue'
import { X, Loader2, MousePointer2, Check, Trash2, Zap } from 'lucide-vue-next'
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
const iframeRef = ref<HTMLIFrameElement | null>(null)
const pageLoaded = ref(false)
const completed = ref(0)

// Queue mode: collect sections, then process
interface QueueItem {
  id: string
  html: string
  imageUrls: string[]
  rootStyles: Record<string, string>
  tag: string
  classes: string
  width: number
  height: number
  childCount: number
  label: string
}

const queue = ref<QueueItem[]>([])
const hasQueue = computed(() => queue.value.length > 0)

async function loadPage() {
  if (!url.value) return
  loading.value = true
  error.value = ''
  pageLoaded.value = false
  queue.value = []
  completed.value = 0
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

// Build a short label from class names
function makeLabel(classes: string, tag: string, childCount: number): string {
  const cls = (classes || '').split(/\s+/).find(c => c && !c.startsWith('d-') && !c.startsWith('test-'))
  const base = cls || tag
  if (childCount > 1) return `${base} (${childCount} items)`
  return base
}

// postMessage listener — adds to queue instead of processing immediately
function onMessage(e: MessageEvent) {
  if (e.data?.type !== 'section-capture' || !e.data.html) return

  const item: QueueItem = {
    id: `q${Date.now().toString(36)}`,
    html: e.data.html,
    imageUrls: e.data.imageUrls || [],
    rootStyles: e.data.rootStyles || {},
    tag: e.data.tag || 'div',
    classes: e.data.classes || '',
    width: e.data.width || 0,
    height: e.data.height || 0,
    childCount: e.data.childCount || 0,
    label: makeLabel(e.data.classes || '', e.data.tag || 'div', e.data.childCount || 0),
  }

  queue.value.push(item)
}

function removeFromQueue(id: string) {
  queue.value = queue.value.filter(q => q.id !== id)
}

function clearQueue() {
  queue.value = []
}

// Process all queued sections
async function captureAll() {
  if (!queue.value.length) return

  analyzing.value = true
  analyzeProgress.value = 0
  const total = queue.value.length
  const pageUrl = url.value

  for (let i = 0; i < queue.value.length; i++) {
    const item = queue.value[i]
    analyzeStatus.value = `Processing ${i + 1}/${total}: ${item.label}`
    analyzeProgress.value = ((i) / total) * 100

    try {
      const resp = await fetch(`${props.workerBase}/api/v1/oem-agent/admin/smart-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: item.html,
          source_url: pageUrl,
          oem_id: props.oemId,
          model_slug: props.modelSlug,
          image_urls: item.imageUrls,
          root_styles: item.rootStyles,
        }),
      })
      if (resp.ok) {
        const result: any = await resp.json()
        emit('smartCapture', { type: result.type, data: result.data })
        completed.value++
      } else {
        emit('capture', item.html)
        completed.value++
      }
    } catch {
      emit('capture', item.html)
      completed.value++
    }
  }

  analyzeProgress.value = 100
  analyzeStatus.value = `Done — ${completed.value} sections captured`
  queue.value = []

  setTimeout(() => {
    analyzing.value = false
    analyzeStatus.value = ''
    analyzeProgress.value = 0
  }, 2000)
}

onMounted(() => {
  window.addEventListener('message', onMessage)
})

onUnmounted(() => {
  window.removeEventListener('message', onMessage)
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex flex-col bg-background">
      <!-- Header -->
      <div class="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <button
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          title="Close"
          @click="emit('close')"
        >
          <X class="size-4" />
        </button>
        <div class="flex-1 flex items-center gap-2">
          <input
            v-model="url"
            type="url"
            placeholder="Paste OEM page URL to capture sections from..."
            class="flex-1 h-9 px-3 text-sm bg-muted rounded-md border-0 outline-none focus:ring-2 ring-primary"
            @keydown.enter="loadPage"
          />
          <button
            class="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            :disabled="!url || loading"
            @click="loadPage"
          >
            <Loader2 v-if="loading" class="size-4 animate-spin" />
            Load Page
          </button>
        </div>
      </div>

      <!-- Queue bar -->
      <div v-if="pageLoaded" class="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 shrink-0">
        <!-- Queue items -->
        <div class="flex-1 flex items-center gap-2 min-w-0">
          <template v-if="analyzing">
            <Loader2 class="size-4 animate-spin text-blue-600 shrink-0" />
            <span class="text-sm text-blue-600 truncate">{{ analyzeStatus }}</span>
          </template>
          <template v-else-if="!hasQueue && completed === 0">
            <MousePointer2 class="size-4 text-muted-foreground shrink-0" />
            <span class="text-sm text-muted-foreground">Click sections to add to capture queue. Scroll to resize selection.</span>
          </template>
          <template v-else-if="!hasQueue && completed > 0">
            <Check class="size-4 text-green-600 shrink-0" />
            <span class="text-sm text-green-600">{{ completed }} sections captured</span>
          </template>
          <template v-else>
            <div class="flex items-center gap-1.5 flex-wrap">
              <div
                v-for="item in queue"
                :key="item.id"
                class="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded-full"
              >
                <span class="truncate max-w-[140px]">{{ item.label }}</span>
                <button class="hover:text-destructive" @click="removeFromQueue(item.id)">
                  <X class="size-3" />
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Action buttons -->
        <div v-if="hasQueue && !analyzing" class="flex items-center gap-2 shrink-0">
          <button
            class="h-8 px-3 text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
            @click="clearQueue"
          >
            <Trash2 class="size-3.5" />
            Clear
          </button>
          <button
            class="h-8 px-4 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            @click="captureAll"
          >
            <Zap class="size-4" />
            Capture {{ queue.length }} section{{ queue.length > 1 ? 's' : '' }}
          </button>
        </div>
      </div>

      <!-- Progress bar -->
      <div v-if="analyzing && analyzeProgress > 0" class="h-1 bg-muted shrink-0">
        <div class="h-full bg-blue-600 transition-all duration-300" :style="{ width: analyzeProgress + '%' }" />
      </div>

      <!-- Error -->
      <div v-if="error" class="px-4 py-2 bg-destructive/10 text-destructive text-sm border-b">
        {{ error }}
      </div>

      <!-- Instructions (before page loaded) -->
      <div v-if="!loading && !pageLoaded" class="flex-1 flex items-center justify-center text-muted-foreground">
        <div class="text-center space-y-2 max-w-sm">
          <MousePointer2 class="size-10 mx-auto opacity-40" />
          <p class="text-sm font-medium">Enter a URL and click Load Page</p>
          <p class="text-xs">Click sections to add them to a capture queue. Scroll to resize the selection. Press <strong>Capture</strong> when ready — AI converts each section to your page builder format.</p>
        </div>
      </div>

      <!-- Iframe -->
      <iframe
        ref="iframeRef"
        class="flex-1 w-full border-0"
        :class="{ 'hidden': !pageLoaded && !loading }"
        sandbox="allow-same-origin allow-scripts"
      />
    </div>
  </Teleport>
</template>
