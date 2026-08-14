<script lang="ts" setup>
import type { CSSProperties } from 'vue'

import { computed, defineComponent, h } from 'vue'

import type { CandidateGraph } from '@/lib/adaptive-match-contracts'

import { candidateGraphToSection } from '@/lib/adaptive-match-contracts'

import SectionAccordion from '../sections/SectionAccordion.vue'
import SectionGallery from '../sections/SectionGallery.vue'
import SectionTabs from '../sections/SectionTabs.vue'

const props = defineProps<{
  graph: CandidateGraph
  oemId: string
}>()

const DeterministicStyle = defineComponent({
  props: { css: { type: String, required: true } },
  setup: styleProps => () => h('style', styleProps.css),
})

const section = computed(() => candidateGraphToSection(props.graph, {
  runId: 'adaptive-match-preview',
  qa: { passed: false, worstMismatchRatio: 1 },
}))

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
      <DeterministicStyle v-if="graph.section.generatedCss" :css="graph.section.generatedCss" />
      <div data-adaptive-section="static" v-html="graph.section.generatedHtml" />
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
