import { describe, expect, it } from 'vitest'

import { detectAdaptiveMatchInteraction } from './adaptive-match-detection'

describe('detectAdaptiveMatchInteraction', () => {
  it('recognises the Navara Swiper safety region as a carousel', () => {
    const result = detectAdaptiveMatchInteraction({
      html: `
        <section class="Carousel_wrapper__a1 safety">
          <div class="swiper swiper-initialized">
            <div class="swiper-wrapper">
              <article class="swiper-slide swiper-slide-active"><img src="a.jpg" alt="Braking"></article>
              <article class="swiper-slide"><img src="b.jpg" alt="Lane departure"></article>
              <article class="swiper-slide"><img src="c.jpg" alt="Parking sensors"></article>
            </div>
            <button class="swiper-button-prev">Previous</button>
            <button class="swiper-button-next">Next</button>
          </div>
        </section>`,
      artifact: null,
    })

    expect(result.kind).toBe('carousel')
    expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    expect(result.itemCount).toBe(3)
    expect(result.requiresAi).toBe(true)
    expect(result.markers).toContain('swiper')
  })

  it('prefers gallery-lightbox when thumbnails open a dialog', () => {
    const result = detectAdaptiveMatchInteraction({
      html: `
        <section data-gallery>
          <button data-lightbox-trigger><img src="a.jpg" alt="Front"></button>
          <button data-lightbox-trigger><img src="b.jpg" alt="Rear"></button>
          <div role="dialog" aria-modal="true" class="lightbox"></div>
        </section>`,
      artifact: null,
    })

    expect(result).toMatchObject({ kind: 'gallery-lightbox', itemCount: 2, requiresAi: true })
  })

  it('recognises accessible tabs', () => {
    const result = detectAdaptiveMatchInteraction({
      html: '<div role="tablist"><button role="tab" aria-selected="true">Design</button><button role="tab">Safety</button><div role="tabpanel">Panel</div></div>',
      artifact: null,
    })

    expect(result).toMatchObject({ kind: 'tabs', itemCount: 2, requiresAi: true })
  })

  it('recognises accordion controls', () => {
    const result = detectAdaptiveMatchInteraction({
      html: '<section class="accordion"><button aria-expanded="false" aria-controls="answer-1">Warranty</button><div id="answer-1" hidden>Answer</div></section>',
      artifact: null,
    })

    expect(result).toMatchObject({ kind: 'accordion', itemCount: 1, requiresAi: true })
  })

  it('keeps plain content on the deterministic static path', () => {
    const result = detectAdaptiveMatchInteraction({
      html: '<section><h2>Built for Australia</h2><p>Five year warranty.</p><img src="ute.jpg" alt="Navara"></section>',
      artifact: null,
    })

    expect(result).toMatchObject({ kind: 'static', confidence: 1, requiresAi: false })
  })

  it('returns unknown for conflicting high-confidence interaction evidence', () => {
    const result = detectAdaptiveMatchInteraction({
      html: '<div class="swiper accordion"><button role="tab" aria-expanded="false">Mixed control</button><div class="swiper-slide"></div></div>',
      artifact: null,
    })

    expect(result.kind).toBe('unknown')
    expect(result.requiresAi).toBe(true)
  })
})
