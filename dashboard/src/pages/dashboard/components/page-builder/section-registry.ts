import { defineAsyncComponent, type Component } from 'vue'

import type { PageSectionType } from './section-templates'

type SectionComponent = Component

export const sectionComponentMap: Record<PageSectionType, SectionComponent> = {
  'hero': defineAsyncComponent(() => import('../sections/SectionHero.vue')),
  'heading': defineAsyncComponent(() => import('../sections/SectionHeading.vue')),
  'intro': defineAsyncComponent(() => import('../sections/SectionIntro.vue')),
  'tabs': defineAsyncComponent(() => import('../sections/SectionTabs.vue')),
  'color-picker': defineAsyncComponent(() => import('../sections/SectionColorPicker.vue')),
  'specs-grid': defineAsyncComponent(() => import('../sections/SectionSpecs.vue')),
  'gallery': defineAsyncComponent(() => import('../sections/SectionGallery.vue')),
  'feature-cards': defineAsyncComponent(() => import('../sections/SectionFeatureCards.vue')),
  'video': defineAsyncComponent(() => import('../sections/SectionVideo.vue')),
  'cta-banner': defineAsyncComponent(() => import('../sections/SectionCta.vue')),
  'content-block': defineAsyncComponent(() => import('../sections/SectionContentBlock.vue')),
  'accordion': defineAsyncComponent(() => import('../sections/SectionAccordion.vue')),
  'enquiry-form': defineAsyncComponent(() => import('../sections/SectionEnquiryForm.vue')),
  'map': defineAsyncComponent(() => import('../sections/SectionMap.vue')),
  'alert': defineAsyncComponent(() => import('../sections/SectionAlert.vue')),
  'divider': defineAsyncComponent(() => import('../sections/SectionDivider.vue')),
  'testimonial': defineAsyncComponent(() => import('../sections/SectionTestimonial.vue')),
  'comparison-table': defineAsyncComponent(() => import('../sections/SectionComparisonTable.vue')),
  'stats': defineAsyncComponent(() => import('../sections/SectionStats.vue')),
  'logo-strip': defineAsyncComponent(() => import('../sections/SectionLogoStrip.vue')),
  'embed': defineAsyncComponent(() => import('../sections/SectionEmbed.vue')),
  'pricing-table': defineAsyncComponent(() => import('../sections/SectionPricingTable.vue')),
  'sticky-bar': defineAsyncComponent(() => import('../sections/SectionStickyBar.vue')),
  'countdown': defineAsyncComponent(() => import('../sections/SectionHero.vue')),
  'finance-calculator': defineAsyncComponent(() => import('../sections/SectionFinanceCalculator.vue')),
  'image': defineAsyncComponent(() => import('../sections/SectionImageBlock.vue')),
  'image-showcase': defineAsyncComponent(() => import('../sections/SectionImageShowcase.vue')),
  'card-grid': defineAsyncComponent(() => import('../sections/SectionCardGrid.vue')),
  'split-content': defineAsyncComponent(() => import('../sections/SectionSplitContent.vue')),
  'media': defineAsyncComponent(() => import('../sections/SectionMedia.vue')),
  'pinned-scroll': defineAsyncComponent(() => import('../sections/SectionPinnedScroll.vue')),
}

export const registeredSectionTypes = Object.keys(sectionComponentMap) as PageSectionType[]

export interface ResolvablePageSection {
  type?: string
  card_composition?: unknown
  [key: string]: unknown
}

export function resolveSectionComponent(section: ResolvablePageSection | null | undefined): SectionComponent | undefined {
  if (Array.isArray(section?.card_composition) && section.card_composition.length > 0) {
    return sectionComponentMap['card-grid']
  }

  return sectionComponentMap[section?.type as PageSectionType]
}
