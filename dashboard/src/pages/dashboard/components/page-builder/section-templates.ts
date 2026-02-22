export type PageSectionType =
  | 'hero' | 'intro' | 'tabs' | 'color-picker' | 'specs-grid'
  | 'gallery' | 'feature-cards' | 'video' | 'cta-banner' | 'content-block'
  | 'accordion' | 'enquiry-form' | 'map' | 'alert' | 'divider'

export interface SectionTemplate {
  id: string
  name: string
  description: string
  type: PageSectionType
  data: Record<string, any>
}

export const SECTION_DEFAULTS: Record<PageSectionType, () => Record<string, any>> = {
  'hero': () => ({ heading: '', sub_heading: '', cta_text: '', cta_url: '', desktop_image_url: '', mobile_image_url: '' }),
  'intro': () => ({ title: '', body_html: '', image_url: '', image_position: 'right' }),
  'tabs': () => ({ title: '', category: '', variant: 'default', theme: 'light', image_position: 'right', tabs: [{ label: 'Tab 1', content_html: '', image_url: '', image_disclaimer: '', disclaimer: '' }], default_tab: 0 }),
  'color-picker': () => ({ title: 'Colours', colors: [] }),
  'specs-grid': () => ({ title: 'Specifications', categories: [] }),
  'gallery': () => ({ title: 'Gallery', images: [], layout: 'carousel' }),
  'feature-cards': () => ({ title: '', cards: [{ title: '', description: '', image_url: '' }], columns: 3 }),
  'video': () => ({ title: '', video_url: '', poster_url: '', autoplay: false }),
  'cta-banner': () => ({ heading: '', body: '', cta_text: '', cta_url: '', background_color: '' }),
  'content-block': () => ({ title: '', content_html: '', layout: 'contained', background: '', image_url: '' }),
  'accordion': () => ({ title: '', items: [{ question: '', answer: '' }], section_id: '' }),
  'enquiry-form': () => ({ heading: 'Enquire Now', sub_heading: '', form_type: 'contact', vehicle_context: true }),
  'map': () => ({ title: '', sub_heading: '', embed_url: '' }),
  'alert': () => ({ title: '', message: '', variant: 'info', dismissible: false }),
  'divider': () => ({ style: 'line', spacing: 'md' }),
}

