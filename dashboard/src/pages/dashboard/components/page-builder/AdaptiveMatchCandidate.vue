<script lang="ts" setup>
import type { CSSProperties } from 'vue'

import { computed, defineComponent, h } from 'vue'

import type { CandidateGraph } from '@/lib/adaptive-match-contracts'

import { candidateGraphToSection } from '@/lib/adaptive-match-contracts'
import { proxyFidelityAssetUrl, rewriteFidelityCssAssetUrls, rewriteFidelityHtmlAssetUrls, stripFidelitySrcsetAttributes } from '@/lib/fidelity-assets'

import SectionAccordion from '../sections/SectionAccordion.vue'
import SectionGallery from '../sections/SectionGallery.vue'
import SectionTabs from '../sections/SectionTabs.vue'

const props = defineProps<{
  graph: CandidateGraph
  oemId: string
}>()
const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'

const DeterministicStyle = defineComponent({
  props: { css: { type: String, required: true } },
  setup: styleProps => () => h('style', styleProps.css),
})

const section = computed(() => {
  const value = candidateGraphToSection(props.graph, {
    runId: 'adaptive-match-preview',
    qa: { passed: false, worstMismatchRatio: 1 },
  })
  if (value.type === 'gallery') {
    return {
      ...value,
      images: value.images.map((image: Record<string, any>) => ({
        ...image,
        url: proxyFidelityAssetUrl(String(image.url || ''), props.oemId, WORKER_BASE),
      })),
    }
  }
  if (value.type === 'tabs') {
    return {
      ...value,
      tabs: value.tabs.map((tab: Record<string, any>) => ({
        ...tab,
        image_url: proxyFidelityAssetUrl(String(tab.image_url || ''), props.oemId, WORKER_BASE),
      })),
    }
  }
  return value
})

const deterministicHtml = computed(() => props.graph.section.type === 'content-block'
  ? stripFidelitySrcsetAttributes(rewriteFidelityHtmlAssetUrls(props.graph.section.generatedHtml, props.oemId, WORKER_BASE))
  : '')
const deterministicCss = computed(() => props.graph.section.type === 'content-block'
  ? rewriteFidelityCssAssetUrls(props.graph.section.generatedCss, props.oemId, WORKER_BASE)
  : '')

const wrapperStyle = computed<CSSProperties>(() => {
  const layout = props.graph.section.layoutTokens
  const appearance = props.graph.section.appearanceTokens
  return {
    'maxWidth': layout.maxWidthPx ? `${layout.maxWidthPx}px` : undefined,
    'marginInline': layout.maxWidthPx ? 'auto' : undefined,
    'paddingBlock': layout.paddingBlockPx !== undefined ? `${layout.paddingBlockPx}px` : undefined,
    'paddingInline': layout.paddingInlinePx !== undefined ? `${layout.paddingInlinePx}px` : undefined,
    'textAlign': layout.textAlign,
    'backgroundColor': appearance.backgroundColor,
    'color': appearance.textColor,
    'borderColor': appearance.borderColor,
    'borderRadius': appearance.borderRadiusPx !== undefined ? `${appearance.borderRadiusPx}px` : undefined,
    'boxShadow': appearance.shadow ? '0 18px 50px rgb(0 0 0 / 0.12)' : undefined,
    '--adaptive-gap': layout.gapPx !== undefined ? `${layout.gapPx}px` : undefined,
    '--adaptive-accent': appearance.accentColor,
    '--adaptive-heading-size': appearance.headingSizePx ? `${appearance.headingSizePx}px` : undefined,
    '--adaptive-body-size': appearance.bodySizePx ? `${appearance.bodySizePx}px` : undefined,
    '--adaptive-font-weight': appearance.fontWeight,
    '--adaptive-image-fit': appearance.imageFit,
    '--adaptive-image-ratio': appearance.imageAspectRatio,
  } as CSSProperties
})
</script>

<template>
  <section
    :data-adaptive-candidate="graph.kind"
    :data-adaptive-region="graph.regionId"
    :data-oem-id="oemId"
    :style="wrapperStyle"
    class="adaptive-match-candidate"
  >
    <template v-if="graph.section.type === 'content-block'">
      <DeterministicStyle v-if="deterministicCss" :css="deterministicCss" />
      <div data-adaptive-section="static" v-html="deterministicHtml" />
    </template>
    <SectionGallery v-else-if="graph.section.type === 'gallery'" :section="section as any" />
    <SectionTabs v-else-if="graph.section.type === 'tabs'" :section="section as any" />
    <SectionAccordion v-else :section="section as any" />
  </section>
</template>

<style scoped>
.adaptive-match-candidate {
  overflow: clip;
  font-size: var(--adaptive-body-size, inherit);
  font-weight: var(--adaptive-font-weight, inherit);
}

.adaptive-match-candidate :deep(h1),
.adaptive-match-candidate :deep(h2),
.adaptive-match-candidate :deep(h3) {
  font-size: var(--adaptive-heading-size, inherit);
}

.adaptive-match-candidate :deep(img) {
  object-fit: var(--adaptive-image-fit, cover);
  aspect-ratio: var(--adaptive-image-ratio, auto);
}
</style>
