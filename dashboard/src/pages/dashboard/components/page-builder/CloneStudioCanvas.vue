<script lang="ts">
import { getCloneHtml, getCloneStylesheetUrls } from '../../page-builder/page-modes'
import { buildCloneStudioHtml } from './clone-studio-html'

export interface CloneStudioFrameHtmlForCanvasOptions {
  page: any
  title: string
  baseHref: string
  workerBase: string
  selectedRegionId: string | null
  bridgeToken: string
}

/**
 * Scale a fixed device-width clone frame to fit the editor panel. Never upscales past 1:1, so a
 * panel wider than the frame renders it at native size.
 */
export function computeCloneFrameScale(containerWidth: number, frameWidth: number): number {
  if (!containerWidth || !frameWidth || frameWidth <= 0)
    return 1
  return Math.min(1, containerWidth / frameWidth)
}

export function cloneStudioIframeSandbox(allowSameOrigin = false): string {
  return allowSameOrigin ? 'allow-scripts allow-same-origin' : 'allow-scripts'
}

export function buildCloneStudioFrameHtmlForCanvas(options: CloneStudioFrameHtmlForCanvasOptions): string {
  return buildCloneStudioHtml({
    rendered: getCloneHtml(options.page),
    title: options.title,
    baseHref: options.baseHref || options.workerBase || '/',
    mediaBase: options.workerBase,
    stylesheetUrls: getCloneStylesheetUrls(options.page),
    selectedRegionId: null,
    bridgeToken: options.bridgeToken,
  })
}
</script>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  page: any
  title?: string
  baseHref?: string
  workerBase?: string
  selectedRegionId: string | null
  // Viewport width the clone renders at, so OEM responsive CSS (media queries, .onlydesktop, etc.)
  // resolves to the intended device layout instead of the narrow editor panel width. The frame is
  // scaled down to fit the available container.
  frameWidth?: number
  allowSameOriginSandbox?: boolean
  // When true, the desktop frame scales UP to fill the container width (used by the full-screen
  // preview so the clone fills the window instead of sitting left-aligned at native width).
  fitWidth?: boolean
}>(), {
  title: 'Clone Studio',
  baseHref: '',
  workerBase: '',
  frameWidth: 1280,
  allowSameOriginSandbox: false,
  fitWidth: false,
})

const emit = defineEmits<{
  selectRegion: [region: any]
  domUpdated: [html: string]
}>()

const iframe = ref<HTMLIFrameElement | null>(null)
const container = ref<HTMLDivElement | null>(null)
const containerWidth = ref(0)
const containerHeight = ref(0)
let resizeObserver: ResizeObserver | null = null
const bridgeToken = createBridgeToken()

// Scale the desktop-width frame to fit. In the editor we never upscale past 1:1; in fit-width
// (full-screen preview) we scale up so the clone fills the window instead of leaving a gap.
const frameScale = computed(() => {
  if (props.fitWidth && containerWidth.value && props.frameWidth > 0)
    return containerWidth.value / props.frameWidth
  return computeCloneFrameScale(containerWidth.value, props.frameWidth)
})
const sameOriginSandboxEnabled = computed(() =>
  props.allowSameOriginSandbox || import.meta.env.VITE_CLONE_STUDIO_SAME_ORIGIN === 'true',
)
const iframeSandbox = computed(() => cloneStudioIframeSandbox(sameOriginSandboxEnabled.value))

const frameStyle = computed(() => {
  const scale = frameScale.value
  return {
    width: `${props.frameWidth}px`,
    height: containerHeight.value ? `${Math.ceil(containerHeight.value / scale)}px` : '100%',
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
  }
})

function measureContainer() {
  if (!container.value)
    return
  containerWidth.value = container.value.clientWidth
  containerHeight.value = container.value.clientHeight
}

const frameHtml = computed(() => buildCloneStudioFrameHtmlForCanvas({
  page: props.page,
  title: props.title,
  baseHref: props.baseHref,
  workerBase: props.workerBase,
  selectedRegionId: props.selectedRegionId,
  bridgeToken,
}))

function createBridgeToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `clone-studio-${crypto.randomUUID()}`
  }

  return `clone-studio-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function onMessage(event: MessageEvent) {
  const data = event.data
  const source = event.source

  if (!data || typeof data !== 'object')
    return

  if (data.source !== 'clone-studio')
    return

  if (data.bridgeToken !== bridgeToken)
    return

  if (iframe.value?.contentWindow && source !== iframe.value.contentWindow)
    return

  if (data.type === 'clone-studio:select-region' && data.region) {
    emit('selectRegion', data.region)
    return
  }

  if (data.type === 'clone-studio:dom-updated') {
    const html = typeof data.bodyHtml === 'string' ? data.bodyHtml : data.html
    if (typeof html === 'string')
      emit('domUpdated', html)
  }
}

function postToFrame(payload: Record<string, unknown>) {
  iframe.value?.contentWindow?.postMessage(payload, '*')
}

function patchField(payload: Record<string, unknown>) {
  postToFrame({
    type: 'clone-studio:patch-field',
    ...payload,
    bridgeToken,
  })
}

function selectRegionInFrame(regionId: string | null) {
  postToFrame({
    type: 'clone-studio:select',
    regionId,
    bridgeToken,
  })
}

function onFrameLoad() {
  selectRegionInFrame(props.selectedRegionId)
}

watch(
  () => props.selectedRegionId,
  (regionId) => {
    selectRegionInFrame(regionId)
  },
)

onMounted(() => {
  window.addEventListener('message', onMessage)
  measureContainer()
  if (container.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => measureContainer())
    resizeObserver.observe(container.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  resizeObserver?.disconnect()
  resizeObserver = null
})

defineExpose({
  postToFrame,
  patchField,
})
</script>

<template>
  <div ref="container" class="relative h-full min-h-[640px] w-full overflow-hidden bg-white">
    <iframe
      ref="iframe"
      class="border-0 bg-white"
      :style="frameStyle"
      :sandbox="iframeSandbox"
      title="Clone Studio canvas"
      :srcdoc="frameHtml"
      @load="onFrameLoad"
    />
  </div>
</template>
