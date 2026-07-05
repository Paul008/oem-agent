import { load } from 'cheerio'
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
// Every clone carries the same capture-forced-VISIBLE inline style as the live page (the capturer
// forces every slide open), so the unselected duplicates would each render at full slide height and
// stack the whole stage — the over-render this fix collapses.
const FORCED_VISIBLE = 'display: block !important; opacity: 1 !important; visibility: visible !important; height: auto !important; overflow: visible !important;'
const TABS_WITH_DUPLICATE_PANELS = `
<div role="region" aria-label="Carousel">
  <div role="tablist">
    <button role="tab" id="bullet-0" aria-controls="panel-0" aria-selected="false">First</button>
    <button role="tab" id="bullet-1" aria-controls="panel-1" aria-selected="true">Second</button>
  </div>
  <div aria-labelledby="bullet-1" id="panel-1" role="tabpanel" inert style="${FORCED_VISIBLE}">Second slide (clone A, inert)</div>
  <div aria-labelledby="bullet-0" id="panel-0" role="tabpanel" inert style="${FORCED_VISIBLE}">First slide (clone A, inert)</div>
  <div aria-labelledby="bullet-1" id="panel-1" role="tabpanel" style="${FORCED_VISIBLE}">Second slide (LIVE, not inert)</div>
  <div aria-labelledby="bullet-0" id="panel-0" role="tabpanel" inert style="${FORCED_VISIBLE}">First slide (clone B, inert)</div>
</div>`

// A duplicate-id slider (so aria-labelledby resolution engages) that ALSO contains an unrelated
// tabpanel whose aria-labelledby target (`unrelated-trigger`) corresponds to no resolved tab and
// whose id (`orphan-panel`) matches no resolved panel. The collapse pass must leave that orphan
// completely alone — it is legitimate unique content, not an infinite-loop clone.
const TABS_WITH_ORPHAN_PANEL = `
<div role="region" aria-label="Carousel">
  <div role="tablist">
    <button role="tab" id="bullet-0" aria-controls="panel-0" aria-selected="true">First</button>
    <button role="tab" id="bullet-1" aria-controls="panel-1" aria-selected="false">Second</button>
  </div>
  <div aria-labelledby="bullet-0" id="panel-0" role="tabpanel" style="${FORCED_VISIBLE}">First slide (LIVE)</div>
  <div aria-labelledby="bullet-0" id="panel-0" role="tabpanel" inert style="${FORCED_VISIBLE}">First slide (clone)</div>
  <div aria-labelledby="bullet-1" id="panel-1" role="tabpanel" style="${FORCED_VISIBLE}">Second slide (LIVE)</div>
  <div aria-labelledby="unrelated-trigger" id="orphan-panel" role="tabpanel" style="${FORCED_VISIBLE}">Unrelated content that must stay put</div>
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

// Mirrors the live VW Amarok stage carousel: W3C ARIA carousel pattern with
// zero class-based hints (styled-components sc-* class names), slides marked
// via aria-roledescription="slide" (which also carry role="group"), and
// prev/next controls inside a data-testid="content-slider-arrows" wrapper.
const ARIA_CAROUSEL = `
<div aria-roledescription="carousel" class="sc-bZQynM">
  <div class="sc-hKFxyN">
    <div role="group" aria-roledescription="slide" class="sc-abc1"><img src="/1.jpg"></div>
    <div role="group" aria-roledescription="slide" class="sc-abc2"><img src="/2.jpg"></div>
    <div role="group" aria-roledescription="slide" class="sc-abc3"><img src="/3.jpg"></div>
  </div>
  <div data-testid="content-slider-arrows">
    <button aria-label="Previous slide">‹</button>
    <button aria-label="Next slide">›</button>
  </div>
