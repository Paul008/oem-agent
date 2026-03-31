/**
 * Section Parser — Deterministic HTML → Structured Section Data
 *
 * Parses captured OEM page HTML into page builder section types
 * WITHOUT any AI/LLM calls. Pure regex-based DOM pattern matching.
 *
 * Replaces the unreliable AI-based smart-capture extraction.
 */

// ============================================================================
// Types
// ============================================================================

export type ParsedSectionType =
  | 'hero' | 'feature-cards' | 'gallery' | 'testimonial' | 'stats'
  | 'intro' | 'image' | 'cta-banner' | 'content-block' | 'heading'
  | 'video' | 'accordion'

export interface ParsedCard {
  title: string
  description: string
  image_url: string
  cta_text: string
  cta_url: string
}

export interface ParsedSection {
  type: ParsedSectionType
  data: Record<string, any>
}

// ============================================================================
// Helpers — regex-based HTML extraction (no DOMParser in CF Workers)
// ============================================================================

/** Strip HTML tags, Vue/Nuxt comments, and normalize whitespace */
function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extract first img src from an HTML fragment */
function extractFirstImgSrc(html: string): string {
  const match = html.match(/<img[^>]*\bsrc="([^"]+)"/)
  if (!match) return ''
  return match[1]
}

/** Extract all img src URLs from an HTML fragment */
function extractAllImgSrcs(html: string): string[] {
  const urls: string[] = []
  const regex = /<img[^>]*\bsrc="([^"]+)"/g
  let m
  while ((m = regex.exec(html)) !== null) {
    if (m[1] && !urls.includes(m[1])) urls.push(m[1])
  }
  return urls
}

/** Extract first heading (h1-h4) text from HTML */
function extractHeading(html: string): string {
  const match = html.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i)
  return match ? stripHtml(match[1]) : ''
}

/** Extract all headings from HTML */
function extractAllHeadings(html: string): string[] {
  const headings: string[] = []
  const regex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi
  let m
  while ((m = regex.exec(html)) !== null) {
    const text = stripHtml(m[1])
    if (text) headings.push(text)
  }
  return headings
}

/** Extract paragraph text from HTML */
function extractParagraphs(html: string): string[] {
  const paragraphs: string[] = []
  const regex = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let m
  while ((m = regex.exec(html)) !== null) {
    const text = stripHtml(m[1])
    if (text && text.length > 2) paragraphs.push(text)
  }
  return paragraphs
}

/** Extract first link (a href + text) from HTML */
function extractFirstLink(html: string): { text: string; url: string } {
  const match = html.match(/<a[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
  if (!match) return { text: '', url: '' }
  // Get text from span inside the link, or the link itself
  const spanMatch = match[2].match(/<span[^>]*>([\s\S]*?)<\/span>/i)
  const text = stripHtml(spanMatch ? spanMatch[1] : match[2])
  return { text, url: match[1] }
}

/** Check if a class string contains any of the given keywords */
function classContains(classes: string, ...keywords: string[]): boolean {
  const lower = classes.toLowerCase()
  return keywords.some(k => lower.includes(k))
}

/** Extract the class attribute from an HTML element's opening tag */
function extractClass(html: string): string {
  const match = html.match(/class="([^"]*)"/)
  return match ? match[1] : ''
}

/** Count direct child elements matching a pattern */
function findRepeatingChildren(html: string): string[] {
  // Find the repeated block pattern — look for sibling divs/articles with similar classes
  // Strategy: find all top-level child elements (not deeply nested)
  const children: string[] = []

  // Remove the outer wrapper tag to get inner content
  const innerMatch = html.match(/^<[^>]+>([\s\S]*)<\/[^>]+>$/i)
  const inner = innerMatch ? innerMatch[1] : html

  // Match direct child elements (divs, articles, lis)
  // We look for elements that each contain images and headings (card pattern)
  const blockRegex = /<(?:div|article|li)\b[^>]*class="[^"]*"[^>]*>[\s\S]*?<\/(?:div|article|li)>/gi

  // More robust: split by repeated class patterns
  // Find the first class that appears in a child element
  const firstChildClass = inner.match(/<(?:div|article|li)\b[^>]*class="([^"]*)"/)
  if (!firstChildClass) return children

  // Find a distinguishing class from the first child
  const childClasses = firstChildClass[1].split(/\s+/)
  const cardClass = childClasses.find(c =>
    c && !c.startsWith('d-') && !c.startsWith('test-') &&
    (c.includes('block') || c.includes('card') || c.includes('item') || c.includes('col') || c.includes('slide'))
  ) || childClasses.find(c => c && c.length > 3 && !c.startsWith('d-'))

  if (!cardClass) return children

  // Split the inner content by this class pattern
  const escapedClass = cardClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = inner.split(new RegExp(`(?=<(?:div|article|li)[^>]*class="[^"]*${escapedClass})`, 'i'))

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed || trimmed.length < 20) continue
    // Must contain at least an image or a heading to be a "card"
    if (/<img\b/i.test(trimmed) || /<h[1-6]\b/i.test(trimmed)) {
      children.push(trimmed)
    }
  }

  return children
}