export const SECTION_TEMPLATES: SectionTemplate[] = [
  // Hero
  { id: 'hero-image', name: 'Hero with Image', description: 'Full-width hero with heading overlay', type: 'hero', data: { heading: 'Model Name', sub_heading: 'Starting from $XX,XXX', cta_text: 'Build & Price', cta_url: '#' } },
  { id: 'hero-video', name: 'Hero with Video', description: 'Video background hero banner', type: 'hero', data: { heading: 'Model Name', sub_heading: 'Experience the drive', cta_text: 'Watch Video', cta_url: '#', video_url: '' } },

  // Intro
  { id: 'intro-right', name: 'Intro (Image Right)', description: 'Introduction text with image on right', type: 'intro', data: { image_position: 'right', body_html: '' } },
  { id: 'intro-left', name: 'Intro (Image Left)', description: 'Introduction text with image on left', type: 'intro', data: { image_position: 'left', body_html: '' } },

  // Tabs
  { id: 'tabs-default', name: 'Tab Bar', description: 'Horizontal tab strip with content panels', type: 'tabs', data: { variant: 'default', tabs: [{ label: 'Design', content_html: '', image_url: '' }, { label: 'Performance', content_html: '', image_url: '' }, { label: 'Technology', content_html: '', image_url: '' }], default_tab: 0 } },
  { id: 'tabs-kia', name: 'Kia Feature Bullets', description: 'Kia-style split layout with red bullet list and side image', type: 'tabs', data: { variant: 'kia-feature-bullets', category: 'Features', title: 'Designed to impress.', tabs: [{ label: 'Design', content_html: '', image_url: '', image_disclaimer: '', disclaimer: '' }, { label: 'Performance', content_html: '', image_url: '', image_disclaimer: '', disclaimer: '' }, { label: 'Technology', content_html: '', image_url: '', image_disclaimer: '', disclaimer: '' }], default_tab: 0 } },

  // Feature cards
  { id: 'features-3col', name: '3-Column Features', description: 'Three feature cards in a row', type: 'feature-cards', data: { columns: 3, cards: [{ title: 'Feature 1', description: '', image_url: '' }, { title: 'Feature 2', description: '', image_url: '' }, { title: 'Feature 3', description: '', image_url: '' }] } },
  { id: 'features-4col', name: '4-Column Features', description: 'Four feature cards in a grid', type: 'feature-cards', data: { columns: 4, cards: [{ title: 'Feature 1', description: '', image_url: '' }, { title: 'Feature 2', description: '', image_url: '' }, { title: 'Feature 3', description: '', image_url: '' }, { title: 'Feature 4', description: '', image_url: '' }] } },

  // Gallery
  { id: 'gallery-carousel', name: 'Image Carousel', description: 'Swipeable image gallery', type: 'gallery', data: { layout: 'carousel', images: [] } },
  { id: 'gallery-grid', name: 'Image Grid', description: 'Grid of images', type: 'gallery', data: { layout: 'grid', images: [] } },

  // Content block
  { id: 'content-full', name: 'Full-Width Content', description: 'Full-width HTML content block', type: 'content-block', data: { layout: 'full-width', content_html: '' } },
  { id: 'content-split', name: 'Text + Image Split', description: 'Two-column layout with text and image', type: 'content-block', data: { layout: 'two-column', content_html: '', image_url: '' } },

  // CTA
  { id: 'cta-enquire', name: 'Enquire Now CTA', description: 'Call-to-action with enquiry button', type: 'cta-banner', data: { heading: 'Ready to learn more?', body: 'Contact your local dealer today.', cta_text: 'Enquire Now', cta_url: '#' } },
  { id: 'cta-testdrive', name: 'Book Test Drive CTA', description: 'Test drive booking CTA', type: 'cta-banner', data: { heading: 'Experience it for yourself', cta_text: 'Book a Test Drive', cta_url: '#' } },

  // Video
  { id: 'video-autoplay', name: 'Autoplay Video', description: 'Muted autoplay video section', type: 'video', data: { autoplay: true, video_url: '' } },
  { id: 'video-standard', name: 'Standard Video', description: 'Click-to-play video', type: 'video', data: { autoplay: false, video_url: '' } },

  // Accordion
  { id: 'accordion-faq', name: 'FAQ Section', description: 'Expandable question & answer panels', type: 'accordion', data: { title: 'Frequently Asked Questions', items: [{ question: 'What is the warranty?', answer: '' }, { question: 'What finance options are available?', answer: '' }] } },
  { id: 'accordion-disclaimers', name: 'Warranty & Disclaimers', description: 'Collapsible legal and warranty information', type: 'accordion', data: { title: 'Warranty & Disclaimers', items: [{ question: 'Warranty Coverage', answer: '' }], section_id: 'disclaimers' } },

  // Enquiry Form
  { id: 'enquiry-contact', name: 'General Enquiry', description: 'Contact form placeholder for dealer enquiries', type: 'enquiry-form', data: { heading: 'Get in Touch', sub_heading: 'Fill out the form below and our team will be in touch.', form_type: 'contact', vehicle_context: true } },
  { id: 'enquiry-testdrive', name: 'Book a Test Drive', description: 'Test drive booking form placeholder', type: 'enquiry-form', data: { heading: 'Book a Test Drive', sub_heading: 'Experience it for yourself.', form_type: 'test-drive', vehicle_context: true } },

  // Map
  { id: 'map-dealer', name: 'Dealer Location Map', description: 'Google Maps embed for dealer location', type: 'map', data: { title: 'Find Us', sub_heading: 'Visit our showroom', embed_url: '' } },

  // Alert
  { id: 'alert-promo', name: 'Promo Alert', description: 'Promotional info banner', type: 'alert', data: { title: 'Limited Time Offer', message: '', variant: 'info', dismissible: true } },
  { id: 'alert-safety', name: 'Safety Notice', description: 'Important safety or recall notice', type: 'alert', data: { title: 'Safety Notice', message: '', variant: 'warning', dismissible: false } },
  { id: 'alert-disclaimer', name: 'Disclaimer', description: 'Legal disclaimer banner', type: 'alert', data: { message: '', variant: 'info', dismissible: false } },

  // Divider
  { id: 'divider-line', name: 'Simple Line', description: 'Horizontal line separator', type: 'divider', data: { style: 'line', spacing: 'md' } },
  { id: 'divider-spacer', name: 'Large Spacer', description: 'Empty space between sections', type: 'divider', data: { style: 'space', spacing: 'lg' } },
]

export const SECTION_TYPE_INFO: Record<PageSectionType, { label: string; description: string }> = {
  'hero': { label: 'Hero', description: 'Full-width banner with heading and CTA' },
  'intro': { label: 'Intro', description: 'Introduction text with optional image' },
  'tabs': { label: 'Tabs', description: 'Tabbed content sections' },
  'color-picker': { label: 'Colour Picker', description: 'Vehicle colour selector' },
  'specs-grid': { label: 'Specs Grid', description: 'Technical specifications table' },
  'gallery': { label: 'Gallery', description: 'Image gallery with lightbox captions' },
  'feature-cards': { label: 'Feature Cards', description: 'Grid of feature cards' },
  'video': { label: 'Video', description: 'Embedded video section' },
  'cta-banner': { label: 'CTA Banner', description: 'Call-to-action banner' },
  'content-block': { label: 'Content Block', description: 'Rich text content section' },
  'accordion': { label: 'Accordion', description: 'Expandable FAQ / Q&A panels' },
  'enquiry-form': { label: 'Enquiry Form', description: 'Placeholder for platform-rendered form' },
  'map': { label: 'Map', description: 'Google Maps embed' },
  'alert': { label: 'Alert', description: 'Coloured notification banner' },
  'divider': { label: 'Divider', description: 'Visual separator between sections' },
}
