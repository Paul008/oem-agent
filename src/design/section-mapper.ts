/**
 * Section Mapper — Unified DOM → Section Model (deterministic-first, AI fallback)
 *
 * Takes a WHOLE cloned OEM page and turns it into an ordered list of structured
 * builder sections. It splits the page into top-level regions, runs the
 * deterministic `parseSection` on each, scores a confidence per section, and
 * decides whether the page is reliable enough or should be re-mapped by an
 * (injectable) AI fallback.
 *
 * Design decision (see HANDOFF-model-pages-next.md): deterministic mapping is
 * the primary path; AI structuring is only invoked when deterministic
 * confidence is low. This keeps mapping cheap and stable across OEM stacks,
 * with AI as a safety net for unfamiliar CMS layouts.
 *
 * `parseSection` is intentionally reused as-is (it powers the user-driven
 * smart-capture single-region path); the mapper layers whole-page splitting,
 * confidence scoring, and positional heuristics on top of it.
 */

import { load } from 'cheerio'
import { parseSection, type ParsedSection, type ParsedSectionType } from './section-parser'

// ============================================================================
// Types
// ============================================================================

export interface MappedSection {
  type: ParsedSectionType
  data: Record<string, any>
  id: string
  order: number
  /** 0..1 confidence that this region was classified correctly. */
  confidence: number
  /** Which engine produced this section. */
  source: 'deterministic' | 'ai'
  /** Best-effort CSS-ish hint for the source region (tag.class). */
  selector?: string
}

export interface MapPageResult {
  sections: MappedSection[]
  region_count: number
  /** Mean confidence across all sections (0 when none). */
  overall_confidence: number
  /** IDs of sections below `confidenceThreshold`. */
  low_confidence_section_ids: string[]
  /** True when the page should be re-mapped by the AI fallback. */
  needs_ai_fallback: boolean
}

export interface MapPageOptions {
  /** Per-section threshold below which a section is "low confidence". Default 0.5. */
  confidenceThreshold?: number
  /** Mean-confidence threshold below which the whole page needs AI fallback. Default 0.5. */
  minMeanConfidence?: number
}

/** Injectable AI fallback: maps raw page HTML to sections (e.g. PageStructurer). */
export type AiFallback = (html: string) => Promise<MappedSection[]>

// ============================================================================
// Region splitting (cheerio — available in CF Workers)
// ============================================================================

const CHROME_TAGS = new Set([
  'script', 'style', 'nav', 'header', 'footer', 'noscript', 'svg', 'link', 'meta', 'aside',
])
const WRAPPER_TAGS = new Set(['div', 'main', 'section', 'article', 'ul', 'ol'])
const MAX_REGIONS = 60
const NAV_ROLES = new Set(['navigation', 'banner', 'contentinfo', 'search'])
// Framework-agnostic noise: a11y announcers, screen-reader-only text, breadcrumbs,
// skip links, sticky navs. Not OEM-specific — these appear across CMS stacks.
const NOISE_CLASS_RE = /route-announcer|sr-only|visually-hidden|skip-link|breadcrumb|cookie/i

/** A node that is page chrome / accessibility scaffolding, never a content section. */
function isChromeNode($: any, el: any): boolean {
  if (CHROME_TAGS.has((el.name || '').toLowerCase())) return true
  const $el = $(el)
  if ($el.attr('aria-live')) return true
  if (NAV_ROLES.has(($el.attr('role') || '').toLowerCase())) return true
  if (NOISE_CLASS_RE.test($el.attr('class') || '')) return true
  return false
}

function contentChildren($: any, node: any): any[] {
  return node
    .children()
    .toArray()
    .filter((el: any) => el.type === 'tag' && !isChromeNode($, el))
}

/**
 * Element children that actually carry content — excludes chrome and "noise"
 * nodes that have neither child elements nor text (e.g. stray tracking <img>
 * siblings on the body, which would otherwise stop wrapper descent).
 */
function meaningfulChildren($: any, node: any): any[] {
  return contentChildren($, node).filter((el: any) => {
    const $el = $(el)
    return $el.children().length > 0 || ($el.text() || '').trim().length > 0
  })
}

function isWrapper(el: any): boolean {
  return WRAPPER_TAGS.has((el.name || '').toLowerCase())
}

/**
 * Follow single-meaningful-wrapper chains down to the first node that branches
 * into multiple content regions (or whose only child stops being a descendable
 * wrapper). Real CMS clones (e.g. AEM `root > aem-Grid > aem-GridColumn >
 * aem-Grid`) nest the actual sections several wrapper levels deep; without this
 * the whole page collapses into a single region.
 */
function descendToBranch($: any, node: any): any {
  let current = node
  for (let i = 0; i < 12; i++) {
    const m = meaningfulChildren($, current)
    if (m.length === 1 && isWrapper(m[0]) && $(m[0]).children().length > 0) {
      current = $(m[0])
    } else {
      break
    }
  }
  return current
}

function selectorFor(el: any): string {
  const tag = (el.name || 'div').toLowerCase()
  const cls = (el.attribs?.class || '').trim().split(/\s+/).filter(Boolean)[0]
  return cls ? `${tag}.${cls}` : tag
}

/**
 * Split a full page into top-level content regions, skipping nav/header/footer
 * chrome and descending through generic single-child wrappers.
 */
