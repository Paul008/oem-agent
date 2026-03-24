import { SECTION_DEFAULTS, type PageSectionType } from './section-templates'

/**
 * Section Converter — converts a section from one type to another,
 * transferring compatible data fields and filling defaults for the rest.
 */

/** Map of which types each source type can convert to, with data transfer logic */
type ConversionFn = (source: Record<string, any>) => Record<string, any>
type ConversionMap = Partial<Record<PageSectionType, ConversionFn>>

const CONVERSIONS: Record<string, ConversionMap> = {
  // ---- HERO ----
  'hero': {
    'cta-banner': (s) => ({
      heading: s.heading || '',
      body: s.sub_heading || '',
      cta_text: s.cta_text || '',
      cta_url: s.cta_url || '',
      background_color: '',
    }),
    'intro': (s) => ({
      title: s.heading || '',
      body_html: s.sub_heading ? `<p>${s.sub_heading}</p>` : '',
      image_url: s.desktop_image_url || '',
      image_position: 'right',
    }),
    'content-block': (s) => ({
      title: s.heading || '',
      content_html: s.sub_heading ? `<p>${s.sub_heading}</p>` : '',
      layout: 'full-width',
      image_url: s.desktop_image_url || '',
      background: '',
    }),
    'video': (s) => ({
      title: s.heading || '',
      video_url: s.video_url || '',
      poster_url: s.desktop_image_url || '',
      autoplay: false,
    }),
    'image': (s) => ({
      desktop_image_url: s.desktop_image_url || '',
      mobile_image_url: s.mobile_image_url || '',
      alt: s.heading || '',
      caption: s.sub_heading || '',
      layout: 'full-width',
      aspect_ratio: 'auto',
      rounded: false,
      shadow: false,
    }),
  },

  // ---- IMAGE ----
  'image': {
    'hero': (s) => ({
      heading: s.alt || s.caption || '',
      sub_heading: s.caption || '',
      cta_text: '',
      cta_url: '',
      desktop_image_url: s.desktop_image_url || '',
      mobile_image_url: s.mobile_image_url || '',
    }),
    'gallery': (s) => ({
      title: s.caption || '',
      images: [{ url: s.desktop_image_url || '', alt: s.alt || '', caption: s.caption || '' }],
      layout: 'grid',
    }),
    'image-showcase': (s) => ({
      title: s.caption || '',
      images: [{ url: s.desktop_image_url || '', alt: s.alt || '', caption: s.caption || '', description: '', overlay_position: 'bottom-left' }],
      layout: 'stacked',
      height: 'large',
      overlay_style: 'dark',
    }),
    'content-block': (s) => ({
      title: s.caption || '',
      content_html: '',
      layout: s.layout === 'full-width' ? 'full-width' : 'contained',
      image_url: s.desktop_image_url || '',
      background: '',
    }),
    'intro': (s) => ({
      title: s.caption || '',
      body_html: '',
      image_url: s.desktop_image_url || '',
      image_position: 'right',
    }),
  },

  // ---- INTRO ----
  'intro': {
    'hero': (s) => ({
      heading: s.title || '',
      sub_heading: stripHtml(s.body_html),
      cta_text: '',
      cta_url: '',
      desktop_image_url: s.image_url || '',
      mobile_image_url: '',
    }),
    'content-block': (s) => ({
      title: s.title || '',
      content_html: s.body_html || '',
      layout: s.image_url ? 'two-column' : 'contained',
      image_url: s.image_url || '',
      background: '',
    }),
    'cta-banner': (s) => ({
      heading: s.title || '',
      body: stripHtml(s.body_html),
      cta_text: '',
      cta_url: '',
      background_color: '',
    }),
  },

  // ---- GALLERY ----
  'gallery': {
    'feature-cards': (s) => ({
      title: s.title || '',
      cards: (s.images || []).map((img: any) => ({
        title: img.caption || img.alt || '',
        description: img.description || '',
        image_url: img.url || '',
      })),
      columns: Math.min((s.images || []).length, 4) as 2 | 3 | 4 || 3,
    }),
    'tabs': (s) => ({
      title: s.title || '',
      variant: 'default',
      theme: 'light',
      image_position: 'right',
      tabs: (s.images || []).map((img: any) => ({
        label: img.caption || img.alt || 'Image',
        content_html: img.description ? `<p>${img.description}</p>` : '',
        image_url: img.url || '',
        image_disclaimer: '',
        disclaimer: '',
      })),
      default_tab: 0,
    }),
    'testimonial': (s) => ({
      title: s.title || '',
      layout: s.layout === 'grid' ? 'grid' : 'carousel',
      testimonials: (s.images || []).map((img: any) => ({
        quote: img.caption || img.description || '',
        author: img.alt || '',
        role: '',
        avatar_url: img.url || '',
        rating: 5,
      })),
    }),
    'logo-strip': (s) => ({
      title: s.title || '',
      logos: (s.images || []).map((img: any) => ({
        name: img.alt || img.caption || '',
        image_url: img.url || '',
        link_url: '',
      })),
      grayscale: true,
    }),
    'image-showcase': (s) => ({
      title: s.title || '',
      images: (s.images || []).map((img: any) => ({
        url: img.url || '',
        alt: img.alt || '',
        caption: img.caption || '',
        description: img.description || '',
        overlay_position: 'bottom-left',
      })),
      layout: 'stacked',
      height: 'large',
      overlay_style: 'dark',
    }),
    'hero': (s) => ({
      heading: s.title || '',
      sub_heading: '',
      cta_text: '',
      cta_url: '',
      desktop_image_url: (s.images || [])[0]?.url || '',
      mobile_image_url: '',
    }),
    'content-block': (s) => ({
      title: s.title || '',
      content_html: (s.images || []).map((img: any) => img.caption || img.alt || '').filter(Boolean).join('<br>'),
      layout: 'full-width',
      image_url: (s.images || [])[0]?.url || '',
      background: '',
    }),
    'image': (s) => ({
      desktop_image_url: (s.images || [])[0]?.url || '',
      mobile_image_url: '',
      alt: (s.images || [])[0]?.alt || '',
      caption: (s.images || [])[0]?.caption || '',
      layout: 'full-width',
      aspect_ratio: 'auto',
    }),
  },

  // ---- IMAGE SHOWCASE ----
  'image-showcase': {
    'gallery': (s) => ({
      title: s.title || '',
      images: (s.images || []).map((img: any) => ({
        url: img.url || '',
        alt: img.alt || '',
        caption: img.caption || '',
        description: img.description || '',
      })),
      layout: 'grid',
    }),
    'hero': (s) => ({
      heading: (s.images || [])[0]?.caption || s.title || '',
      sub_heading: (s.images || [])[0]?.description || '',
      cta_text: '',
      cta_url: '',
      desktop_image_url: (s.images || [])[0]?.url || '',
      mobile_image_url: '',
    }),
    'feature-cards': (s) => ({
      title: s.title || '',
      cards: (s.images || []).map((img: any) => ({
        title: img.caption || img.alt || '',
        description: img.description || '',
        image_url: img.url || '',
      })),
      columns: Math.min((s.images || []).length, 4) as 2 | 3 | 4 || 3,
    }),
    'content-block': (s) => ({
      title: s.title || '',
      content_html: '',
      layout: 'full-width',
      image_url: (s.images || [])[0]?.url || '',
      background: '',
    }),
    'image': (s) => ({
      desktop_image_url: (s.images || [])[0]?.url || '',
      mobile_image_url: '',
      alt: (s.images || [])[0]?.alt || '',
      caption: (s.images || [])[0]?.caption || '',
      layout: 'full-width',
      aspect_ratio: 'auto',
    }),
  },

  // ---- FEATURE CARDS ----
  'feature-cards': {
    'gallery': (s) => ({
      title: s.title || '',
      images: (s.cards || []).filter((c: any) => c.image_url).map((c: any) => ({
        url: c.image_url || '',
        alt: c.title || '',
        caption: c.title || '',
        description: c.description || '',
      })),
      layout: 'grid',
    }),
    'tabs': (s) => ({
      title: s.title || '',
      variant: 'default',
      theme: 'light',
      image_position: 'right',
      tabs: (s.cards || []).map((c: any) => ({
        label: c.title || 'Card',
        content_html: c.description ? `<p>${c.description}</p>` : '',
        image_url: c.image_url || '',
        image_disclaimer: '',
        disclaimer: '',
      })),
      default_tab: 0,
    }),
    'accordion': (s) => ({
      title: s.title || '',
      items: (s.cards || []).map((c: any) => ({
        question: c.title || '',
        answer: c.description || '',
      })),
      section_id: '',
    }),
    'stats': (s) => ({
      title: s.title || '',
      stats: (s.cards || []).map((c: any) => ({
        value: '',
        label: c.title || '',
        unit: '',
        icon_url: c.image_url || '',
      })),
      layout: 'grid',
      background: '',
    }),
    'testimonial': (s) => ({
      title: s.title || '',
      layout: 'grid',
      testimonials: (s.cards || []).map((c: any) => ({
        quote: c.description || '',
        author: c.title || '',
        role: '',
        avatar_url: c.image_url || '',
        rating: 5,
      })),
    }),
    'logo-strip': (s) => ({
      title: s.title || '',
      logos: (s.cards || []).filter((c: any) => c.image_url).map((c: any) => ({
        name: c.title || '',
        image_url: c.image_url || '',
        link_url: '',
      })),
      grayscale: true,
    }),
  },

  // ---- TABS ----
  'tabs': {
    'accordion': (s) => ({
      title: s.title || '',
      items: (s.tabs || []).map((t: any) => ({
        question: t.label || '',
        answer: t.content_html || '',
      })),
      section_id: '',
    }),
    'feature-cards': (s) => ({
      title: s.title || '',
      cards: (s.tabs || []).map((t: any) => ({
        title: t.label || '',
        description: stripHtml(t.content_html),
        image_url: t.image_url || '',
      })),
      columns: Math.min((s.tabs || []).length, 4) as 2 | 3 | 4 || 3,
    }),
    'gallery': (s) => ({
      title: s.title || '',
      images: (s.tabs || []).filter((t: any) => t.image_url).map((t: any) => ({
        url: t.image_url || '',
        alt: t.label || '',
        caption: t.label || '',
        description: stripHtml(t.content_html),
      })),
      layout: 'carousel',
    }),
  },

  // ---- ACCORDION ----
  'accordion': {
    'tabs': (s) => ({
      title: s.title || '',
      variant: 'default',
      theme: 'light',
      image_position: 'right',
      tabs: (s.items || []).map((item: any) => ({
        label: item.question || '',
        content_html: item.answer || '',
        image_url: '',
        image_disclaimer: '',
        disclaimer: '',
      })),
      default_tab: 0,
    }),
    'feature-cards': (s) => ({
      title: s.title || '',
      cards: (s.items || []).map((item: any) => ({
        title: item.question || '',
        description: stripHtml(item.answer),
        image_url: '',
      })),
      columns: Math.min((s.items || []).length, 4) as 2 | 3 | 4 || 3,
    }),
    'content-block': (s) => ({
      title: s.title || '',
      content_html: (s.items || []).map((item: any) =>
        `<h3>${item.question || ''}</h3>\n<p>${item.answer || ''}</p>`
      ).join('\n'),
      layout: 'contained',
      background: '',
      image_url: '',
    }),
  },

  // ---- CTA BANNER ----
  'cta-banner': {
    'hero': (s) => ({
      heading: s.heading || '',
      sub_heading: s.body || '',
      cta_text: s.cta_text || '',
      cta_url: s.cta_url || '',
      desktop_image_url: '',
      mobile_image_url: '',
    }),
    'alert': (s) => ({
      title: s.heading || '',
      message: s.body || '',
      variant: 'info',
      dismissible: true,
    }),
    'content-block': (s) => ({
      title: s.heading || '',
      content_html: s.body ? `<p>${s.body}</p>` : '',
      layout: 'contained',
      background: s.background_color || '',
      image_url: '',
    }),
  },

  // ---- CONTENT BLOCK ----
  'content-block': {
    'intro': (s) => ({
      title: s.title || '',
      body_html: s.content_html || '',
      image_url: s.image_url || '',
      image_position: 'right',
    }),
    'hero': (s) => ({
      heading: s.title || '',
      sub_heading: stripHtml(s.content_html),
      cta_text: '',
      cta_url: '',
      desktop_image_url: s.image_url || '',
      mobile_image_url: '',
    }),
    'cta-banner': (s) => ({
      heading: s.title || '',
      body: stripHtml(s.content_html),
      cta_text: '',
      cta_url: '',
      background_color: s.background || '',
    }),
  },

  // ---- ALERT ----
  'alert': {
    'cta-banner': (s) => ({
      heading: s.title || '',
      body: s.message || '',
      cta_text: '',
      cta_url: '',
      background_color: '',
    }),
    'content-block': (s) => ({
      title: s.title || '',
      content_html: s.message ? `<p>${s.message}</p>` : '',
      layout: 'contained',
      background: '',
      image_url: '',
    }),
  },

  // ---- VIDEO ----
  'video': {
    'hero': (s) => ({
      heading: s.title || '',
      sub_heading: '',
      cta_text: '',
      cta_url: '',
      desktop_image_url: s.poster_url || '',
      mobile_image_url: '',
      video_url: s.video_url || '',
    }),
    'embed': (s) => ({
      title: s.title || '',
      embed_url: s.video_url || '',
      embed_type: 'iframe',
      aspect_ratio: '16:9',
      max_width: '',
    }),
  },

  // ---- MAP ----
  'map': {
    'embed': (s) => ({
      title: s.title || '',
      embed_url: s.embed_url || '',
      embed_type: 'iframe',
      aspect_ratio: '16:9',
      max_width: '',
    }),
  },

  // ---- TESTIMONIAL ----
  'testimonial': {
    'feature-cards': (s) => ({
      title: s.title || '',
      cards: (s.testimonials || []).map((t: any) => ({
        title: t.author || '',
        description: t.quote || '',
        image_url: t.avatar_url || '',
      })),
      columns: Math.min((s.testimonials || []).length, 4) as 2 | 3 | 4 || 3,
    }),
    'gallery': (s) => ({
      title: s.title || '',
      images: (s.testimonials || []).filter((t: any) => t.avatar_url).map((t: any) => ({
        url: t.avatar_url || '',
        alt: t.author || '',
        caption: t.author || '',
        description: t.quote || '',
      })),
      layout: s.layout === 'grid' ? 'grid' : 'carousel',
    }),
    'accordion': (s) => ({
      title: s.title || '',
      items: (s.testimonials || []).map((t: any) => ({
        question: `${t.author || 'Customer'}${t.role ? ` — ${t.role}` : ''}`,
        answer: t.quote || '',
      })),
      section_id: '',
    }),
  },

  // ---- COMPARISON TABLE ----
  'comparison-table': {
    'pricing-table': (s) => ({
      title: s.title || '',
      subtitle: '',
      tiers: (s.columns || []).slice(1).map((col: any, colIdx: number) => ({
        name: col.label || '',
        price: '',
        price_suffix: '',
        features: (s.rows || []).map((r: any) => `${r.feature}: ${(r.values || [])[colIdx] || '-'}`),
        cta_text: 'Enquire',
        cta_url: '#',
        highlighted: !!col.highlighted,
        badge_text: '',
      })),
      disclaimer: '',
    }),
    'specs-grid': (s) => ({
      title: s.title || '',
      categories: [{
        name: 'Comparison',
        specs: (s.rows || []).map((r: any) => ({
          label: r.feature || '',
          value: (r.values || []).join(' / '),
        })),
      }],
    }),
    'accordion': (s) => ({
      title: s.title || '',
      items: (s.rows || []).map((r: any) => ({
        question: r.feature || '',
        answer: (s.columns || []).slice(1).map((col: any, i: number) =>
          `${col.label}: ${(r.values || [])[i] || '-'}`
        ).join('\n'),
      })),
      section_id: '',
    }),
    'tabs': (s) => ({
      title: s.title || '',
      variant: 'default',
      theme: 'light',
      image_position: 'right',
      tabs: (s.columns || []).slice(1).map((col: any, colIdx: number) => ({
        label: col.label || `Column ${colIdx + 1}`,
        content_html: (s.rows || []).map((r: any) =>
          `<p><strong>${r.feature}:</strong> ${(r.values || [])[colIdx] || '-'}</p>`
        ).join('\n'),
        image_url: '',
        image_disclaimer: '',
        disclaimer: '',
      })),
      default_tab: 0,
    }),
  },

  // ---- SPECS GRID ----
  'specs-grid': {
    'comparison-table': (s) => {
      const allSpecs = (s.categories || []).flatMap((cat: any) => cat.specs || [])
      return {
        title: s.title || '',
        columns: [{ label: 'Spec' }, { label: 'Value' }],
        rows: allSpecs.map((spec: any) => ({
          feature: spec.label || '',
          values: [spec.unit ? `${spec.value} ${spec.unit}` : spec.value || ''],
        })),
      }
    },
    'accordion': (s) => ({
      title: s.title || '',
      items: (s.categories || []).map((cat: any) => ({
        question: cat.name || '',
        answer: (cat.specs || []).map((spec: any) =>
          `${spec.label}: ${spec.value}${spec.unit ? ' ' + spec.unit : ''}`
        ).join('\n'),
      })),
      section_id: '',
    }),
  },

  // ---- STATS ----
  'stats': {
    'feature-cards': (s) => ({
      title: s.title || '',
      cards: (s.stats || []).map((stat: any) => ({
        title: `${stat.value}${stat.unit ? ' ' + stat.unit : ''}`,
        description: stat.label || '',
        image_url: stat.icon_url || '',
      })),
      columns: Math.min((s.stats || []).length, 4) as 2 | 3 | 4 || 3,
    }),
    'specs-grid': (s) => ({
      title: s.title || '',
      categories: [{
        name: 'Key Stats',
        specs: (s.stats || []).map((stat: any) => ({
          label: stat.label || '',
          value: stat.value || '',
          unit: stat.unit || '',
        })),
      }],
    }),
    'comparison-table': (s) => ({
      title: s.title || '',
      columns: [{ label: 'Stat' }, { label: 'Value' }],
      rows: (s.stats || []).map((stat: any) => ({
        feature: stat.label || '',
        values: [stat.unit ? `${stat.value} ${stat.unit}` : stat.value || ''],
      })),
    }),
  },

  // ---- LOGO STRIP ----
  'logo-strip': {
    'gallery': (s) => ({
      title: s.title || '',
      images: (s.logos || []).map((logo: any) => ({
        url: logo.image_url || '',
        alt: logo.name || '',
        caption: logo.name || '',
      })),
      layout: 'grid',
    }),
    'feature-cards': (s) => ({
      title: s.title || '',
      cards: (s.logos || []).map((logo: any) => ({
        title: logo.name || '',
        description: '',
        image_url: logo.image_url || '',
      })),
      columns: Math.min((s.logos || []).length, 4) as 2 | 3 | 4 || 3,
    }),
  },

  // ---- EMBED ----
  'embed': {
    'map': (s) => ({
      title: s.title || '',
      sub_heading: '',
      embed_url: s.embed_url || '',
    }),
    'video': (s) => ({
      title: s.title || '',
      video_url: s.embed_url || '',
      poster_url: '',
      autoplay: false,
    }),
  },

  // ---- ENQUIRY FORM ----
  'enquiry-form': {
    'cta-banner': (s) => ({
      heading: s.heading || '',
      body: s.sub_heading || '',
      cta_text: s.form_type === 'test-drive' ? 'Book a Test Drive' : 'Enquire Now',
      cta_url: '#',
      background_color: '',
    }),
  },

  // ---- PRICING TABLE ----
  'pricing-table': {
    'comparison-table': (s) => {
      const tiers = s.tiers || []
      const allFeatures = [...new Set(tiers.flatMap((t: any) => t.features || []))]
      return {
        title: s.title || '',
        columns: [{ label: 'Feature' }, ...tiers.map((t: any) => ({ label: t.name || '', highlighted: !!t.highlighted }))],
        rows: [
          { feature: 'Price', values: tiers.map((t: any) => `${t.price}${t.price_suffix ? ' ' + t.price_suffix : ''}`) },
          ...allFeatures.map((f: string) => ({
            feature: f,
            values: tiers.map((t: any) => (t.features || []).includes(f) ? '\u2713' : '\u2717'),
          })),
        ],
      }
    },
    'feature-cards': (s) => ({
      title: s.title || '',
      cards: (s.tiers || []).map((t: any) => ({
        title: `${t.name} — ${t.price}`,
        description: (t.features || []).join(', '),
        image_url: '',
      })),
      columns: Math.min((s.tiers || []).length, 4) as 2 | 3 | 4 || 3,
    }),
    'accordion': (s) => ({
      title: s.title || '',
      items: (s.tiers || []).map((t: any) => ({
        question: `${t.name} — ${t.price}`,
        answer: (t.features || []).map((f: string) => `• ${f}`).join('\n'),
      })),
      section_id: '',
    }),
  },

  // ---- STICKY BAR ----
  'sticky-bar': {
    'cta-banner': (s) => ({
      heading: s.model_name || '',
      body: s.price_text || '',
      cta_text: (s.buttons || [])[0]?.text || '',
      cta_url: (s.buttons || [])[0]?.url || '#',
      background_color: s.background_color || '',
    }),
    'hero': (s) => ({
      heading: s.model_name || '',
      sub_heading: s.price_text || '',
      cta_text: (s.buttons || [])[0]?.text || '',
      cta_url: (s.buttons || [])[0]?.url || '#',
      desktop_image_url: '',
      mobile_image_url: '',
    }),
  },

  // ---- COUNTDOWN ----
  'countdown': {
    'cta-banner': (s) => ({
      heading: s.title || '',
      body: s.subtitle || '',
      cta_text: s.cta_text || '',
      cta_url: s.cta_url || '#',
      background_color: s.background_color || '',
    }),
    'alert': (s) => ({
      title: s.title || '',
      message: s.subtitle || '',
      variant: 'info',
      dismissible: true,
    }),
    'hero': (s) => ({
      heading: s.title || '',
      sub_heading: s.subtitle || '',
      cta_text: s.cta_text || '',
      cta_url: s.cta_url || '#',
      desktop_image_url: s.background_image_url || '',
      mobile_image_url: '',
    }),
  },

  // ---- FINANCE CALCULATOR ----
  'finance-calculator': {
    'cta-banner': (s) => ({
      heading: s.title || 'Finance Available',
      body: s.subtitle || '',
      cta_text: s.cta_text || 'Get Quote',
      cta_url: s.cta_url || '#',
      background_color: '',
    }),
    'stats': (s) => ({
      title: s.title || '',
      stats: [
        { value: `$${(s.default_price || 0).toLocaleString()}`, label: 'From', unit: '' },
        { value: `${s.default_rate || 0}%`, label: 'Interest Rate', unit: '' },
        { value: `${s.default_term_months || 60}`, label: 'Term', unit: 'months' },
      ],
      layout: 'row',
      background: '',
    }),
    'pricing-table': (s) => ({
      title: s.title || '',
      subtitle: s.subtitle || '',
      tiers: [{
        name: 'Finance',
        price: `$${(s.default_price || 0).toLocaleString()}`,
        price_suffix: '',
        features: [
          `${s.default_rate || 0}% interest rate`,
          `${s.default_term_months || 60} month term`,
          `$${(s.default_deposit || 0).toLocaleString()} deposit`,
        ],
        cta_text: s.cta_text || 'Apply',
        cta_url: s.cta_url || '#',
        highlighted: false,
        badge_text: '',
      }],
      disclaimer: s.disclaimer || '',
    }),
  },

  // ---- Add pricing-table as target for comparison-table and specs-grid ----
  // (These are handled by adding to existing entries above)
}