</div>`

// ARIA carousel whose slides are DIRECT children of the carousel root — so the slides' nearest
// common ancestor resolves to the root itself, landing data-clone-track on the same element as
// x-data. This is the shape cloneCarousel.init()'s `matches('[data-clone-track]') ? this.root : ...`
// guard exists to handle: querySelector('[data-clone-track]') can never match self.
const ARIA_CAROUSEL_ROOT_TRACK = `
<div aria-roledescription="carousel" class="sc-root">
  <div role="group" aria-roledescription="slide" class="sc-s1"><img src="/1.jpg"></div>
  <div role="group" aria-roledescription="slide" class="sc-s2"><img src="/2.jpg"></div>
  <div role="group" aria-roledescription="slide" class="sc-s3"><img src="/3.jpg"></div>
  <div data-testid="content-slider-arrows">
    <button aria-label="Previous slide">‹</button>
    <button aria-label="Next slide">›</button>
  </div>
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

    // Exactly 2 panels carry the runtime-managed `data-clone-panel` attribute (the resolved set) —
    // the duplicate clones are marked separately (data-clone-panel-duplicate) so the runtime never
    // manages them; see the dedicated collapse test below.
    expect((result.html.match(/data-clone-panel=/g) ?? [])).toHaveLength(2)

    // Trigger 0 resolves to a panel whose only duplicates were all inert (never the live/rendered
    // slide at capture time); the stamped copy must still have `inert` cleared, since the runtime
    // now force-shows it directly and a leftover `inert` would make it pointer-events:none and
    // invisible to the accessibility tree even after the display fix.
    const $ = load(result.html)
    expect($('[data-clone-panel][inert]').length).toBe(0)
  })

  it('collapses forced-visible duplicate (infinite-loop clone) tabpanels so only the resolved panels occupy layout', () => {
    const result = annotateCloneInteractions(TABS_WITH_DUPLICATE_PANELS)
    const $ = load(result.html)

    // The 2 unselected duplicate clones (same id/aria-labelledby as a resolved panel) are marked and
    // force-hidden: they duplicate content already stamped as the real panel, so leaving their
    // capture-forced `display:block` intact would stack two extra full-height slides on the stage.
    const dups = $('[data-clone-panel-duplicate]')
    expect(dups.length).toBe(2)
    dups.each((_i, el) => {
      const style = String($(el).attr('style') ?? '')
      expect(style).toMatch(/display\s*:\s*none\s*!important/)
      // the capture-forced visible props must no longer win
      expect(style).not.toMatch(/display\s*:\s*block/)
      expect(style).not.toMatch(/visibility\s*:\s*visible/)
    })

    // The genuinely resolved panels are NOT marked as duplicates and keep their runtime attribute.
    expect($('[data-clone-panel][data-clone-panel-duplicate]').length).toBe(0)
    expect($('[data-clone-panel]').length).toBe(2)
    // A duplicate and its resolved twin are never both left visible.
    expect($('[data-clone-panel-duplicate]').filter((_i, el) => /display\s*:\s*block/.test(String($(el).attr('style') ?? ''))).length).toBe(0)
  })

  it('collapses only genuine duplicates and leaves an unrelated orphan tabpanel completely untouched', () => {
    const result = annotateCloneInteractions(TABS_WITH_ORPHAN_PANEL)
    const $ = load(result.html)

    // The orphan panel shares neither id nor aria-labelledby target with any resolved panel, so it
    // must be left exactly as captured: no duplicate marker, no data-clone-panel, no display:none,
    // and its capture-forced visible style intact.
    const orphan = $('#orphan-panel')
    expect(orphan).toHaveLength(1)
    expect(orphan.is('[data-clone-panel-duplicate]')).toBe(false)
    expect(orphan.is('[data-clone-panel]')).toBe(false)
    const orphanStyle = String(orphan.attr('style') ?? '')
    expect(orphanStyle).not.toMatch(/display\s*:\s*none/)
    expect(orphanStyle).toMatch(/display\s*:\s*block/)

    // The genuine infinite-loop clone (same id/aria-labelledby as a resolved panel) is still collapsed.
    const dups = $('[data-clone-panel-duplicate]')
    expect(dups.length).toBe(1)
    expect(String(dups.attr('style') ?? '')).toMatch(/display\s*:\s*none\s*!important/)

    // Exactly the 2 resolved panels are runtime-managed.
    expect($('[data-clone-panel]').length).toBe(2)
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

  it('stamps an ARIA-pattern carousel (aria-roledescription) track, slides, and aria-labeled controls', () => {
    const result = annotateCloneInteractions(ARIA_CAROUSEL)

    expect(result.interactions[0].type).toBe('carousel')
    expect(result.interactions[0].panel_count).toBe(3)
    expect(result.html).toContain('x-data="cloneCarousel"')
    expect(result.html).toContain('data-clone-track')
    expect(result.html).toContain('data-clone-slide="0"')
    expect(result.html).toContain('data-clone-slide="1"')
    expect(result.html).toContain('data-clone-slide="2"')
    expect(result.html).toContain('data-clone-prev')
    expect(result.html).toContain('data-clone-next')
    expect(result.html).toContain('x-on:click="prev"')
    expect(result.html).toContain('x-on:click="next"')

    // Track is the slides' nearest common parent (the wrapper div), not the
    // aria-roledescription="carousel" root itself.
    const trackMatch = result.html.match(/<div[^>]*data-clone-track[^>]*>/)?.[0] ?? ''
    expect(trackMatch).toContain('sc-hKFxyN')
    expect(trackMatch).not.toContain('aria-roledescription="carousel"')
  })

  it('stamps x-data and data-clone-track on the SAME element when carousel slides are direct children of the root', () => {
    const result = annotateCloneInteractions(ARIA_CAROUSEL_ROOT_TRACK)
    const $ = load(result.html)

    // nearestCommonAncestor of the direct-child slides is the carousel root itself, so the root
    // carries BOTH x-data (cloneCarousel) and data-clone-track — the exact shape the runtime's
    // `this.root.matches('[data-clone-track]') ? this.root : ...` guard resolves.
    const root = $('[aria-roledescription="carousel"]')
    expect(root).toHaveLength(1)
    expect(root.attr('x-data')).toBe('cloneCarousel')
    expect(root.is('[data-clone-track]')).toBe(true)

    // The slides are still stamped, and no descendant wrapper stole the track attribute.
    expect(result.html).toContain('data-clone-slide="0"')
    expect(result.html).toContain('data-clone-slide="2"')
    expect($('[data-clone-track]')).toHaveLength(1)
    expect(result.interactions[0]).toMatchObject({ type: 'carousel', panel_count: 3 })
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
