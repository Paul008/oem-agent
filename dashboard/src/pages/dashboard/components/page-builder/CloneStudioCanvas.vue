<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { getCloneHtml } from '../../page-builder/page-modes'
import { buildCloneStudioHtml } from './clone-studio-html'

const props = withDefaults(defineProps<{
  page: any
  title?: string
  baseHref?: string
  workerBase?: string
  selectedRegionId: string | null
}>(), {
  title: 'Clone Studio',
  baseHref: '',
  workerBase: '',
})

const emit = defineEmits<{
  selectRegion: [region: any]
  domUpdated: [html: string]
}>()

const iframe = ref<HTMLIFrameElement | null>(null)
const bridgeToken = createBridgeToken()

const cloneDocument = computed(() => ({
  rendered: getCloneHtml(props.page),
  title: props.title,
  baseHref: props.baseHref || props.workerBase || '/',
}))

const frameHtml = computed(() => buildCloneStudioHtml({
  ...cloneDocument.value,
  selectedRegionId: null,
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
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
})

defineExpose({
  postToFrame,
  patchField,
})
</script>

<template>
  <iframe
    ref="iframe"
    class="h-full min-h-[640px] w-full border-0 bg-white"
    sandbox="allow-scripts"
    title="Clone Studio canvas"
    :srcdoc="frameHtml"
    @load="onFrameLoad"
  />
</template>
