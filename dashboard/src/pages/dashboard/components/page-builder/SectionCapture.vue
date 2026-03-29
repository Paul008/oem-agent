<script lang="ts" setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { X, Loader2, MousePointer2, Check } from 'lucide-vue-next'
import { buildCaptureInjection } from '@/composables/use-capture-injection'

const props = defineProps<{
  workerBase: string
  oemId?: string
  modelSlug?: string
}>()

const emit = defineEmits<{
  close: []
  capture: [html: string]
  smartCapture: [section: { type: string; data: Record<string, any> }]
}>()

const url = ref('')
const loading = ref(false)
const analyzing = ref(false)
const error = ref('')
const iframeRef = ref<HTMLIFrameElement | null>(null)
const pageLoaded = ref(false)
const captured = ref<string[]>([])

async function loadPage() {
  if (!url.value) return
  loading.value = true
  error.value = ''
  pageLoaded.value = false
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

    // Use srcdoc for reliable script execution in sandboxed iframe
    iframe.srcdoc = html + buildCaptureInjection()
    pageLoaded.value = true
  } catch (e: any) {
    error.value = e.message || 'Failed to load page'
  } finally {
    loading.value = false
  }
}

// postMessage listener — sends to AI for smart extraction
async function onMessage(e: MessageEvent) {
  if (e.data?.type !== 'section-capture' || !e.data.html) return

  const html = e.data.html as string
  captured.value.push(html)

  // Try smart capture via AI
  analyzing.value = true
  try {
    const resp = await fetch(`${props.workerBase}/api/v1/oem-agent/admin/smart-capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        source_url: url.value,
        oem_id: props.oemId,
        model_slug: props.modelSlug,
      }),
    })
    if (resp.ok) {
      const result: any = await resp.json()
      emit('smartCapture', { type: result.type, data: result.data })
    } else {
      // Fallback: emit raw HTML
      emit('capture', html)
    }
  } catch {
    // Fallback: emit raw HTML
    emit('capture', html)
  } finally {
    analyzing.value = false
  }
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
        <div v-if="analyzing" class="flex items-center gap-1.5 text-sm text-blue-600">
          <Loader2 class="size-4 animate-spin" />
          AI analyzing section...
        </div>
        <div v-else-if="captured.length" class="flex items-center gap-1.5 text-sm text-green-600">
          <Check class="size-4" />
          {{ captured.length }} captured
        </div>
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
          <p class="text-xs">Hover over sections to highlight them, click to capture. Styles are inlined automatically so sections look correct when inserted.</p>
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
