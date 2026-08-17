import type { AdaptiveMatchKind } from './adaptive-match-contracts'

export interface InteractionDetection {
  kind: AdaptiveMatchKind
  confidence: number
  markers: string[]
  itemCount: number
  requiresAi: boolean
}

interface DetectionInput {
  html: string
  artifact?: unknown
}

interface KindScore {
  kind: Exclude<AdaptiveMatchKind, 'static' | 'unknown'>
  score: number
  markers: string[]
  itemCount: number
}

function occurrences(value: string, pattern: RegExp): number {
  return Array.from(value.matchAll(pattern)).length
}

function add(score: KindScore, points: number, marker: string) {
  score.score += points
  if (!score.markers.includes(marker))
    score.markers.push(marker)
}

export function detectAdaptiveMatchInteraction(input: DetectionInput): InteractionDetection {
  const html = String(input.html || '')
  const evidence = `${html}\n${input.artifact ? JSON.stringify(input.artifact).slice(0, 120_000) : ''}`.toLowerCase()
  const scores: KindScore[] = [
    { kind: 'gallery-lightbox', score: 0, markers: [], itemCount: 0 },
    { kind: 'carousel', score: 0, markers: [], itemCount: 0 },
    { kind: 'tabs', score: 0, markers: [], itemCount: 0 },
    { kind: 'accordion', score: 0, markers: [], itemCount: 0 },
  ]
  const byKind = Object.fromEntries(scores.map(score => [score.kind, score])) as Record<KindScore['kind'], KindScore>

  if (/\bswiper(?:-|_|\b)/.test(evidence))
    add(byKind.carousel, 3, 'swiper')
  if (/\b(?:slick|splide|embla)(?:-|_|\b)/.test(evidence))
    add(byKind.carousel, 3, 'carousel-runtime')
  if (/\bcarousel(?:-|_|\b)|aria-roledescription=["']carousel/.test(evidence))
    add(byKind.carousel, 2, 'carousel')
  if (/swiper-button-(?:prev|next)|carousel-(?:prev|next)|data-carousel-(?:prev|next)/.test(evidence))
    add(byKind.carousel, 1, 'previous-next-controls')
  byKind.carousel.itemCount = Math.max(
    occurrences(evidence, /<[^>]+\bclass=["'][^"']*\bswiper-slide[\s"']/g),
    occurrences(evidence, /data-(?:carousel-item|slide)[=\s>]/g),
  )
  if (byKind.carousel.itemCount > 1)
    add(byKind.carousel, 2, 'multiple-slides')

  if (/data-gallery[=\s>]|\bgallery(?:-|_|\b)/.test(evidence))
    add(byKind['gallery-lightbox'], 2, 'gallery')
  if (/data-lightbox-trigger|\blightbox(?:-|_|\b)/.test(evidence))
    add(byKind['gallery-lightbox'], 3, 'lightbox')
  if (/role=["']dialog["'][^>]*aria-modal=["']true|aria-modal=["']true["'][^>]*role=["']dialog/.test(evidence))
    add(byKind['gallery-lightbox'], 2, 'modal-dialog')
  byKind['gallery-lightbox'].itemCount = Math.max(
    occurrences(evidence, /data-lightbox-trigger/g),
    occurrences(evidence, /<img\b/g),
  )

  if (/role=["']tablist["']/.test(evidence))
    add(byKind.tabs, 3, 'tablist')
  if (/role=["']tab["']/.test(evidence))
    add(byKind.tabs, 2, 'tab-role')
  if (/aria-selected=["'](?:true|false)["']/.test(evidence))
    add(byKind.tabs, 1, 'aria-selected')
  byKind.tabs.itemCount = occurrences(evidence, /role=["']tab["']/g)

  if (/\baccordion(?:-|_|\b)/.test(evidence))
    add(byKind.accordion, 3, 'accordion')
  if (/aria-expanded=["'](?:true|false)["']/.test(evidence))
    add(byKind.accordion, 2, 'aria-expanded')
  if (/<details\b|<summary\b/.test(evidence))
    add(byKind.accordion, 2, 'details-summary')
  byKind.accordion.itemCount = Math.max(
    occurrences(evidence, /aria-expanded=["'](?:true|false)["']/g),
    occurrences(evidence, /<summary\b/g),
  )

  const ranked = scores.filter(score => score.score > 0).sort((a, b) => b.score - a.score)
  if (!ranked.length) {
    return { kind: 'static', confidence: 1, markers: [], itemCount: 0, requiresAi: false }
  }

  const [best, runnerUp] = ranked
  const galleryOverCarousel = best.kind === 'gallery-lightbox' && runnerUp?.kind === 'carousel'
  if (runnerUp && !galleryOverCarousel && best.score >= 3 && runnerUp.score >= 3 && best.score - runnerUp.score <= 2) {
    return {
      kind: 'unknown',
      confidence: Math.min(0.79, 0.5 + best.score * 0.04),
      markers: [...best.markers, ...runnerUp.markers],
      itemCount: Math.max(best.itemCount, runnerUp.itemCount),
      requiresAi: true,
    }
  }

  return {
    kind: best.kind,
    confidence: Math.min(0.99, 0.55 + best.score * 0.08),
    markers: best.markers,
    itemCount: best.itemCount,
    requiresAi: true,
  }
}
