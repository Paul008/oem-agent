<script lang="ts" setup>
import { ref, watch, nextTick } from 'vue'
import { X, Loader2, MousePointer2, Check } from 'lucide-vue-next'

const props = defineProps<{
  workerBase: string
}>()

const emit = defineEmits<{
  close: []
  capture: [html: string]
}>()

const url = ref('')
const loading = ref(false)
const error = ref('')
const iframeRef = ref<HTMLIFrameElement | null>(null)
const captured = ref<string[]>([])

async function loadPage() {
  if (!url.value) return
  loading.value = true
  error.value = ''
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

    // Write HTML into iframe with injected selection script
    const doc = iframe.contentDocument
    if (!doc) return
    doc.open()
    doc.write(html)
    doc.write(`
      <style>
        [data-capture-hover] {
          outline: 3px solid #3b82f6 !important;
          outline-offset: -3px;
          cursor: pointer !important;
          position: relative;
        }
        [data-capture-hover]::after {
          content: 'Click to capture';
          position: absolute;
          top: 0;
          left: 0;
          background: #3b82f6;
          color: white;
          font-size: 11px;
          padding: 2px 8px;
          z-index: 999999;
          pointer-events: none;
          font-family: system-ui, sans-serif;
        }
        [data-capture-selected] {
          outline: 3px solid #22c55e !important;
          outline-offset: -3px;
        }
      </style>
      <script>
        (function() {
          // Elements to ignore
          var ignore = new Set(['HTML','BODY','HEAD','SCRIPT','STYLE','LINK','META','NOSCRIPT']);
          // Minimum depth - avoid selecting tiny elements
          var minSize = 50;
          var hovered = null;

          document.addEventListener('mouseover', function(e) {
            var el = e.target;
            // Walk up to find a meaningful container
            while (el && el !== document.body) {
              if (!ignore.has(el.tagName) && el.offsetHeight >= minSize && el.offsetWidth >= minSize) break;
              el = el.parentElement;
            }
            if (!el || el === document.body || ignore.has(el.tagName)) return;
            if (hovered && hovered !== el) hovered.removeAttribute('data-capture-hover');
            el.setAttribute('data-capture-hover', '');
            hovered = el;
          }, true);

          document.addEventListener('mouseout', function(e) {
            if (hovered) {
              hovered.removeAttribute('data-capture-hover');
              hovered = null;
            }
          }, true);

          document.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            var el = hovered;
            if (!el) return;
            el.removeAttribute('data-capture-hover');
            el.setAttribute('data-capture-selected', '');
            // Clone and clean
            var clone = el.cloneNode(true);
            clone.removeAttribute('data-capture-hover');
            clone.removeAttribute('data-capture-selected');
            window.parent.postMessage({
              type: 'section-capture',
              html: clone.outerHTML
            }, '*');
          }, true);

          // Disable all links
          document.addEventListener('click', function(e) {
            if (e.target.closest('a')) {
              e.preventDefault();
              e.stopPropagation();
            }
          }, true);
        })();
      <\/script>
    `)
    doc.close()
  } catch (e: any) {
    error.value = e.message || 'Failed to load page'
  } finally {
    loading.value = false
  }
}

// Listen for capture messages from iframe
if (typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'section-capture' && e.data.html) {
      captured.value.push(e.data.html)
      emit('capture', e.data.html)
    }
  })
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex flex-col bg-background">
      <!-- Header -->
      <div class="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <button
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
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
        <div v-if="captured.length" class="flex items-center gap-1.5 text-sm text-green-600">
          <Check class="size-4" />
          {{ captured.length }} captured
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="px-4 py-2 bg-destructive/10 text-destructive text-sm border-b">
        {{ error }}
      </div>

      <!-- Instructions -->
      <div v-if="!loading && !iframeRef?.contentDocument?.body?.innerHTML" class="flex-1 flex items-center justify-center text-muted-foreground">
        <div class="text-center space-y-2">
          <MousePointer2 class="size-10 mx-auto opacity-40" />
          <p class="text-sm font-medium">Enter a URL and click Load Page</p>
          <p class="text-xs">Hover over sections to highlight them, click to capture</p>
        </div>
      </div>

      <!-- Iframe -->
      <iframe
        ref="iframeRef"
        class="flex-1 w-full border-0"
        :class="{ 'hidden': !iframeRef?.contentDocument?.body?.innerHTML && !loading }"
        sandbox="allow-same-origin allow-scripts"
      />
    </div>
  </Teleport>
</template>
