import { describe, expect, it } from 'vitest'

import { annotateCloneInteractions } from './clone-annotator'

const TABS_ARIA = `
<section class="model-features">
  <div role="tablist" class="feature-tabs">
    <button role="tab" aria-selected="true" id="t1">Exterior</button>
    <button role="tab" id="t2">Interior</button>
    <button role="tab" id="t3">Tech</button>
  </div>
  <div role="tabpanel" aria-labelledby="t1" style="display: block !important; opacity: 1 !important; height: auto !important;"><p>Exterior body copy that is long enough.</p></div>
  <div role="tabpanel" aria-labelledby="t2" style="display: block !important;"><p>Interior body copy that is long enough.</p></div>
  <div role="tabpanel" aria-labelledby="t3"><p>Technology copy that is long enough.</p></div>
</section>`

// Mirrors a real VW "stage" carousel: an infinite-loop slider that duplicates each real slide into
// extra clone panels (sharing the same id/aria-labelledby target) for seamless wraparound, while
// still using role="tab"/"tabpanel" for its pagination bullets. Trigger index N does NOT correspond
// to DOM-order panel index N here — panel-bullet-1's clone happens to be first in document order.
const TABS_WITH_DUPLICATE_PANELS = `
<div role="region" aria-label="Carousel">
  <div role="tablist">
    <button role="tab" id="bullet-0" aria-controls="panel-0" aria-selected="false">First</button>
    <button role="tab" id="bullet-1" aria-controls="panel-1" aria-selected="true">Second</button>
  </div>
  <div aria-labelledby="bullet-1" id="panel-1" role="tabpanel" inert style="display: none !important;">Second slide (clone A, inert)</div>
  <div aria-labelledby="bullet-0" id="panel-0" role="tabpanel" inert style="display: none !important;">First slide (clone A, inert)</div>
  <div aria-labelledby="bullet-1" id="panel-1" role="tabpanel" style="display: block !important;">Second slide (LIVE, not inert)</div>
  <div aria-labelledby="bullet-0" id="panel-0" role="tabpanel" inert style="display: none !important;">First slide (clone B, inert)</div>
</div>`

const CAROUSEL = `
<div class="offers-carousel swiper">
  <button class="carousel-prev">‹</button>
  <div class="swiper-wrapper">
    <div class="swiper-slide"><img src="/a.jpg"></div>
    <div class="swiper-slide"><img src="/b.jpg"></div>
    <div class="swiper-slide"><img src="/c.jpg"></div>
  </div>
  <button class="carousel-next">›</button>
</div>`

describe('annotateCloneInteractions', () => {
  it('stamps a tabs region with component, triggers, panels, and region id', () => {
    const result = annotateCloneInteractions(TABS_ARIA)

    expect(result.interactions).toHaveLength(1)
    expect(result.interactions[0]).toMatchObject({ id: 'cr-1', type: 'tabs', trigger_count: 3, panel_count: 3 })
    expect(result.html).toContain('data-clone-interaction="tabs"')
    expect(result.html).toContain('data-clone-region-id="cr-1"')
    expect(result.html).toContain('x-data="cloneTabs"')
    expect(result.html).toContain('data-clone-tab="0"')
    expect(result.html).toContain('data-clone-panel="2"')
    expect(result.html).toContain('x-on:click="selectTab"')
  })

  it('strips capture-forced inline styles from stamped panels', () => {
    const result = annotateCloneInteractions(TABS_ARIA)

    expect(result.html).not.toMatch(/data-clone-panel="0"[^>]*style="[^"]*display/)
    expect(result.html).not.toMatch(/data-clone-panel="0"[^>]*style="[^"]*opacity/)
  })

  it('resolves duplicate-id tabpanels (infinite-loop slider clones) to the trigger that actually labels them, preferring the non-inert copy', () => {
    const result = annotateCloneInteractions(TABS_WITH_DUPLICATE_PANELS)

    expect(result.interactions).toHaveLength(1)
    expect(result.interactions[0]).toMatchObject({ id: 'cr-1', type: 'tabs', trigger_count: 2, panel_count: 2 })

    // data-clone-tab="0" (bullet-0, aria-controls="panel-0") must resolve to a panel-0 duplicate —
    // not to whichever tabpanel happens to be first in DOM order (which is a panel-1 clone here).
    const panel0Match = result.html.match(/<div[^>]*data-clone-panel="0"[^>]*>/)?.[0] ?? ''
    expect(panel0Match).toContain('aria-labelledby="bullet-0"')

    // data-clone-tab="1" (bullet-1, aria-controls="panel-1") must resolve to the NON-inert panel-1
    // duplicate (the one that was actually the live/rendered slide at capture time), not either
    // inert clone.
    const panel1Match = result.html.match(/<div[^>]*data-clone-panel="1"[^>]*>/)?.[0] ?? ''
    expect(panel1Match).toContain('aria-labelledby="bullet-1"')
    expect(panel1Match).not.toContain('inert')
    expect(result.html).toContain('Second slide (LIVE, not inert)')

    // Only the 2 resolved panels are stamped/stripped — the other 2 duplicate clones are left
    // completely untouched (unstamped, forced styles intact) since the runtime never manages them.
    expect((result.html.match(/data-clone-panel=/g) ?? [])).toHaveLength(2)
  })

  it('stamps carousel track, slides, and existing prev/next controls', () => {
    const result = annotateCloneInteractions(CAROUSEL)

    expect(result.interactions[0].type).toBe('carousel')
    expect(result.html).toContain('x-data="cloneCarousel"')
    expect(result.html).toContain('data-clone-track')
    expect(result.html).toContain('data-clone-slide="1"')
    expect(result.html).toContain('data-clone-prev')
    expect(result.html).toContain('x-on:click="next"')
  })

  it('leaves unrecognized content byte-identical', () => {
    const plain = '<main><h1>Amarok</h1><p>Copy that changes nothing.</p></main>'

    const result = annotateCloneInteractions(plain)

    expect(result.interactions).toEqual([])
    expect(result.html).toBe(plain)
  })

  it('preserves a leading style tag when stamping a region', () => {
    const input = `<style>.model-features{color:red}</style>${TABS_ARIA}`

    const result = annotateCloneInteractions(input)

    expect(result.html).toContain('.model-features{color:red}')
    expect(result.html.indexOf('<style>')).toBeLessThan(result.html.indexOf('data-clone-interaction'))
    expect(result.interactions).toHaveLength(1)
  })

  it('is idempotent — already-stamped HTML is returned unchanged', () => {
    const first = annotateCloneInteractions(TABS_ARIA)
    const second = annotateCloneInteractions(first.html)

    expect(second.html).toBe(first.html)
    expect(second.interactions).toEqual(first.interactions)
  })

  it('recomputes carousel inventory faithfully on already-stamped input', () => {
    const first = annotateCloneInteractions(CAROUSEL)
    const second = annotateCloneInteractions(first.html)

    expect(second.interactions).toEqual(first.interactions)
  })

  it('never emits on* attributes or script elements', () => {
    const result = annotateCloneInteractions(TABS_ARIA + CAROUSEL)

    expect(result.html).not.toMatch(/\son[a-z]+=/i)
    expect(result.html).not.toContain('<script')
  })
})
