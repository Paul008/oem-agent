import type { Component } from 'vue'

import { defineAsyncComponent } from 'vue'

import type { PageSectionType } from './section-templates'

type SectionComponent = Component

export type SectionRenderContext = 'canvas' | 'display'

const SectionHero = defineAsyncComponent(() => import('../sections/SectionHero.vue'))
const SectionHeading = defineAsyncComponent(() => import('../sections/SectionHeading.vue'))
const SectionIntro = defineAsyncComponent(() => import('../sections/SectionIntro.vue'))
const SectionTabs = defineAsyncComponent(() => import('../sections/SectionTabs.vue'))
const SectionColorPicker = defineAsyncComponent(() => import('../sections/SectionColorPicker.vue'))
const SectionSpecs = defineAsyncComponent(() => import('../sections/SectionSpecs.vue'))
const SectionGallery = defineAsyncComponent(() => import('../sections/SectionGallery.vue'))
const SectionFeatureCards = defineAsyncComponent(() => import('../sections/SectionFeatureCards.vue'))
const SectionVideo = defineAsyncComponent(() => import('../sections/SectionVideo.vue'))
const SectionCta = defineAsyncComponent(() => import('../sections/SectionCta.vue'))
const SectionContentBlock = defineAsyncComponent(() => import('../sections/SectionContentBlock.vue'))
const SectionAccordion = defineAsyncComponent(() => import('../sections/SectionAccordion.vue'))
const SectionEnquiryForm = defineAsyncComponent(() => import('../sections/SectionEnquiryForm.vue'))
const SectionMap = defineAsyncComponent(() => import('../sections/SectionMap.vue'))
const SectionAlert = defineAsyncComponent(() => import('../sections/SectionAlert.vue'))
const SectionDivider = defineAsyncComponent(() => import('../sections/SectionDivider.vue'))
const SectionTestimonial = defineAsyncComponent(() => import('../sections/SectionTestimonial.vue'))
const SectionComparisonTable = defineAsyncComponent(() => import('../sections/SectionComparisonTable.vue'))
const SectionStats = defineAsyncComponent(() => import('../sections/SectionStats.vue'))
const SectionLogoStrip = defineAsyncComponent(() => import('../sections/SectionLogoStrip.vue'))
const SectionEmbed = defineAsyncComponent(() => import('../sections/SectionEmbed.vue'))
const SectionPricingTable = defineAsyncComponent(() => import('../sections/SectionPricingTable.vue'))
const SectionStickyBar = defineAsyncComponent(() => import('../sections/SectionStickyBar.vue'))
const SectionFinanceCalculator = defineAsyncComponent(() => import('../sections/SectionFinanceCalculator.vue'))
const SectionImageBlock = defineAsyncComponent(() => import('../sections/SectionImageBlock.vue'))
const SectionImageShowcase = defineAsyncComponent(() => import('../sections/SectionImageShowcase.vue'))
const SectionCardGrid = defineAsyncComponent(() => import('../sections/SectionCardGrid.vue'))
const SectionSplitContent = defineAsyncComponent(() => import('../sections/SectionSplitContent.vue'))
const SectionMedia = defineAsyncComponent(() => import('../sections/SectionMedia.vue'))
const SectionPinnedScroll = defineAsyncComponent(() => import('../sections/SectionPinnedScroll.vue'))
const SectionVariantColorExplorer = defineAsyncComponent(() => import('../sections/SectionVariantColorExplorer.vue'))

const baseSectionComponentMap = {
  'hero': SectionHero,
  'heading': SectionHeading,
  'intro': SectionIntro,
  'tabs': SectionTabs,
  'color-picker': SectionColorPicker,
  'specs-grid': SectionSpecs,
  'gallery': SectionGallery,
  'feature-cards': SectionFeatureCards,
  'video': SectionVideo,
  'cta-banner': SectionCta,
  'content-block': SectionContentBlock,
  'accordion': SectionAccordion,
  'enquiry-form': SectionEnquiryForm,
  'map': SectionMap,
  'alert': SectionAlert,
  'divider': SectionDivider,
  'testimonial': SectionTestimonial,
  'comparison-table': SectionComparisonTable,
  'stats': SectionStats,
  'logo-strip': SectionLogoStrip,
  'embed': SectionEmbed,
  'pricing-table': SectionPricingTable,
  'sticky-bar': SectionStickyBar,
  'countdown': SectionHero,
  'finance-calculator': SectionFinanceCalculator,
  'image': SectionImageBlock,
  'image-showcase': SectionImageShowcase,
  'card-grid': SectionCardGrid,
  'split-content': SectionSplitContent,
  'media': SectionMedia,
  'pinned-scroll': SectionPinnedScroll,
  'variant-color-explorer': SectionVariantColorExplorer,
} satisfies Record<PageSectionType, SectionComponent>

const displaySectionComponentOverrides = {
  'intro': SectionSplitContent,
  'gallery': SectionMedia,
  'video': SectionMedia,
  'cta-banner': SectionHero,
  'content-block': SectionSplitContent,
  'embed': SectionMedia,
  'image': SectionMedia,
  'image-showcase': SectionMedia,
} satisfies Partial<Record<PageSectionType, SectionComponent>>

export const canvasSectionComponentMap: Record<PageSectionType, SectionComponent> = {
  ...baseSectionComponentMap,
}

export const displaySectionComponentMap: Record<PageSectionType, SectionComponent> = {
  ...baseSectionComponentMap,
  ...displaySectionComponentOverrides,
}

export const sectionComponentMap = canvasSectionComponentMap

export const registeredSectionTypes = Object.keys(sectionComponentMap) as PageSectionType[]

export interface ResolvablePageSection {
  type?: string
  card_composition?: unknown
  [key: string]: unknown
}

export function resolveSectionComponent(
  section: ResolvablePageSection | null | undefined,
  options: { context?: SectionRenderContext } = {},
): SectionComponent | undefined {
  const componentMap = options.context === 'display'
    ? displaySectionComponentMap
    : canvasSectionComponentMap

  if (Array.isArray(section?.card_composition) && section.card_composition.length > 0) {
    return componentMap['card-grid']
  }

  return componentMap[section?.type as PageSectionType]
}
