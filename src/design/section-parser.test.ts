import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'
import { detectInteractiveRegions, parseFeatureOverlayProps, parseSection } from './section-parser'
import { ARIYA_DIMENSIONS_COMPPROPS_ATTR, ARIYA_PROPILOT_COMPPROPS_ATTR } from './nissan-feature-overlay-fixture'

describe('section-parser video detection', () => {
  it('detects inline video tags with data-src attributes', () => {
    const result = parseSection('<section><video data-src="/media/hero-loop.mp4" data-poster="/media/hero-poster.jpg" controls></video><p>overview</p></section>')

    expect(result.type).toBe('video')
    expect(result.data.video_url).toBe('/media/hero-loop.mp4')
    expect(result.data.poster_url).toBe('/media/hero-poster.jpg')
  })

  it('detects source elements with lazy video attributes', () => {
    const result = parseSection('<section><video><source data-srcset="/media/alt.webm 1x, /media/alt-hires.webm 2x" type="video/webm"></video><div>tech</div></section>')

    expect(result.type).toBe('video')
    expect(result.data.video_url).toBe('/media/alt.webm')
  })

  it('detects iframe-based video embeds', () => {
    const result = parseSection('<section><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="video"></iframe><p>preview</p></section>')

    expect(result.type).toBe('video')
    expect(result.data.video_url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
  })

  it('detects lightbox-style anchor data-video urls', () => {
    const result = parseSection('<section><a data-video-url="/assets/car-loop.mp4" data-lightbox="gallery" href="/gallery">Watch</a><p>intro</p></section>')

    expect(result.type).toBe('video')
    expect(result.data.video_url).toBe('/assets/car-loop.mp4')
  })

  it('detects Mitsubishi online-media provider blocks', () => {
    const result = parseSection('<section><div class="onlinemedia" data-source-id="yQ_qNCe98OI" data-media="youtube"><picture><source srcset="/content/dam/mmal/discovery-mitsubishi/45-year-anniversary/Luke%20McGregor%20PLAY.jpg"><img class="lazyload" data-src="/content/dam/mmal/discovery-mitsubishi/45-year-anniversary/Luke%20McGregor%20PLAY.jpg"></picture><a href="#" class="play-video disabled"></a></div><p>Along for the Ride</p></section>')

    expect(result.type).toBe('video')
    expect(result.data.video_url).toBe('https://www.youtube.com/watch?v=yQ_qNCe98OI')
    expect(result.data.poster_url).toBe('/content/dam/mmal/discovery-mitsubishi/45-year-anniversary/Luke%20McGregor%20PLAY.jpg')
  })
})

const TABS_ARIA = `
<section class="model-features">
  <div role="tablist" class="feature-tabs">
    <button role="tab" aria-selected="true" id="t1">Exterior</button>
    <button role="tab" id="t2">Interior</button>
    <button role="tab" id="t3">Tech</button>
  </div>
  <div role="tabpanel" aria-labelledby="t1"><p>Exterior body copy that is long enough.</p></div>
  <div role="tabpanel" aria-labelledby="t2"><p>Interior body copy that is long enough.</p></div>
  <div role="tabpanel" aria-labelledby="t3"><p>Technology copy that is long enough.</p></div>
</section>`

const CAROUSEL = `
<div class="offers-carousel swiper">
  <div class="swiper-wrapper">
    <div class="swiper-slide"><img src="/a.jpg"></div>
    <div class="swiper-slide"><img src="/b.jpg"></div>
    <div class="swiper-slide"><img src="/c.jpg"></div>
  </div>
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

const ACCORDION = `
<div class="faq accordion">
  <div class="accordion-item">
    <button class="accordion-header" aria-expanded="true">Warranty</button>
    <div class="accordion-content"><p>Five years unlimited kilometres.</p></div>
  </div>
  <div class="accordion-item">
    <button class="accordion-header">Servicing</button>
    <div class="accordion-content"><p>Capped price servicing details.</p></div>
  </div>
</div>`

const GALLERY = `
<div class="model-gallery">
  <img class="gallery-main" src="/hero.jpg" width="1200" height="675">
  <div class="gallery-thumbs">
    <div class="thumb"><img src="/1.jpg"></div>
    <div class="thumb"><img src="/2.jpg"></div>
    <div class="thumb"><img src="/3.jpg"></div>
    <div class="thumb"><img src="/4.jpg"></div>
  </div>
</div>`

describe('detectInteractiveRegions', () => {
  it('detects ARIA tabs with triggers and panels', () => {
    const regions = detectInteractiveRegions(TABS_ARIA)

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('tabs')
    expect(regions[0].triggerCount).toBe(3)
    expect(regions[0].panelCount).toBe(3)
  })

  it('detects a swiper carousel with track and slides', () => {
    const regions = detectInteractiveRegions(CAROUSEL)

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('carousel')
    expect(regions[0].panelCount).toBe(3)
  })

  it('detects an ARIA-pattern carousel (aria-roledescription) with no class hints', () => {
    const regions = detectInteractiveRegions(ARIA_CAROUSEL)

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('carousel')
    expect(regions[0].panelCount).toBe(3)
  })

  it('detects an accordion with header/content pairs', () => {
    const regions = detectInteractiveRegions(ACCORDION)

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('accordion')
    expect(regions[0].triggerCount).toBe(2)
  })

  it('detects a gallery with a main image and thumbnails', () => {
    const regions = detectInteractiveRegions(GALLERY)

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('gallery-lightbox')
  })

  it('detects a gallery main image by largest attribute area when no main class is present', () => {
    const unclassedGallery = `
<div class="model-gallery">
  <img src="/hero.jpg" width="1200" height="675">
  <div class="gallery-thumbs">
    <div class="thumb"><img src="/1.jpg" width="100" height="60"></div>
    <div class="thumb"><img src="/2.jpg" width="100" height="60"></div>
    <div class="thumb"><img src="/3.jpg" width="100" height="60"></div>
  </div>
</div>`

    const regions = detectInteractiveRegions(unclassedGallery)

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('gallery-lightbox')
  })

  it('requires both halves — triggers without panels is not tabs', () => {
    const half = '<div class="tabs"><button class="tab-button">A</button><button class="tab-button">B</button></div>'

    expect(detectInteractiveRegions(half)).toHaveLength(0)
  })

  it('keeps only the outer region when regions nest', () => {
    const nested = TABS_ARIA.replace('<p>Exterior body copy that is long enough.</p>', CAROUSEL)

    const regions = detectInteractiveRegions(nested)

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('tabs')
  })

  it('returns [] for plain content', () => {
    expect(detectInteractiveRegions('<main><h1>Amarok</h1><p>Copy.</p></main>')).toEqual([])
  })

  it('rootSelectorPath resolves consistently for fragment and full-document input', () => {
    // Task 3's clone-annotator resolves rootSelectorPath by walking
    // $.root().children() (tag nodes only) one index per level. Since
    // captureModelPage HTML is a fragment of body content but cheerio always
    // normalizes parsed markup to a root -> html -> head/body tree, the same
    // path must resolve to the same element whether the region was detected
    // against a bare fragment or the same content wrapped in a full document.
    function resolveByPath(sourceHtml: string, path: string) {
      const $ = load(sourceHtml)
      let node: any = $.root()[0]
      for (const idxStr of path.split('.')) {
        const idx = Number(idxStr)
        const tagChildren = (node?.children || []).filter((c: any) => c.type === 'tag')
        node = tagChildren[idx]
      }
      return node
    }

    const [fragmentRegion] = detectInteractiveRegions(TABS_ARIA)
    const fullDocument = `<!DOCTYPE html><html><head><title>x</title></head><body>${TABS_ARIA}</body></html>`
    const [fullDocRegion] = detectInteractiveRegions(fullDocument)

    expect(fragmentRegion.rootSelectorPath).toBe(fullDocRegion.rootSelectorPath)

    const resolved = resolveByPath(TABS_ARIA, fragmentRegion.rootSelectorPath)
    expect(resolved?.attribs?.class).toBe('model-features')

    const resolvedFromFullDoc = resolveByPath(fullDocument, fullDocRegion.rootSelectorPath)
    expect(resolvedFromFullDoc?.attribs?.class).toBe('model-features')
  })

  it('detects two sibling tab widgets as two regions, not one inflated wrapper', () => {
    const widget = (n: number) => `
  <section class="model-features-${n}">
    <div role="tablist"><button role="tab" aria-selected="true" id="w${n}t1">A</button><button role="tab" id="w${n}t2">B</button></div>
    <div role="tabpanel" aria-labelledby="w${n}t1"><p>Widget ${n} panel one content.</p></div>
    <div role="tabpanel" aria-labelledby="w${n}t2"><p>Widget ${n} panel two content.</p></div>
  </section>`
    const html = `<div class="page-wrapper">${widget(1)}${widget(2)}</div>`

    const regions = detectInteractiveRegions(html)

    expect(regions).toHaveLength(2)
    expect(regions[0].rootSelectorPath).not.toBe(regions[1].rootSelectorPath)
    expect(regions.every(r => r.type === 'tabs')).toBe(true)
  })

  it('does not detect a tablist whose panels live beyond the climb cap', () => {
    const html = `<div><div><div><div><div><div>
      <div role="tablist"><button role="tab">A</button><button role="tab">B</button></div>
    </div></div></div></div></div>
    <div role="tabpanel"><p>Orphan panel one far away.</p></div>
    <div role="tabpanel"><p>Orphan panel two far away.</p></div></div>`

    const regions = detectInteractiveRegions(html)

    expect(regions).toHaveLength(0)
  })
})

describe('feature-overlay detection', () => {
  const propilotSection = (inner = '') =>
    `<div data-compprops="${ARIYA_PROPILOT_COMPPROPS_ATTR}" data-compid="feature-comp" data-rendered="true">${inner}</div>`

  it('detects a modal-CTA compprops section from the real Ariya ProPILOT fixture', () => {
    const regions = detectInteractiveRegions(propilotSection('<section><p>rendered body</p></section>'))

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('feature-overlay')
    expect(regions[0].triggerCount).toBe(0) // Nissan captures carry no trigger DOM
    expect(regions[0].panelCount).toBe(1)
  })

  it('counts captured learn-more trigger DOM when present', () => {
    const regions = detectInteractiveRegions(propilotSection('<button class="cta"><span class="icon-plus"></span>LEARN MORE</button>'))

    expect(regions).toHaveLength(1)
    expect(regions[0].triggerCount).toBeGreaterThan(0)
  })

  it('ignores compprops without featureItems, invalid JSON, and non-modal sections without triggers', () => {
    const noItems = '<div data-compprops="{&quot;faqItems&quot;:[{&quot;faqQuestion&quot;:&quot;Q&quot;}]}"><p>x</p></div>'
    const badJson = '<div data-compprops="not json"><p>x</p></div>'
    const noSignal = '<div data-compprops="{&quot;featureItems&quot;:[{&quot;label&quot;:&quot;A&quot;}]}"><p>x</p></div>'

    expect(detectInteractiveRegions(noItems)).toHaveLength(0)
    expect(detectInteractiveRegions(badJson)).toHaveLength(0)
    expect(detectInteractiveRegions(noSignal)).toHaveLength(0)
  })

  it('keeps a carousel detected INSIDE a feature-overlay section (dedup exemption)', () => {
    const carousel = `
      <div class="feature swiper">
        <div class="swiper-wrapper">
          <div class="swiper-slide"><img src="/a.jpg"></div>
          <div class="swiper-slide"><img src="/b.jpg"></div>
        </div>
      </div>`
    const regions = detectInteractiveRegions(propilotSection(carousel))

    expect(regions.map(r => r.type).sort()).toEqual(['carousel', 'feature-overlay'])
  })
})

describe('parseFeatureOverlayProps', () => {
  it('parses the real Ariya ProPILOT compprops', () => {
    const decoded = load(`<div data-compprops="${ARIYA_PROPILOT_COMPPROPS_ATTR}"></div>`)('div').attr('data-compprops')
    const props = parseFeatureOverlayProps(decoded)

    expect(props).not.toBeNull()
    expect(props!.hasModalCta).toBe(true)
    expect(props!.items).toHaveLength(1)
    expect(props!.items[0].label).toContain('ProPILOT')
    expect(props!.items[0].desktopImagePath).toContain('nissan-cdn.net')
    expect(props!.items[0].featureDescription).toContain('technologies')
  })

  it('returns null for empty/undefined/drifted shapes instead of throwing', () => {
    expect(parseFeatureOverlayProps(undefined)).toBeNull()
    expect(parseFeatureOverlayProps('')).toBeNull()
    expect(parseFeatureOverlayProps('{"featureItems":[]}')).toBeNull()
    expect(parseFeatureOverlayProps('{"featureItems":"drifted"}')).toBeNull()
    expect(parseFeatureOverlayProps('{"featureItems":[null, 42]}')).toBeNull()
  })
})

describe('feature-slider detection', () => {
  const sliderInner = `
    <div class="custom-slider-container">
      <div class="arrow-container">
        <button class="previous arrow-button disabled" data-id="C402_cmp_feature_bcf3-feature-carousel-previous" disabled=""></button>
        <button class="next arrow-button" data-id="C402_cmp_feature_bcf3-feature-carousel-next"></button>
      </div>
      <div class="slider-list" data-id="feature-slider-list">
        <div class="slider-media active-item" data-id="feature-slider-media" data-media-type="image">
          <picture><img alt="Nissan Ariya Side Angle" src="/side.png"></picture>
          <h4 data-id="C402_cmp_feature_bcf3-feature-item-0-label">OVERALL DIMENSIONS</h4>
          <p data-id="C402_cmp_feature_bcf3-feature-item-0-featureDescription">A - Overall length</p>
        </div>
      </div>
    </div>`

  it('detects the slider inside its feature-overlay section (real dimensions compprops, 2 items)', () => {
    const html = `<div data-compprops="${ARIYA_DIMENSIONS_COMPPROPS_ATTR}" data-compid="feature-comp">${sliderInner}</div>`
    const regions = detectInteractiveRegions(html)

    expect(regions.map(r => r.type).sort()).toEqual(['feature-overlay', 'feature-slider'])
    const slider = regions.find(r => r.type === 'feature-slider')!
    expect(slider.triggerCount).toBe(2)
    expect(slider.panelCount).toBe(2)
  })

  it('skips single-item sections and containers without arrows', () => {
    const oneItem = `<div data-compprops="${ARIYA_PROPILOT_COMPPROPS_ATTR}">${sliderInner}</div>`
    expect(detectInteractiveRegions(oneItem).map(r => r.type)).toEqual(['feature-overlay'])

    const noArrows = `<div data-compprops="${ARIYA_DIMENSIONS_COMPPROPS_ATTR}"><div class="custom-slider-container"><div data-id="feature-slider-media"></div></div></div>`
    expect(detectInteractiveRegions(noArrows).map(r => r.type)).toEqual(['feature-overlay'])
  })
})
