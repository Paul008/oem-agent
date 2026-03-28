<script lang="ts" setup>
import { defineAsyncComponent } from 'vue'

interface PageSection {
  type: string
  id: string
  order: number
  [key: string]: any
}

defineProps<{ sections: PageSection[] }>()

const componentMap: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  'hero': defineAsyncComponent(() => import('./SectionHero.vue')),
  'heading': defineAsyncComponent(() => import('./SectionHeading.vue')),
  'intro': defineAsyncComponent(() => import('./SectionIntro.vue')),
  'tabs': defineAsyncComponent(() => import('./SectionTabs.vue')),
  'color-picker': defineAsyncComponent(() => import('./SectionColorPicker.vue')),
  'specs-grid': defineAsyncComponent(() => import('./SectionSpecs.vue')),
  'gallery': defineAsyncComponent(() => import('./SectionGallery.vue')),
  'image': defineAsyncComponent(() => import('./SectionImage.vue')),
  'image-showcase': defineAsyncComponent(() => import('./SectionImage.vue')),
  'feature-cards': defineAsyncComponent(() => import('./SectionFeatureCards.vue')),
  'video': defineAsyncComponent(() => import('./SectionVideo.vue')),
  'cta-banner': defineAsyncComponent(() => import('./SectionCta.vue')),
  'content-block': defineAsyncComponent(() => import('./SectionContentBlock.vue')),
  'accordion': defineAsyncComponent(() => import('./SectionAccordion.vue')),
  'enquiry-form': defineAsyncComponent(() => import('./SectionEnquiryForm.vue')),
  'map': defineAsyncComponent(() => import('./SectionMap.vue')),
  'alert': defineAsyncComponent(() => import('./SectionAlert.vue')),
  'divider': defineAsyncComponent(() => import('./SectionDivider.vue')),
  'card-grid': defineAsyncComponent(() => import('./SectionCardGrid.vue')),
}
</script>

<template>
  <div class="space-y-0">
    <template v-for="section in sections" :key="section.id">
      <component
        v-if="componentMap[section.type]"
        :is="componentMap[section.type]"
        :section="section"
      />
      <!-- Fallback for unknown section types -->
      <div
        v-else
        class="px-6 py-4 bg-muted/30 text-sm text-muted-foreground"
      >
        Unknown section type: {{ section.type }}
      </div>
    </template>
  </div>
</template>
