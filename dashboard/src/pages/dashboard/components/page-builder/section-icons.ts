import {
  Award,
  BarChart3,
  Calculator,
  Code2,
  Columns3,
  DollarSign,
  FileText,
  Image,
  Images,
  LayoutGrid,
  Maximize,
  Megaphone,
  Palette,
  PanelBottom,
  Quote,
  Table2,
  TableProperties,
  Timer,
  Type as TypeIcon,
  Video,
} from 'lucide-vue-next'
import type { Component } from 'vue'

import type { PageSectionType } from './section-templates'

export const fallbackSectionTypeIcon = TypeIcon

export const SECTION_TYPE_ICONS: Partial<Record<PageSectionType, Component>> = {
  'hero': Image,
  'heading': TypeIcon,
  'intro': TypeIcon,
  'tabs': Columns3,
  'color-picker': Palette,
  'specs-grid': TableProperties,
  'gallery': Images,
  'feature-cards': LayoutGrid,
  'image': Image,
  'video': Video,
  'cta-banner': Megaphone,
  'content-block': FileText,
  'testimonial': Quote,
  'comparison-table': Table2,
  'stats': BarChart3,
  'logo-strip': Award,
  'embed': Code2,
  'pricing-table': DollarSign,
  'sticky-bar': PanelBottom,
  'countdown': Timer,
  'finance-calculator': Calculator,
  'image-showcase': Maximize,
  'card-grid': LayoutGrid,
  'split-content': Columns3,
  'media': Images,
  'pinned-scroll': PanelBottom,
}

export function getSectionTypeIcon(type: string | null | undefined): Component {
  if (!type)
    return fallbackSectionTypeIcon
  return SECTION_TYPE_ICONS[type as PageSectionType] ?? fallbackSectionTypeIcon
}