/** Extract a video URL from HTML */
function extractVideoUrl(html: string): string {
  // Check for video src
  const videoSrc = html.match(/<video[^>]*\bsrc="([^"]+)"/)
  if (videoSrc) return videoSrc[1]
  // Check for source inside video
  const sourceSrc = html.match(/<source[^>]*\bsrc="([^"]+)"/)
  if (sourceSrc) return sourceSrc[1]
  // Check for iframe (YouTube/Vimeo)
  const iframeSrc = html.match(/<iframe[^>]*\bsrc="([^"]+)"/)
  if (iframeSrc) return iframeSrc[1]
  return ''
}

// ============================================================================
// Section Pattern Detectors
// ============================================================================

function detectHero(html: string, classes: string): ParsedSection | null {
  if (!classContains(classes, 'hero')) return null

  const heading = extractHeading(html)
  const paragraphs = extractParagraphs(html)
  const img = extractFirstImgSrc(html)
  const link = extractFirstLink(html)

  return {
    type: 'hero',
    data: {
      heading: heading || stripHtml(html).slice(0, 80),
      sub_heading: paragraphs[0] || '',
      desktop_image_url: img,
      cta_text: link.text,
      cta_url: link.url,
    },
  }
}

function detectCardGrid(html: string, classes: string): ParsedSection | null {
  const children = findRepeatingChildren(html)
  if (children.length < 2) return null

  // Check that most children have images — text-only grids are NOT card grids
  const childrenWithImages = children.filter(c => /<img\b/i.test(c))
  if (childrenWithImages.length < children.length / 2) return null

  const cards: ParsedCard[] = []

  for (const child of children) {
    const heading = extractHeading(child)
    const img = extractFirstImgSrc(child)
    const link = extractFirstLink(child)
    const paragraphs = extractParagraphs(child)

    const subheading = paragraphs[0] || ''

    cards.push({
      title: heading || stripHtml(child).slice(0, 60),
      description: subheading,
      image_url: img,
      cta_text: link.text,
      cta_url: link.url,
    })
  }

  if (cards.length === 0) return null

  // Detect overlay style: gradient class, or image comes after text in DOM
  const hasOverlay = classContains(classes, 'gradient') ||
    children.some(c => classContains(extractClass(c), 'gradient', 'overlay')) ||
    // Image is behind content (z-index pattern or media after content)
    children.some(c => {
      const contentPos = c.search(/block-content|card-content|content/i)
      const mediaPos = c.search(/block-media|card-media|card-image/i)
      return contentPos >= 0 && mediaPos >= 0 && contentPos < mediaPos
    })

  // Determine columns from count (GWM uses 3-col grid with 6 items = 2 rows)
  let columns = 3
  if (cards.length === 2 || cards.length === 4) columns = 2
  if (cards.length >= 4 && cards.length % 4 === 0) columns = 4

  return {
    type: 'feature-cards',
    data: {
      title: '',
      cards,
      columns,
      card_style: hasOverlay ? 'overlay' : 'default',
    },
  }
}

function detectGallery(html: string, classes: string): ParsedSection | null {
  if (!classContains(classes, 'gallery', 'carousel', 'slider', 'swiper')) return null

  const images = extractAllImgSrcs(html)
  if (images.length === 0) return null

  // Single image carousel → image section
  if (images.length === 1) {
    return {
      type: 'image',
      data: {
        desktop_image_url: images[0],
        alt: '',
        caption: '',
        layout: 'full-width',
      },
    }
  }

  return {
    type: 'gallery',
    data: {
      title: extractHeading(html) || '',
      images: images.map(url => ({ url, alt: '', caption: '' })),
      layout: 'carousel',
    },
  }
}

