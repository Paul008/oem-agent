export type PageSectionType =
  | 'hero' | 'intro' | 'tabs' | 'color-picker' | 'specs-grid'
  | 'gallery' | 'feature-cards' | 'video' | 'cta-banner' | 'content-block'
  | 'accordion' | 'enquiry-form' | 'map' | 'alert' | 'divider'
  | 'testimonial' | 'comparison-table' | 'stats' | 'logo-strip' | 'embed'
  | 'pricing-table' | 'sticky-bar' | 'countdown' | 'finance-calculator'

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
  'testimonial': () => ({ title: 'What Our Customers Say', testimonials: [{ quote: '', author: '', role: '', avatar_url: '', rating: 5 }], layout: 'carousel' }),
  'comparison-table': () => ({ title: 'Compare Variants', columns: [{ label: 'Feature', highlighted: false }, { label: 'Variant 1', highlighted: false }, { label: 'Variant 2', highlighted: true }], rows: [{ feature: '', values: ['', ''] }] }),
  'stats': () => ({ title: '', stats: [{ value: '', label: '', unit: '', icon_url: '' }], layout: 'row', background: '' }),
  'logo-strip': () => ({ title: '', logos: [{ name: '', image_url: '', link_url: '' }], grayscale: true }),
  'embed': () => ({ title: '', embed_url: '', embed_type: 'iframe', aspect_ratio: '16:9', max_width: '' }),
  'pricing-table': () => ({ title: 'Compare Variants', subtitle: '', tiers: [{ name: 'Base', price: '$29,990', price_suffix: 'Drive Away', features: [], cta_text: 'Enquire', cta_url: '#', highlighted: false, badge_text: '' }], disclaimer: '' }),
  'sticky-bar': () => ({ position: 'bottom', model_name: '', price_text: '', buttons: [{ text: 'Enquire Now', url: '#', variant: 'primary' }], show_after_scroll_px: 300, background_color: '' }),
  'countdown': () => ({ title: '', subtitle: '', target_date: '', expired_message: 'This offer has ended.', cta_text: '', cta_url: '', background_color: '', background_image_url: '' }),
  'finance-calculator': () => ({ title: 'Finance Calculator', subtitle: 'Estimate your repayments', default_price: 40000, default_deposit: 5000, default_term_months: 60, default_rate: 6.5, min_deposit: 0, max_term: 84, cta_text: 'Apply for Finance', cta_url: '#', disclaimer: 'Indicative repayments only. Contact your dealer for a personalised quote.' }),
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

  // Testimonial
  { id: 'testimonial-carousel', name: 'Customer Reviews Carousel', description: 'Scrollable customer testimonials with ratings', type: 'testimonial', data: { title: 'What Our Customers Say', layout: 'carousel', testimonials: [{ quote: '', author: '', role: 'Owner', rating: 5 }] } },
  { id: 'testimonial-grid', name: 'Reviews Grid', description: 'Grid of customer review cards', type: 'testimonial', data: { title: 'Customer Reviews', layout: 'grid', testimonials: [{ quote: '', author: '', role: 'Owner', rating: 5 }, { quote: '', author: '', role: 'Owner', rating: 5 }] } },

  // Comparison Table
  { id: 'comparison-variants', name: 'Variant Comparison', description: 'Side-by-side variant feature comparison', type: 'comparison-table', data: { title: 'Compare Variants', columns: [{ label: 'Feature' }, { label: 'Base' }, { label: 'Sport', highlighted: true }, { label: 'GT' }], rows: [{ feature: 'Engine', values: ['2.0L', '2.0L Turbo', '2.5L Turbo'] }, { feature: 'Power', values: ['150kW', '180kW', '220kW'] }] } },
  { id: 'comparison-models', name: 'Model Comparison', description: 'Compare across different models', type: 'comparison-table', data: { title: 'Compare Models', columns: [{ label: 'Feature' }, { label: 'Model A' }, { label: 'Model B' }], rows: [{ feature: '', values: ['', ''] }] } },

  // Stats
  { id: 'stats-performance', name: 'Performance Stats', description: 'Key performance figures in a row', type: 'stats', data: { title: 'Performance', layout: 'row', stats: [{ value: '3.5', label: '0-100 km/h', unit: 'sec' }, { value: '250', label: 'Top Speed', unit: 'km/h' }, { value: '350', label: 'Power', unit: 'kW' }] } },
  { id: 'stats-highlights', name: 'Vehicle Highlights', description: 'Key vehicle stats in a grid', type: 'stats', data: { title: 'At a Glance', layout: 'grid', stats: [{ value: '500', label: 'Range', unit: 'km' }, { value: '5.2', label: 'Fuel Economy', unit: 'L/100km' }, { value: '3,500', label: 'Towing Capacity', unit: 'kg' }, { value: '5', label: 'Safety Rating', unit: 'stars' }] } },

  // Logo Strip
  { id: 'logo-awards', name: 'Awards & Recognition', description: 'Row of award and certification logos', type: 'logo-strip', data: { title: 'Awards & Recognition', grayscale: false, logos: [{ name: 'ANCAP 5 Star', image_url: '' }, { name: 'Good Design Award', image_url: '' }] } },
  { id: 'logo-partners', name: 'Partner Logos', description: 'Greyscale partner/sponsor logo strip', type: 'logo-strip', data: { title: '', grayscale: true, logos: [{ name: '', image_url: '' }] } },

  // Embed
  { id: 'embed-configurator', name: '3D Configurator', description: 'Embedded vehicle configurator or 3D viewer', type: 'embed', data: { title: 'Build Your Own', embed_url: '', embed_type: 'iframe', aspect_ratio: '16:9' } },
  { id: 'embed-virtual-tour', name: 'Virtual Showroom', description: 'Embedded 360 virtual tour', type: 'embed', data: { title: 'Virtual Showroom', embed_url: '', embed_type: 'iframe', aspect_ratio: '16:9' } },

  // Pricing Table
  { id: 'pricing-variants', name: 'Variant Pricing', description: 'Side-by-side trim/variant pricing cards', type: 'pricing-table', data: { title: 'Choose Your Variant', tiers: [{ name: 'Base', price: '$29,990', price_suffix: 'Drive Away', features: ['2.0L Engine', 'Apple CarPlay', '17" Alloys'], cta_text: 'Enquire', cta_url: '#' }, { name: 'Sport', price: '$34,990', price_suffix: 'Drive Away', features: ['2.0L Turbo', 'Leather Seats', '19" Alloys', 'Sunroof'], cta_text: 'Enquire', cta_url: '#', highlighted: true, badge_text: 'Most Popular' }, { name: 'GT', price: '$42,990', price_suffix: 'Drive Away', features: ['2.5L Turbo', 'Full Leather', '20" Alloys', 'Head-Up Display', 'Bose Audio'], cta_text: 'Enquire', cta_url: '#' }] } },
  { id: 'pricing-simple', name: 'Simple Price List', description: 'Clean price list with CTA', type: 'pricing-table', data: { title: 'Pricing', tiers: [{ name: 'Model', price: 'From $XX,XXX', features: [], cta_text: 'Get Quote', cta_url: '#' }] } },

  // Sticky Bar
  { id: 'sticky-bottom', name: 'Bottom Sticky Bar', description: 'Persistent bar at bottom with price and CTAs', type: 'sticky-bar', data: { position: 'bottom', model_name: 'Model Name', price_text: 'From $29,990', buttons: [{ text: 'Build & Price', url: '#', variant: 'primary' }, { text: 'Book Test Drive', url: '#', variant: 'secondary' }], show_after_scroll_px: 300 } },
  { id: 'sticky-top', name: 'Top Sticky Bar', description: 'Persistent bar at top with model info', type: 'sticky-bar', data: { position: 'top', model_name: 'Model Name', price_text: '', buttons: [{ text: 'Enquire Now', url: '#', variant: 'primary' }], show_after_scroll_px: 500 } },

  // Countdown
  { id: 'countdown-launch', name: 'Vehicle Launch', description: 'Countdown to new model launch date', type: 'countdown', data: { title: 'Coming Soon', subtitle: 'The all-new model is almost here', target_date: '', expired_message: 'Now Available!', cta_text: 'Register Interest', cta_url: '#', background_color: '#0f172a' } },
  { id: 'countdown-offer', name: 'Limited Offer', description: 'Countdown for time-limited promotion', type: 'countdown', data: { title: 'Limited Time Offer', subtitle: 'Don\'t miss out on driveaway pricing', target_date: '', expired_message: 'This offer has ended.', cta_text: 'View Offer', cta_url: '#', background_color: '#991b1b' } },

  // Finance Calculator
  { id: 'finance-standard', name: 'Finance Calculator', description: 'Interactive loan repayment estimator', type: 'finance-calculator', data: { title: 'Finance Calculator', subtitle: 'Estimate your repayments', default_price: 40000, default_deposit: 5000, default_term_months: 60, default_rate: 6.5, min_deposit: 0, max_term: 84, cta_text: 'Apply for Finance', cta_url: '#', disclaimer: 'Indicative repayments only. Contact your dealer for a personalised quote.' } },
  { id: 'finance-compact', name: 'Compact Calculator', description: 'Simplified repayment calculator', type: 'finance-calculator', data: { title: 'Estimate Repayments', default_price: 35000, default_deposit: 3000, default_term_months: 48, default_rate: 7.0, min_deposit: 0, max_term: 60, cta_text: 'Get Finance Quote', cta_url: '#' } },
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
  'testimonial': { label: 'Testimonial', description: 'Customer reviews and quotes' },
  'comparison-table': { label: 'Comparison Table', description: 'Side-by-side feature comparison' },
  'stats': { label: 'Stats', description: 'Key numbers and highlight figures' },
  'logo-strip': { label: 'Logo Strip', description: 'Row of logos, awards, or badges' },
  'embed': { label: 'Embed', description: 'Generic iframe or script embed' },
  'pricing-table': { label: 'Pricing Table', description: 'Variant/trim pricing comparison cards' },
  'sticky-bar': { label: 'Sticky Bar', description: 'Persistent floating bar with CTAs' },
  'countdown': { label: 'Countdown', description: 'Timer counting down to a date' },
  'finance-calculator': { label: 'Finance Calculator', description: 'Interactive loan repayment estimator' },
}
