/**
 * Section Parser — Deterministic HTML → Structured Section Data
 *
 * Parses captured OEM page HTML into page builder section types
 * WITHOUT any AI/LLM calls. Pure regex-based DOM pattern matching.
 *
 * Replaces the unreliable AI-based smart-capture extraction.
 */

import { load } from 'cheerio'

import type { InteractionType } from './compiler-contracts'

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

/** Extract the first image-like media URL, including lazy image and picture sources. */
function extractFirstMediaImageUrl(html: string): string {
  const imgTag = html.match(/<img\b[^>]*>/i)?.[0] || ''
  const sourceTag = html.match(/<source\b[^>]*>/i)?.[0] || ''

  const getUrlFromTag = (tagHtml: string, attributeNames: string[]): string => {
    for (const name of attributeNames) {
      const directMatch = tagHtml.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
      if (directMatch) return directMatch[2] || directMatch[3] || directMatch[4] || ''
    }
    return ''
  }

  const firstFromSrcset = (srcset: string): string => srcset.split(',')[0]?.trim().split(/\s+/)[0] || ''
  return getUrlFromTag(imgTag, ['src', 'data-src', 'data-original', 'data-lazy'])
    || firstFromSrcset(getUrlFromTag(sourceTag, ['srcset', 'data-srcset']))
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

/** Extract poster image URL from a video element */
function extractVideoPoster(html: string): string {
  const videoTag = html.match(/<video[^>]*>/i)?.[0]
  if (!videoTag) return ''

  const getUrlFromTag = (tagHtml: string, attributeNames: string[]): string => {
    for (const name of attributeNames) {
      const directMatch = tagHtml.match(new RegExp(`\\b${name}\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`, 'i'))
      if (directMatch) return directMatch[2] || directMatch[3] || directMatch[4] || ''
    }
    return ''
  }

  return getUrlFromTag(videoTag, ['data-poster', 'poster']) || extractFirstImgSrc(videoTag)
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
  function getUrlFromTag(tagHtml: string, attributeNames: string[]): string {
    for (const name of attributeNames) {
      const directMatch = tagHtml.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
      if (directMatch) return directMatch[2] || directMatch[3] || directMatch[4] || ''
    }
    return ''
  }

  function getFirstFromSrcset(srcset: string | undefined): string {
    if (!srcset) return ''
    const match = srcset.split(',')[0]?.trim().split(/\s+/)[0]
    return match ? match.trim() : ''
  }

  function isVideoUrl(candidate: string): boolean {
    if (!candidate) return false
    const lower = candidate.toLowerCase()
    if (lower.startsWith('javascript:') || lower.startsWith('blob:'))
      return false
    if (lower.startsWith('data:video')) return true
    if (/\.(mp4|webm|mkv|mov|m4v|ogv|ogg|avi|flv|m3u8|mpd)([?#]|$)/i.test(candidate))
      return true
    return /(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com|dailymotion\.com|brightcove|wistia\.net|wistia\.com)/i.test(lower)
  }

  function providerVideoUrl(media: string, sourceId: string): string {
    const normalizedMedia = media.trim().toLowerCase()
    const normalizedSourceId = sourceId.trim()
    if (!normalizedSourceId)
      return ''
    if (normalizedMedia === 'youtube' || normalizedMedia === 'yt')
      return `https://www.youtube.com/watch?v=${normalizedSourceId}`
    if (normalizedMedia === 'vimeo')
      return `https://vimeo.com/${normalizedSourceId}`
    return ''
  }

  const mediaEmbedTags = html.matchAll(/<[^>]*\bdata-(?:media|source-id)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi)
  for (const match of mediaEmbedTags) {
    const tagHtml = match[0]
    const media = getUrlFromTag(tagHtml, ['data-media'])
    const sourceId = getUrlFromTag(tagHtml, ['data-source-id'])
    const url = providerVideoUrl(media, sourceId)
    if (isVideoUrl(url))
      return url
  }

  const tags = html.matchAll(/<(video|source|iframe|a)\b[^>]*>/gi)
  for (const match of tags) {
    const tag = (match[1] || '').toLowerCase()
    const tagHtml = match[0]

    if (tag === 'video') {
      const src = getUrlFromTag(tagHtml, ['data-src', 'src', 'data-video-url', 'data-videourl', 'data-videosrc'])
      if (isVideoUrl(src)) return src
      const poster = getUrlFromTag(tagHtml, ['poster', 'data-poster'])
      if (isVideoUrl(poster)) return poster
      const mutedSource = getUrlFromTag(tagHtml, ['data-srcset', 'srcset'])
      if (isVideoUrl(getFirstFromSrcset(mutedSource))) return getFirstFromSrcset(mutedSource)
    }

    if (tag === 'source') {
      const src = getUrlFromTag(tagHtml, ['data-src', 'src', 'data-video-url'])
      if (isVideoUrl(src)) return src
      const srcset = getUrlFromTag(tagHtml, ['srcset', 'data-srcset'])
      const candidate = getFirstFromSrcset(srcset)
      if (isVideoUrl(candidate)) return candidate
    }

    if (tag === 'iframe') {
      const src = getUrlFromTag(tagHtml, ['data-src', 'src', 'data-video-url', 'data-videourl'])
      if (isVideoUrl(src)) return src
    }

    if (tag === 'a') {
      const href = getUrlFromTag(tagHtml, ['href'])
      if (isVideoUrl(href) && (href.startsWith('http') || href.startsWith('/'))) return href

      const lightboxVideo = getUrlFromTag(tagHtml, ['data-video', 'data-video-url', 'data-videourl', 'data-videosrc'])
      if (isVideoUrl(lightboxVideo)) return lightboxVideo

      const media = getUrlFromTag(tagHtml, ['data-media'])
      const sourceId = getUrlFromTag(tagHtml, ['data-source-id'])
      const providerUrl = providerVideoUrl(media, sourceId)
      if (isVideoUrl(providerUrl)) return providerUrl
    }
  }

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
      poster_url: extractVideoPoster(html) || extractFirstMediaImageUrl(html),
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

// ============================================================================
// Interaction detection — deterministic DOM-region tagging for the clone
// runtime (spec §4.2). Conservative: a region is only reported when both the
// trigger set and the panel/slide set are present; unknown markup is never
// tagged. Cheerio-based (unlike the regex parsing above) because the stamper
// in clone-annotator.ts needs element-level positions.
// ============================================================================

export type DetectedInteractionType = Extract<InteractionType, 'tabs' | 'accordion' | 'carousel' | 'gallery-lightbox'>

export interface DetectedInteractiveRegion {
  type: DetectedInteractionType
  /**
   * Root-relative child-index path, e.g. "0.2.1" — resolved by walking
   * `$.root().children()` (tag nodes only) and descending one index per
   * level. cheerio always normalizes parsed markup to a root -> html ->
   * head/body tree, whether the input was a bare fragment or a full
   * document, so a path computed against a fragment resolves identically
   * against the same content wrapped in a full document.
   */
  rootSelectorPath: string
  triggerCount: number
  panelCount: number
}

// domhandler node — not part of cheerio's public type surface, so internal
// tree-walking helpers below deal in `any` rather than adding an undeclared
// dependency on the `domhandler` package.
type CheerioNode = any

/** Root-relative child-index path for `el`, counting only element (tag) siblings. */
function elementPath(el: CheerioNode): string {
  const path: number[] = []
  let node = el

  while (node && node.parent && node.parent.type !== 'root') {
    const siblings: CheerioNode[] = (node.parent.children || []).filter((c: CheerioNode) => c.type === 'tag')
    path.unshift(Math.max(0, siblings.indexOf(node)))
    node = node.parent
  }

  const rootSiblings: CheerioNode[] = (node?.parent?.children || []).filter((c: CheerioNode) => c.type === 'tag')
  path.unshift(Math.max(0, rootSiblings.indexOf(node)))
  return path.join('.')
}

function classAttr(el: CheerioNode): string {
  return String(el?.attribs?.class ?? '')
}

function imageArea(el: CheerioNode): number {
  const width = Number(el?.attribs?.width ?? 0)
  const height = Number(el?.attribs?.height ?? 0)
  return Number.isFinite(width) && Number.isFinite(height) ? width * height : 0
}

/** Whether `node` is a strict descendant of `ancestor` in the parsed tree. */
function isDescendantOf(ancestor: CheerioNode, node: CheerioNode): boolean {
  let cursor = node?.parent
  while (cursor) {
    if (cursor === ancestor) return true
    cursor = cursor.parent
  }
  return false
}

/**
 * Climbs from `seed`'s parent upward (excluding `seed` itself) until it finds
 * an ancestor whose descendants include at least `minCount` matches for
 * `selector`. An ARIA tablist and its tabpanels are very often siblings
 * under a shared section rather than the tabpanels being nested inside the
 * tablist — so the "root" of a tabs region is not `seed`'s closest() match
 * (which would match `seed` itself first), it's the first ancestor whose
 * subtree actually contains both halves.
 */
function climbToContainer($: ReturnType<typeof load>, seed: CheerioNode, selector: string, minCount = 2): CheerioNode | null {
  let node = seed.parent
  while (node && node.type === 'tag') {
    if ($(node).find(selector).length >= minCount) return node
    node = node.parent
  }
  return null
}

export function detectInteractiveRegions(html: string): DetectedInteractiveRegion[] {
  const $ = load(html)
  type Candidate = DetectedInteractiveRegion & { el: CheerioNode }
  const regions: Candidate[] = []

  // --- tabs: ARIA roles first ---
  $('[role="tablist"]').each((_i, tablist) => {
    const root = climbToContainer($, tablist, '[role="tabpanel"]', 2)
    if (!root) return

    const scope = $(root)
    const triggers = scope.find('[role="tab"]')
    const panels = scope.find('[role="tabpanel"]')
    if (triggers.length >= 2 && panels.length >= 2) {
      regions.push({
        type: 'tabs',
        rootSelectorPath: elementPath(root),
        triggerCount: triggers.length,
        panelCount: panels.length,
        el: root,
      })
    }
  })

  // --- tabs: class-pattern fallback ---
  $('*').each((_i, el) => {
    if (!/\btabs?\b|tab-container|tab_container/i.test(classAttr(el))) return
    // Already handled by the ARIA branch above (either this element IS the
    // tablist itself, or it contains one — either way its region root was
    // already computed via climbToContainer, and the final nesting dedup
    // below would drop a duplicate anyway; skipping here avoids computing
    // one in the first place).
    if ((el as CheerioNode).attribs?.role === 'tablist' || $(el).find('[role="tablist"]').length) return

    const scope = $(el)
    const triggers = scope.find('*').filter((_j, c) => /tab[-_]?(item|button|trigger|link)/i.test(classAttr(c)))
    const panels = scope.find('*').filter((_j, c) => /tab[-_]?(panel|content|pane)/i.test(classAttr(c)))
    if (triggers.length >= 2 && panels.length >= 2) {
      regions.push({
        type: 'tabs',
        rootSelectorPath: elementPath(el),
        triggerCount: triggers.length,
        panelCount: panels.length,
        el,
      })
    }
  })

  // --- accordion ---
  $('*').each((_i, el) => {
    if (!/accordion/i.test(classAttr(el))) return
    if (/accordion[-_]?(header|trigger|title|button|content|panel|body|item)/i.test(classAttr(el))) return // parts, not roots

    const scope = $(el)
    const triggers = scope.find('*').filter((_j, c) =>
      c.tagName === 'button'
      || c.attribs?.role === 'button'
      || /accordion[-_]?(header|trigger|title|button)/i.test(classAttr(c)))
    const panels = scope.find('*').filter((_j, c) =>
      /accordion[-_]?(content|panel|body)/i.test(classAttr(c)) || c.attribs?.role === 'region')

    if (triggers.length >= 2 && panels.length >= 2) {
      regions.push({
        type: 'accordion',
        rootSelectorPath: elementPath(el),
        triggerCount: triggers.length,
        panelCount: panels.length,
        el,
      })
    }
  })

  // --- carousel ---
  $('*').each((_i, el) => {
    if (!/carousel|swiper|slick|splide|slider|embla/i.test(classAttr(el))) return
    if (/track|wrapper|slide\b|slide-|slick-track|swiper-wrapper/i.test(classAttr(el))) return // parts, not roots

    const scope = $(el)
    const track = scope.find('*').filter((_j, c) =>
      /track|wrapper|slides|slide-list|swiper-wrapper|slick-track/i.test(classAttr(c))).first()
    if (!track.length) return

    const slides = track.children().filter((_j, c) => /slide|item/i.test(classAttr(c)) || c.attribs?.role === 'group')
    if (slides.length >= 2) {
      regions.push({
        type: 'carousel',
        rootSelectorPath: elementPath(el),
        triggerCount: 0,
        panelCount: slides.length,
        el,
      })
    }
  })

  // --- gallery-lightbox ---
  $('*').each((_i, el) => {
    if (!/gallery|thumbnails|media-viewer/i.test(classAttr(el))) return
    if (/thumb/i.test(classAttr(el))) return // parts, not roots

    const scope = $(el)
    const thumbImgs = scope.find('*').filter((_j, c) => /thumb/i.test(classAttr(c))).find('img')
    const thumbImgEls = new Set(thumbImgs.toArray())
    const nonThumbImgs = scope.find('img').toArray().filter((img: CheerioNode) => !thumbImgEls.has(img))

    let mainCount = nonThumbImgs.filter((img: CheerioNode) => /main|stage|active|current/i.test(classAttr(img))).length
    if (mainCount === 0 && nonThumbImgs.length > 0) {
      const largest = nonThumbImgs.reduce((best: CheerioNode, img: CheerioNode) => (imageArea(img) > imageArea(best) ? img : best))
      if (imageArea(largest) > 0) mainCount = 1
    }

    if (mainCount >= 1 && thumbImgs.length >= 3) {
      regions.push({
        type: 'gallery-lightbox',
        rootSelectorPath: elementPath(el),
        triggerCount: thumbImgs.length,
        panelCount: 1,
        el,
      })
    }
  })

  // Deduplicate: drop any region nested inside another detected region, and
  // drop same-root duplicates from overlapping heuristics.
  const kept: Candidate[] = []
  for (const candidate of regions) {
    const insideAnother = regions.some(other => other !== candidate && isDescendantOf(other.el, candidate.el))
    const sameRootKept = kept.some(existing => existing.el === candidate.el)
    if (!insideAnother && !sameRootKept) kept.push(candidate)
  }

  return kept.map(({ el: _el, ...region }) => region)
}
