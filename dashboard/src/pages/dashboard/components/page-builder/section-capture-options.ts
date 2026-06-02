import type { PageSectionType } from './section-templates'

import { SECTION_TYPE_INFO } from './section-templates'

export const RAW_HTML_CAPTURE_TYPE = '_raw_html'

export type SectionCaptureType = PageSectionType | typeof RAW_HTML_CAPTURE_TYPE

export interface SectionCaptureTypeOption {
  value: SectionCaptureType
  label: string
  divider?: boolean
}

const SECTION_CAPTURE_TYPES: PageSectionType[] = [
  'content-block',
  'feature-cards',
  'hero',
  'intro',
  'image',
  'gallery',
  'heading',
  'testimonial',
  'stats',
  'cta-banner',
]

export const SECTION_CAPTURE_TYPE_OPTIONS: SectionCaptureTypeOption[] = [
  { value: RAW_HTML_CAPTURE_TYPE, label: 'HTML → Tailwind', divider: true },
  ...SECTION_CAPTURE_TYPES.map(type => ({
    value: type,
    label: SECTION_TYPE_INFO[type].label,
  })),
]