/**
 * Get all section types that a given source type can be converted to.
 */
export function getConvertibleTypes(sourceType: PageSectionType): PageSectionType[] {
  const map = CONVERSIONS[sourceType]
  if (!map) return []
  return Object.keys(map) as PageSectionType[]
}

/**
 * Convert a section to a new type, transferring compatible data.
 * Returns null if conversion is not supported.
 */
export function convertSectionData(
  source: Record<string, any>,
  targetType: PageSectionType,
): Record<string, any> | null {
  const sourceType = source.type as PageSectionType
  if (sourceType === targetType) return null

  const conversionFn = CONVERSIONS[sourceType]?.[targetType]

  if (conversionFn) {
    // Use specific conversion mapping
    const converted = conversionFn(source)
    const defaults = SECTION_DEFAULTS[targetType]?.() ?? {}
    return {
      ...defaults,
      ...converted,
      type: targetType,
      id: source.id,
      order: source.order,
    }
  }

  // Fallback: create a default section with title/heading transferred
  const defaults = SECTION_DEFAULTS[targetType]?.() ?? {}
  const title = source.title || source.heading || ''
  const result: Record<string, any> = {
    ...defaults,
    type: targetType,
    id: source.id,
    order: source.order,
  }
  // Try to carry over title/heading
  if ('title' in result && title) result.title = title
  if ('heading' in result && title) result.heading = title

  return result
}

/** Strip HTML tags for plain text conversion */
function stripHtml(html: string | undefined | null): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').trim()
}
