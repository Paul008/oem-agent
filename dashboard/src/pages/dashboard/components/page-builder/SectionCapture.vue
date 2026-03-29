<script lang="ts" setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
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

    const doc = iframe.contentDocument
    if (!doc) return
    doc.open()
    doc.write(html)
    doc.write(INJECTED_SCRIPT)
    doc.close()
    pageLoaded.value = true
  } catch (e: any) {
    error.value = e.message || 'Failed to load page'
  } finally {
    loading.value = false
  }
}

// Injected script that:
// 1. Highlights sections on hover
// 2. On click, extracts outerHTML WITH inlined computed styles
// 3. Rewrites relative image URLs to absolute
const INJECTED_SCRIPT = `
<style>
  [data-capture-hover] {
    outline: 3px solid #3b82f6 !important;
    outline-offset: -3px;
    cursor: pointer !important;
  }
  [data-capture-hover]::after {
    content: 'Click to capture this section';
    position: fixed;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    background: #3b82f6;
    color: white;
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 6px;
    z-index: 999999;
    pointer-events: none;
    font-family: system-ui, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  [data-capture-selected] {
    outline: 3px solid #22c55e !important;
    outline-offset: -3px;
  }
</style>
<script>
(function() {
  var ignore = new Set(['HTML','BODY','HEAD','SCRIPT','STYLE','LINK','META','NOSCRIPT','BR','HR']);
  var minSize = 40;
  var hovered = null;

  // Walk up to find a meaningful container section
  function findSection(el) {
    while (el && el !== document.body && el !== document.documentElement) {
      if (!ignore.has(el.tagName) && el.offsetHeight >= minSize && el.offsetWidth >= minSize) return el;
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener('mouseover', function(e) {
    var el = findSection(e.target);
    if (!el) return;
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

  // Inline computed styles onto a cloned element tree
  function inlineStyles(source, clone) {
    var computed = window.getComputedStyle(source);
    // Only inline the most important visual properties (not all 300+)
    var props = [
      'display','position','width','max-width','min-width','height','max-height','min-height',
      'margin','padding','border','border-radius','box-sizing','overflow',
      'background','background-color','background-image','background-size','background-position',
      'color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-decoration','text-transform',
      'flex','flex-direction','flex-wrap','align-items','justify-content','gap',
      'grid-template-columns','grid-template-rows','grid-gap',
      'opacity','box-shadow','transform',
      'object-fit','object-position','aspect-ratio',
    ];
    var style = '';
    for (var i = 0; i < props.length; i++) {
      var val = computed.getPropertyValue(props[i]);
      if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px' && val !== 'rgba(0, 0, 0, 0)') {
        style += props[i] + ':' + val + ';';
      }
    }
    clone.setAttribute('style', (clone.getAttribute('style') || '') + style);
    // Recurse children
    var srcChildren = source.children;
    var clnChildren = clone.children;
    for (var j = 0; j < srcChildren.length && j < clnChildren.length; j++) {
      if (srcChildren[j].nodeType === 1) inlineStyles(srcChildren[j], clnChildren[j]);
    }
  }

  // Fix relative URLs to absolute
  function fixUrls(el) {
    var base = document.location.origin;
    el.querySelectorAll('img[src],source[srcset],video[src],video[poster]').forEach(function(node) {
      ['src','srcset','poster'].forEach(function(attr) {
        var v = node.getAttribute(attr);
        if (v && v.startsWith('/') && !v.startsWith('//')) {
          node.setAttribute(attr, base + v);
        }
      });
    });
    // Fix CSS background-image urls
    el.querySelectorAll('*').forEach(function(node) {
      var s = node.getAttribute('style') || '';
      if (s.includes('url(/')) {
        node.setAttribute('style', s.replace(/url\\(\\//g, 'url(' + base + '/'));
      }
    });
  }

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var el = hovered;
    if (!el) return;
    el.removeAttribute('data-capture-hover');
    el.setAttribute('data-capture-selected', '');
    // Clone, inline styles, fix URLs
    var clone = el.cloneNode(true);
    clone.removeAttribute('data-capture-hover');
    clone.removeAttribute('data-capture-selected');
    inlineStyles(el, clone);
    fixUrls(clone);
    // Remove scripts from captured HTML
    clone.querySelectorAll('script').forEach(function(s) { s.remove(); });
    window.parent.postMessage({
      type: 'section-capture',
      html: clone.outerHTML,
      tag: el.tagName.toLowerCase(),
      width: el.offsetWidth,
      height: el.offsetHeight,
    }, '*');
  }, true);

  // Block all link navigation
  document.addEventListener('click', function(e) {
    var a = e.target.closest && e.target.closest('a');
    if (a) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();
<\\/script>
`

// postMessage listener with cleanup
function onMessage(e: MessageEvent) {
  if (e.data?.type === 'section-capture' && e.data.html) {
    captured.value.push(e.data.html)
    emit('capture', e.data.html)
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
        <div v-if="captured.length" class="flex items-center gap-1.5 text-sm text-green-600">
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
