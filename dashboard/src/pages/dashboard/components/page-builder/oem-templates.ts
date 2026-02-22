import type { PageSectionType } from './section-templates'

export interface OemSectionTemplate {
  id: string
  oem_id: string // e.g. 'kia-au', 'toyota-au', or '*' for universal
  name: string
  description: string
  type: PageSectionType
  tags: string[]
  data: Record<string, any>
}

export const OEM_CURATED_TEMPLATES: OemSectionTemplate[] = [
  // Kia — dark hero with gradient overlay
  {
    id: 'oem-kia-hero-dark',
    oem_id: 'kia-au',
    name: 'Kia Dark Hero',
    description: 'Dark gradient hero with bold heading and driveaway price',
    type: 'hero',
    tags: ['dark', 'gradient', 'driveaway'],
    data: {
      heading: 'The New Sportage',
      sub_heading: 'From $36,990 DriveAway',
      cta_text: 'Build & Price',
      cta_url: '#build',
      desktop_image_url: '',
      mobile_image_url: '',
    },
  },
  {
    id: 'oem-kia-tabs-features',
    oem_id: 'kia-au',
    name: 'Kia Feature Tabs',
    description: 'Tabbed feature showcase with side images and bullet points',
    type: 'tabs',
    tags: ['features', 'bullets', 'side-image'],
    data: {
      title: 'Designed to impress.',
      category: 'Features',
      tabs: [
        { label: 'Design', content_html: '<ul><li>Bold Tiger Nose grille</li><li>LED headlamps</li></ul>', image_url: '', image_disclaimer: '', disclaimer: '' },
        { label: 'Performance', content_html: '<ul><li>Smartstream engine</li><li>8-speed DCT</li></ul>', image_url: '', image_disclaimer: '', disclaimer: '' },
        { label: 'Technology', content_html: '<ul><li>12.3" dual displays</li><li>Wireless Apple CarPlay</li></ul>', image_url: '', image_disclaimer: '', disclaimer: '' },
      ],
      default_tab: 0,
    },
  },

  // Toyota — split layout CTA
  {
    id: 'oem-toyota-cta-split',
    oem_id: 'toyota-au',
    name: 'Toyota Split CTA',
    description: 'Two-column CTA with bold heading and dealer link',
    type: 'cta-banner',
    tags: ['split-layout', 'dealer', 'bold'],
    data: {
      heading: 'Find Your Perfect Match',
      body: 'Visit your local Toyota dealer to experience the range.',
      cta_text: 'Find a Dealer',
      cta_url: '#dealer',
      background_color: '#1a1a1a',
    },
  },
  {
    id: 'oem-toyota-hero-cinematic',
    oem_id: 'toyota-au',
    name: 'Toyota Cinematic Hero',
    description: 'Wide cinematic hero with minimal text overlay',
    type: 'hero',
    tags: ['cinematic', 'minimal', 'wide'],
    data: {
      heading: 'Beyond Zero',
      sub_heading: 'The future of driving',
      cta_text: 'Explore Range',
      cta_url: '#range',
      desktop_image_url: '',
      mobile_image_url: '',
    },
  },

  // Hyundai — feature tabs with rich content
  {
    id: 'oem-hyundai-tabs-tech',
    oem_id: 'hyundai-au',
    name: 'Hyundai Tech Tabs',
    description: 'Technology feature tabs with detailed descriptions',
    type: 'tabs',
    tags: ['technology', 'detailed', 'rich-content'],
    data: {
      title: 'Advanced Technology',
      category: 'Technology',
      tabs: [
        { label: 'Connected', content_html: '<p>Bluelink connected car services keep you in control.</p>', image_url: '', image_disclaimer: '', disclaimer: '' },
        { label: 'Safety', content_html: '<p>Hyundai SmartSense active safety suite.</p>', image_url: '', image_disclaimer: '', disclaimer: '' },
      ],
      default_tab: 0,
    },
  },

  // Mazda — minimal intro section
  {
    id: 'oem-mazda-intro-minimal',
    oem_id: 'mazda-au',
    name: 'Mazda Minimal Intro',
    description: 'Clean introduction with Kodo design language',
    type: 'intro',
    tags: ['minimal', 'clean', 'kodo'],
    data: {
      title: 'Crafted for the driver',
      body_html: '<p>Every detail refined through Kodo design philosophy — the soul of motion brought to life.</p>',
      image_url: '',
      image_position: 'right',
    },
  },

  // Ford — bold CTA banner
  {
    id: 'oem-ford-cta-bold',
    oem_id: 'ford-au',
    name: 'Ford Bold CTA',
    description: 'High-contrast CTA banner with strong action text',
    type: 'cta-banner',
    tags: ['bold', 'high-contrast', 'action'],
    data: {
      heading: 'Built Ford Tough',
      body: 'Configure your perfect vehicle and get a quote today.',
      cta_text: 'Build & Price',
      cta_url: '#configure',
      background_color: '#003478',
    },
  },

  // GWM — feature cards grid
  {
    id: 'oem-gwm-features-grid',
    oem_id: 'gwm-au',
    name: 'GWM Feature Grid',
    description: '4-column feature cards highlighting key specs',
    type: 'feature-cards',
    tags: ['grid', 'specs', '4-column'],
    data: {
      title: 'Intelligent Features',
      columns: 4,
      cards: [
        { title: 'Safety', description: 'Advanced driver assistance systems', image_url: '' },
        { title: 'Power', description: 'High-performance powertrain', image_url: '' },
        { title: 'Comfort', description: 'Premium interior appointments', image_url: '' },
        { title: 'Technology', description: 'Connected infotainment system', image_url: '' },
      ],
    },
  },

  // Universal — colour picker
  {
    id: 'oem-universal-colors',
    oem_id: '*',
    name: 'Colour Picker',
    description: 'Vehicle colour selector with swatches and hero images',
    type: 'color-picker',
    tags: ['universal', 'interactive', 'colours'],
    data: {
      title: 'Choose Your Colour',
      colors: [],
    },
  },

  // Universal — specs grid
  {
    id: 'oem-universal-specs',
    oem_id: '*',
    name: 'Specifications Grid',
    description: 'Technical specs comparison table',
    type: 'specs-grid',
    tags: ['universal', 'data', 'comparison'],
    data: {
      title: 'Specifications',
      categories: [],
    },
  },
]
