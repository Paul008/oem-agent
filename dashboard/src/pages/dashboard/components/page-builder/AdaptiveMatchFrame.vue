<script lang="ts" setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import type { CandidateGraph } from '@/lib/adaptive-match-contracts'

import AdaptiveMatchCandidate from './AdaptiveMatchCandidate.vue'

const props = defineProps<{
  graph: CandidateGraph
  oemId: string
  viewport: { width: number, height: number }
}>()

const iframe = ref<HTMLIFrameElement | null>(null)
const mountTarget = ref<HTMLElement | null>(null)

function frameDocument(): Document | null {
  return iframe.value?.contentDocument ?? null
}

function initialiseFrame() {
  const targetDocument = frameDocument()
  if (!targetDocument)
    return

  targetDocument.head.replaceChildren()
  for (const stylesheet of document.head.querySelectorAll('link[rel="stylesheet"], style'))
    targetDocument.head.append(stylesheet.cloneNode(true))

  const root = targetDocument.createElement('div')
  root.id = 'adaptive-match-frame-root'
  targetDocument.body.replaceChildren(root)
  targetDocument.documentElement.style.background = 'transparent'
  targetDocument.body.style.margin = '0'
  mountTarget.value = root
}

async function ready(): Promise<void> {
  if (!mountTarget.value?.isConnected)
    initialiseFrame()
  await nextTick()
}

function root(): HTMLElement | null {
  return mountTarget.value
}

onMounted(initialiseFrame)
onBeforeUnmount(() => {
  mountTarget.value = null
})

defineExpose({
  ready,
  root,
  document: frameDocument,
})
</script>

<template>
  <iframe
    ref="iframe"
    title="Adaptive Match candidate preview"
    sandbox="allow-same-origin"
    :width="props.viewport.width"
    :height="props.viewport.height"
    :style="{ width: `${props.viewport.width}px`, height: `${props.viewport.height}px` }"
    class="block border-0 bg-transparent"
    @load="initialiseFrame"
  />
  <Teleport v-if="mountTarget" :to="mountTarget">
    <AdaptiveMatchCandidate :graph="graph" :oem-id="oemId" />
  </Teleport>
</template>
