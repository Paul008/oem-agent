<script lang="ts" setup>
import { defineAsyncComponent } from 'vue'

import AnimatedSection from './AnimatedSection.vue'

interface PageSection {
  type: string
  id: string
  order: number
  animation?: string
  [key: string]: any
}

defineProps<{ sections: PageSection[] }>()

function resolveComponent(section: PageSection) {
  if (Array.isArray(section.card_composition) && section.card_composition.length > 0) {
    return componentMap['card-grid']
  }
  return componentMap[section.type]
}

const componentMap: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  'hero': defineAsyncComponent(() => import('./SectionHero.vue')),
  'heading': defineAsyncComponent(() => import('./SectionHeading.vue')),
  'intro': defineAsyncComponent(() => import('./SectionSplitContent.vue')),
  'tabs': defineAsyncComponent(() => import('./SectionTabs.vue')),
  'color-picker': defineAsyncComponent(() => import('./SectionColorPicker.vue')),
  'specs-grid': defineAsyncComponent(() => import('./SectionSpecs.vue')),
  'gallery': defineAsyncComponent(() => import('./SectionMedia.vue')),
  'image': defineAsyncComponent(() => import('./SectionMedia.vue')),
  'image-showcase': defineAsyncComponent(() => import('./SectionMedia.vue')),
  'feature-cards': defineAsyncComponent(() => import('./SectionFeatureCards.vue')),
  'video': defineAsyncComponent(() => import('./SectionMedia.vue')),
  'cta-banner': defineAsyncComponent(() => import('./SectionHero.vue')),
  'content-block': defineAsyncComponent(() => import('./SectionSplitContent.vue')),
  'accordion': defineAsyncComponent(() => import('./SectionAccordion.vue')),
  'enquiry-form': defineAsyncComponent(() => import('./SectionEnquiryForm.vue')),
  'map': defineAsyncComponent(() => import('./SectionMap.vue')),
  'alert': defineAsyncComponent(() => import('./SectionAlert.vue')),
  'divider': defineAsyncComponent(() => import('./SectionDivider.vue')),
  'stats': defineAsyncComponent(() => import('./SectionStats.vue')),
  'logo-strip': defineAsyncComponent(() => import('./SectionLogoStrip.vue')),
  'testimonial': defineAsyncComponent(() => import('./SectionTestimonial.vue')),
  'pricing-table': defineAsyncComponent(() => import('./SectionPricingTable.vue')),
  'embed': defineAsyncComponent(() => import('./SectionMedia.vue')),
  'media': defineAsyncComponent(() => import('./SectionMedia.vue')),
  'countdown': defineAsyncComponent(() => import('./SectionHero.vue')),
  'split-content': defineAsyncComponent(() => import('./SectionSplitContent.vue')),
  'card-grid': defineAsyncComponent(() => import('./SectionCardGrid.vue')),
  'sticky-bar': defineAsyncComponent(() => import('./SectionStickyBar.vue')),
  'finance-calculator': defineAsyncComponent(() => import('./SectionFinanceCalculator.vue')),
  'comparison-table': defineAsyncComponent(() => import('./SectionComparisonTable.vue')),
  'pinned-scroll': defineAsyncComponent(() => import('./SectionPinnedScroll.vue')),
}
</script>

<template>
  <div class="space-y-0">
    <template v-for="section in sections" :key="section.id">
      <AnimatedSection :animation="section.animation as any" :animation-duration="section.animation_duration" :animation-delay="section.animation_delay">
        <component
          :is="resolveComponent(section)"
          v-if="resolveComponent(section)"
          :section="section"
        />
        <div
          v-else
          class="px-6 py-4 bg-muted/30 text-sm text-muted-foreground"
        >
          Unknown section type: {{ section.type }}
        </div>
      </AnimatedSection>
    </template>
  </div>
</template>