function detectTestimonial(html: string, classes: string): ParsedSection | null {
  if (!classContains(classes, 'review', 'testimonial', 'quote', 'press')) return null

  const headings = extractAllHeadings(html)
  const paragraphs = extractParagraphs(html)

  // Look for quoted text
  const allText = stripHtml(html)
  const quoteMatch = allText.match(/"([^"]+)"/) || allText.match(/"([^"]+)"/)

  const title = headings.find(h => h.toLowerCase().includes('review') || h.toLowerCase().includes('article') || h.toLowerCase().includes('news')) || ''

  // Detect dark style from classes or background
  const isDark = classContains(classes, 'dark', 'black') ||
    html.includes('background-color: rgb(0') || html.includes('bg-black') || html.includes('bg-gray-9')

  const link = extractFirstLink(html)

  return {
    type: 'testimonial',
    data: {
      title,
      style: isDark ? 'dark' : 'default',
      testimonials: [{
        quote: quoteMatch ? quoteMatch[1] : paragraphs[0] || allText.slice(0, 200),
        author: '',
        role: '',
      }],
      cta_text: link.text,
      cta_url: link.url,
    },
  }
}

function detectStats(html: string, classes: string): ParsedSection | null {
  if (!classContains(classes, 'stat', 'counter', 'number', 'metric', 'fact')) return null

  const headings = extractAllHeadings(html)
  // Stats usually have numbers
  const stats = headings
    .filter(h => /\d/.test(h))
    .map(h => ({ value: h, label: '', unit: '' }))

  if (stats.length === 0) return null

  return {
    type: 'stats',
    data: {
      title: '',
      stats,
    },
  }
}

function detectVideo(html: string, classes: string): ParsedSection | null {
  const videoUrl = extractVideoUrl(html)
  if (!videoUrl) return null

  return {
    type: 'video',
    data: {
      title: extractHeading(html) || '',
      video_url: videoUrl,
      poster_url: extractFirstImgSrc(html) || '',
    },
  }
}

function detectIntro(html: string, classes: string): ParsedSection | null {
  const paragraphs = extractParagraphs(html)
  const heading = extractHeading(html)
  const img = extractFirstImgSrc(html)
  const textLength = paragraphs.join(' ').length

  // Must have substantial text
  if (textLength < 30 && !heading) return null

  // If it's mostly text with optional image → intro
  if (textLength > 50 || heading) {
    return {
      type: 'intro',
      data: {
        title: heading || '',
        body_html: paragraphs.map(p => `<p>${p}</p>`).join('\n'),
        image_url: img || '',
        image_position: img ? 'right' : undefined,
      },
    }
  }

  return null
}

function detectHeading(html: string, _classes: string): ParsedSection | null {
  const heading = extractHeading(html)
  if (!heading) return null

  // Must be mostly heading, not much else
  const allText = stripHtml(html)
  if (allText.length > heading.length * 3 && allText.length > 100) return null

  const paragraphs = extractParagraphs(html)

  return {
    type: 'heading',
    data: {
      heading,
      sub_heading: paragraphs[0] || '',
    },
  }
}

function detectImage(html: string, _classes: string): ParsedSection | null {
  const images = extractAllImgSrcs(html)
  const textLength = stripHtml(html).length

  // Must be image-dominant
  if (images.length === 0) return null
  if (textLength > 100 && images.length === 1) return null

  if (images.length === 1) {
    return {
      type: 'image',
      data: {
        desktop_image_url: images[0],
        alt: '',
        caption: '',
        layout: 'full-width',
      },
    }
  }

  return {
    type: 'gallery',
    data: {
      title: '',
      images: images.map(url => ({ url, alt: '', caption: '' })),
      layout: 'grid',
    },
  }
}

function detectCtaBanner(html: string, classes: string): ParsedSection | null {
  if (!classContains(classes, 'cta', 'banner', 'action', 'promo')) return null

  const heading = extractHeading(html)
  const paragraphs = extractParagraphs(html)
  const link = extractFirstLink(html)

  if (!heading && !link.text) return null

  return {
    type: 'cta-banner',
    data: {
      heading: heading || '',
      body: paragraphs[0] || '',
      cta_text: link.text,
      cta_url: link.url,
      background_color: '',
    },
  }
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse an HTML fragment into a structured page builder section.
 * Runs all detectors in priority order and returns the first match.
 */
export function parseSection(html: string): ParsedSection {
  const classes = extractClass(html)

  // Run detectors in priority order
  const detectors = [
    detectHero,
    detectVideo,
    detectCardGrid,
    detectGallery,
    detectTestimonial,
    detectStats,
    detectCtaBanner,
    detectHeading,
    detectIntro,
    detectImage,
  ]

  for (const detector of detectors) {
    const result = detector(html, classes)
    if (result) return result
  }

  // Fallback: content-block with cleaned HTML
  const heading = extractHeading(html)
  const paragraphs = extractParagraphs(html)

  return {
    type: 'content-block',
    data: {
      title: heading || '',
      content_html: paragraphs.length > 0
        ? paragraphs.map(p => `<p>${p}</p>`).join('\n')
        : `<p>${stripHtml(html).slice(0, 500)}</p>`,
    },
  }
}
