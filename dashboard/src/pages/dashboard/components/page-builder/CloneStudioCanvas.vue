<script lang="ts">
import { getCloneHtml, getCloneRegions, getCloneStylesheetUrls } from '../../page-builder/page-modes'
import { buildCloneStudioHtml } from './clone-studio-html'

export interface CloneStudioFrameHtmlForCanvasOptions {
  page: any
  title: string
  baseHref: string
  workerBase: string
  selectedRegionId: string | null
  bridgeToken: string
  editable?: boolean
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

/**
 * Clamp a region's cropped height from a pointer position. `pointerY`/`regionTop` are in the same
 * coordinate space (the region's top edge); the result is bounded to `[min, naturalHeight]` so a
 * drag can never shrink below `min` or grow past the region's natural (uncropped) height.
 */
export function clampRegionHeight(pointerY: number, regionTop: number, naturalHeight: number, min = 40): number {
  const raw = pointerY - regionTop
  const max = naturalHeight > 0 ? naturalHeight : raw
  return Math.max(min, Math.min(raw, max))
}

export function cloneStudioIframeSandbox(allowSameOrigin = false): string {
  return allowSameOrigin ? 'allow-scripts allow-same-origin' : 'allow-scripts'
}

/**
 * Translate an iframe-relative point into parent-viewport coordinates by scaling the point by the
 * frame scale and offsetting by the iframe's origin (its top-left in the parent viewport).
 */
export function translateFramePoint(p: { x: number; y: number }, originRect: { left: number; top: number }, scale: number): { x: number; y: number } {
  return { x: originRect.left + p.x * scale, y: originRect.top + p.y * scale }
}

export function buildCloneStudioFrameHtmlForCanvas(options: CloneStudioFrameHtmlForCanvasOptions): string {
  // Saved per-region height crops live in section_index (not the rendered HTML), so re-apply them to
  // the iframe on load — otherwise persisted crops would not render until the user re-set them.
  const regionOverrides = getCloneRegions(options.page)
    .filter(region => typeof region.height_override === 'number')
    .map(region => ({ id: region.id, height_override: region.height_override }))

  return buildCloneStudioHtml({
    rendered: getCloneHtml(options.page),
    title: options.title,
    baseHref: options.baseHref || options.workerBase || '/',
    mediaBase: options.workerBase,
    stylesheetUrls: getCloneStylesheetUrls(options.page),
    selectedRegionId: null,
    bridgeToken: options.bridgeToken,
    regionOverrides,
    editable: options.editable !== false,
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
  // When false, the bridge is locked read-only (no inline-edit caret, no context menu). The
  // read-only preview passes false; the editor leaves it true.
  editable?: boolean
}>(), {
  title: 'Clone Studio',
  baseHref: '',
  workerBase: '',
  frameWidth: 1280,
  allowSameOriginSandbox: false,
  fitWidth: false,
  editable: true,
})

const emit = defineEmits<{
  selectRegion: [region: any]
  domUpdated: [html: string]
  contextMenu: [menu: { regionId: any, fields: any, typeHint: any, x: number, y: number }]
  regionHeight: [payload: { regionId: any, height: number | null }]
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
  editable: props.editable,
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
    return
  }

  if (data.type === 'clone-studio:region-height') {
    const height = data.height == null ? null : Number(data.height)
    emit('regionHeight', {
      regionId: data.regionId,
      height: height != null && Number.isFinite(height) ? height : null,
    })
    return
  }

  if (data.type === 'clone-studio:context-menu') {
    const rect = iframe.value?.getBoundingClientRect() ?? { left: 0, top: 0 }
    const pt = translateFramePoint(
      { x: Number(data.x) || 0, y: Number(data.y) || 0 },
      rect,
      frameScale.value,
    )
    emit('contextMenu', {
      regionId: data.regionId,
      fields: data.fields,
      typeHint: data.typeHint,
      x: pt.x,
      y: pt.y,
    })
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

function beginEdit(regionId: string) {
  postToFrame({ type: 'clone-studio:begin-edit', regionId, bridgeToken })
}

function switchPanel(regionId: string, index: number) {
  postToFrame({ type: 'clone-studio:switch-panel', regionId, index, bridgeToken })
}

function setHeight(regionId: string, value: number | null) {
  postToFrame({ type: 'clone-studio:set-height', regionId, value, bridgeToken })
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
  beginEdit,
  switchPanel,
  setHeight,
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
