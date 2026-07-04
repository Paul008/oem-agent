import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'
import { detectInteractiveRegions, parseSection } from './section-parser'

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
})