export function splitPageRegions(html: string): Array<{ html: string; selector: string }> {
  const $ = load(html)
  let root: any = $('body').first()
  if (!root.length) root = $.root()

  // Descend through single-meaningful-wrapper chains to the real content
  // container (skips deep CMS wrapper nesting and stray noise siblings).
  root = descendToBranch($, root)

  const regions: Array<{ html: string; selector: string }> = []
  for (const el of contentChildren($, root)) {
    if (regions.length >= MAX_REGIONS) break
    // Per region, unwrap a single generic wrapper so repeating children
    // (e.g. container > row > cols) become directly visible to the parser.
    const node = descendToBranch($, $(el))
    const text = (node.text() || '').replace(/\s+/g, ' ').trim()
    const hasImg = node.find('img').length > 0
    if (!text && !hasImg) continue
    regions.push({ html: $.html(node), selector: selectorFor(node[0]) })
  }
  return regions
}

// ============================================================================
// Confidence scoring
// ============================================================================

/** Score how confident the deterministic classification is (0..1). */
export function scoreSection(section: ParsedSection): number {
  const d = section.data || {}
  let score: number

  switch (section.type) {
    case 'hero':
      score = 0.5 + (d.heading ? 0.25 : 0) + (d.desktop_image_url ? 0.25 : 0)
      break
    case 'feature-cards': {
      const cards: any[] = Array.isArray(d.cards) ? d.cards : []
      if (cards.length < 1) { score = 0.3; break }
      const imgFrac = cards.filter(c => c.image_url).length / cards.length
      const allTitled = cards.every(c => (c.title || '').trim().length > 0)
      score = 0.5 + 0.3 * imgFrac + (cards.length >= 3 ? 0.1 : 0) + (allTitled ? 0.1 : 0)
      break
    }
    case 'gallery': {
      const imgs: any[] = Array.isArray(d.images) ? d.images : []
      score = 0.6 + (imgs.length >= 3 ? 0.2 : 0) + (imgs.length >= 5 ? 0.1 : 0)
      break
    }
    case 'video':
      score = d.video_url ? 0.85 : 0.4
      break
    case 'stats':
      score = Array.isArray(d.stats) && d.stats.length ? 0.7 : 0.3
      break
    case 'testimonial':
      score = 0.6
      break
    case 'cta-banner':
      score = 0.6
      break
    case 'image':
      score = 0.6
      break
    case 'intro':
      score = 0.4
        + (d.title ? 0.2 : 0)
        + (d.image_url ? 0.2 : 0)
        + ((d.body_html || '').length > 200 ? 0.1 : 0)
      break
    case 'heading':
      score = 0.45
      break
    case 'content-block':
      // The catch-all fallback — nothing matched a real pattern.
      score = 0.2
      break
    default:
      score = 0.3
  }

  return Math.max(0, Math.min(1, score))
}

// ============================================================================
// Positional heuristics
// ============================================================================

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Cross-stack hero heuristic: the first region of a model page that has a
 * top-level heading AND a prominent image is almost always the hero, even when
 * the OEM uses a non-"hero" class name (e.g. Kia's `.visual-area`).
 */
function heroFromRegion(html: string): ParsedSection | null {
  const headingMatch = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)
  const imgMatch = html.match(/<img[^>]*\bsrc="([^"]+)"/i)
  if (!headingMatch || !imgMatch) return null

  const paraMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
  const linkMatch = html.match(/<a[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)

  return {
    type: 'hero',
    data: {
      heading: stripTags(headingMatch[1]),
      sub_heading: paraMatch ? stripTags(paraMatch[1]) : '',
      desktop_image_url: imgMatch[1],
      cta_text: linkMatch ? stripTags(linkMatch[2]) : '',
      cta_url: linkMatch ? linkMatch[1] : '',
    },
  }
}

// ============================================================================
// Deterministic whole-page mapping
// ============================================================================

export function mapPageToSections(html: string, opts: MapPageOptions = {}): MapPageResult {
  const confidenceThreshold = opts.confidenceThreshold ?? 0.5
  const minMeanConfidence = opts.minMeanConfidence ?? 0.5

  const regions = splitPageRegions(html)
  const sections: MappedSection[] = regions.map((region, i) => {
    let parsed = parseSection(region.html)

    // First-region hero promotion (cross-stack heuristic).
    if (i === 0 && parsed.type !== 'hero') {
      const hero = heroFromRegion(region.html)
      if (hero) parsed = hero
    }

    return {
      type: parsed.type,
      data: parsed.data,
      id: `section-${parsed.type}-${i}`,
      order: i,
      confidence: scoreSection(parsed),
      source: 'deterministic' as const,
      selector: region.selector,
    }
  })

  const low_confidence_section_ids = sections
    .filter(s => s.confidence < confidenceThreshold)
    .map(s => s.id)

  const overall_confidence = sections.length
    ? sections.reduce((sum, s) => sum + s.confidence, 0) / sections.length
    : 0

  const needs_ai_fallback = sections.length === 0 || overall_confidence < minMeanConfidence

  return {
    sections,
    region_count: regions.length,
    overall_confidence,
    low_confidence_section_ids,
    needs_ai_fallback,
  }
}

// ============================================================================
// Orchestrator — deterministic-first, AI fallback
// ============================================================================

export interface MapPageOrchestratorOptions extends MapPageOptions {
  aiFallback?: AiFallback
}

export async function mapPage(
  html: string,
  opts: MapPageOrchestratorOptions = {},
): Promise<MapPageResult & { ai_fallback_used: boolean }> {
  const deterministic = mapPageToSections(html, opts)

  if (deterministic.needs_ai_fallback && opts.aiFallback) {
    const aiSections = await opts.aiFallback(html)
    if (Array.isArray(aiSections) && aiSections.length > 0) {
      const overall = aiSections.reduce((sum, s) => sum + (s.confidence ?? 1), 0) / aiSections.length
      return {
        sections: aiSections,
        region_count: deterministic.region_count,
        overall_confidence: overall,
        low_confidence_section_ids: [],
        needs_ai_fallback: false,
        ai_fallback_used: true,
      }
    }
  }

  return { ...deterministic, ai_fallback_used: false }
}
