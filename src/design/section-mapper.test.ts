/**
 * Tests for the unified DOM → section mapper.
 *
 * The mapper takes a whole cloned OEM page and turns it into an ordered list
 * of structured builder sections, deterministically, with a confidence score
 * per section. Low-confidence pages are routed to an injectable AI fallback.
 *
 * These fixtures deliberately span different OEM/CMS stacks (AEM, Storyblok,
 * kwcms, generic Bootstrap) to prove the mapping is stable across stacks, not
 * just one OEM.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  scoreSection,
  splitPageRegions,
  mapPageToSections,
  mapPage,
  type MappedSection,
} from './section-mapper'

// ---------------------------------------------------------------------------
// Fixtures — representative of different CMS stacks
// ---------------------------------------------------------------------------

// Ford-like (AEM): semantic <section> children, BEM-ish class names
const FORD_PAGE = `
<body>
  <nav class="site-nav"><a href="/">Home</a></nav>
  <section class="hero hero--model">
    <h1>All-New Mustang</h1>
    <p>Iconic performance, reimagined.</p>
    <img src="https://www.ford.com/media/mustang-hero.jpg" alt="Mustang">
    <a href="/build"><span>Build &amp; Price</span></a>
  </section>
  <section class="grid-blocks">
    <div class="grid-blocks__block"><img src="/media/a.jpg"><h3>Power</h3><p>500hp</p></div>
    <div class="grid-blocks__block"><img src="/media/b.jpg"><h3>Handling</h3><p>Track ready</p></div>
    <div class="grid-blocks__block"><img src="/media/c.jpg"><h3>Tech</h3><p>SYNC 4</p></div>
  </section>
  <footer class="site-footer">© Ford</footer>
</body>`

// GWM-like (Storyblok / Swiper): different class vocabulary
const GWM_PAGE = `
<body>
  <header><div class="logo">GWM</div></header>
  <div class="hero-banner">
    <h2>Haval H6</h2>
    <p>The intelligent SUV.</p>
    <img src="/media/pages/gwm-au/h6/hero.jpg">
    <a href="/h6/enquire">Enquire Now</a>
  </div>
  <div class="cta-cards__swiper-container">
    <div class="cta-card"><img src="/media/1.jpg"><h3>Safety</h3></div>
    <div class="cta-card"><img src="/media/2.jpg"><h3>Comfort</h3></div>
    <div class="cta-card"><img src="/media/3.jpg"><h3>Design</h3></div>
    <div class="cta-card"><img src="/media/4.jpg"><h3>Drive</h3></div>
  </div>
  <footer>GWM Australia</footer>
</body>`

// Kia-like (kwcms): a hero plus an image carousel/gallery
const KIA_PAGE = `
<body>
  <section class="visual-area">
    <h1>Sportage</h1>
    <p>Built for whatever's next.</p>
    <img src="/media/sportage-hero.jpg">
  </section>
  <section class="swiper gallery-area">
    <img src="/media/g1.jpg" alt="front">
    <img src="/media/g2.jpg" alt="side">
    <img src="/media/g3.jpg" alt="rear">
    <img src="/media/g4.jpg" alt="interior">
  </section>
</body>`

// Generic Bootstrap stack with an opaque text-only block (should be low-confidence)
const GENERIC_PAGE = `
<body>
  <section class="container hero-section">
    <h1>Model X</h1>
    <p>A great car.</p>
    <img src="/media/x.jpg">
  </section>
  <div class="container">
    <div class="row">
      <div class="col-md-4"><img src="/media/f1.jpg"><h4>Feature 1</h4></div>
      <div class="col-md-4"><img src="/media/f2.jpg"><h4>Feature 2</h4></div>
      <div class="col-md-4"><img src="/media/f3.jpg"><h4>Feature 3</h4></div>
    </div>
  </div>
</body>`

// A page that is mostly opaque div-soup of prose — deterministic parsing should
// produce mostly content-block fallbacks, triggering AI fallback.
const OPAQUE_PAGE = `
<body>
  <div class="block-1"><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do.</p></div>
  <div class="block-2"><p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p></div>
  <div class="block-3"><p>Duis aute irure dolor in reprehenderit in voluptate velit esse.</p></div>
</body>`

// AEM-like (real Ford Mustang shape): the real content sits several
// single-child wrapper levels deep (root > aem-Grid > aem-GridColumn > aem-Grid),
// and the body also carries stray tracking <img> noise siblings.
const AEM_DEEP_PAGE = `<body>
  <div class="root responsivegrid"><div class="aem-Grid aem-Grid--12"><div class="responsivegrid aem-GridColumn"><div class="aem-Grid aem-Grid--12">
    <div class="billboardCarousel carousel"><h1>Mustang</h1><p>They'll hear you.</p><img src="/m/hero.jpg"></div>
    <div class="container responsivegrid"><h2>Unbelievable power</h2><p>unlimited fun.</p><img src="/m/power.jpg"></div>
    <div class="cardcomponents">
      <div class="card"><img src="/m/c1.jpg"><h3>Track</h3></div>
      <div class="card"><img src="/m/c2.jpg"><h3>Road</h3></div>
      <div class="card"><img src="/m/c3.jpg"><h3>Style</h3></div>
    </div>
  </div></div></div></div>
  <img src="/m/pixel1.gif">
  <img src="/m/pixel2.gif">
</body>`

// ---------------------------------------------------------------------------
// scoreSection
// ---------------------------------------------------------------------------

describe('scoreSection', () => {
  it('scores a complete hero (heading + image) highly', () => {
    const score = scoreSection({
      type: 'hero',
      data: { heading: 'Mustang', sub_heading: 'Fast', desktop_image_url: '/media/h.jpg' },
    })
    expect(score).toBeGreaterThanOrEqual(0.8)
  })

  it('scores a content-block fallback low (nothing matched a real pattern)', () => {
    const score = scoreSection({
      type: 'content-block',
      data: { title: '', content_html: '<p>some text</p>' },
    })
    expect(score).toBeLessThan(0.5)
  })

  it('scores feature-cards with images higher than a card list with no images', () => {
    const withImages = scoreSection({
      type: 'feature-cards',
      data: { cards: [{ title: 'a', image_url: '/1.jpg' }, { title: 'b', image_url: '/2.jpg' }] },
    })
    const withoutImages = scoreSection({
      type: 'feature-cards',
      data: { cards: [{ title: 'a', image_url: '' }, { title: 'b', image_url: '' }] },
    })
    expect(withImages).toBeGreaterThan(withoutImages)
  })
})

// ---------------------------------------------------------------------------
// splitPageRegions
// ---------------------------------------------------------------------------

describe('splitPageRegions', () => {
  it('splits a multi-section page into its top-level regions', () => {
    const regions = splitPageRegions(FORD_PAGE)
    // hero + grid-blocks, nav/footer excluded
    expect(regions.length).toBe(2)
  })

  it('excludes nav, header, and footer chrome', () => {
    const regions = splitPageRegions(FORD_PAGE)
    const joined = regions.map(r => r.html).join('\n').toLowerCase()
    expect(joined).not.toContain('site-nav')
    expect(joined).not.toContain('site-footer')
  })

  it('returns a usable selector hint per region', () => {
    const regions = splitPageRegions(FORD_PAGE)
    expect(regions[0].selector).toContain('hero')
  })

  it('descends into a single generic wrapper rather than returning one giant region', () => {
    const wrapped = `<body><main><section class="hero"><h1>A</h1><img src="/a.jpg"></section><section class="cards"><div class="c"><img src="/1.jpg"><h3>x</h3></div><div class="c"><img src="/2.jpg"><h3>y</h3></div></section></main></body>`
    const regions = splitPageRegions(wrapped)
    expect(regions.length).toBe(2)
  })

  it('skips a11y announcers and nav landmarks so the hero is the first region', () => {
    const withChrome = `<body>
      <span class="nuxt-route-announcer" aria-live="assertive"></span>
      <div role="navigation" class="StickyNav"><a href="/">Home</a></div>
      <section class="hero"><h1>Model X</h1><p>Tagline.</p><img src="/h.jpg"></section>
      <section class="cards"><div class="c"><img src="/1.jpg"><h3>a</h3></div><div class="c"><img src="/2.jpg"><h3>b</h3></div></section>
    </body>`
    const regions = splitPageRegions(withChrome)
    expect(regions[0].selector).toContain('hero')
    const joined = regions.map(r => r.selector).join(' ')
    expect(joined).not.toContain('nuxt-route-announcer')
    expect(joined).not.toContain('StickyNav')
  })

  it('descends through a deep single-meaningful-wrapper chain past stray noise (real AEM shape)', () => {
    const regions = splitPageRegions(AEM_DEEP_PAGE)
    // billboardCarousel + container + cardcomponents — NOT 1 collapsed region,
    // and the two stray tracking <img> on body are excluded.
    expect(regions.length).toBe(3)
    const joined = regions.map(r => r.selector).join(' ')
    expect(joined).toContain('billboardCarousel')
    expect(joined).toContain('cardcomponents')
  })
})

// ---------------------------------------------------------------------------
// mapPageToSections — stability across stacks
// ---------------------------------------------------------------------------

describe('mapPageToSections', () => {
  it('maps a Ford-like (AEM) page: hero first, then a card grid', () => {
    const result = mapPageToSections(FORD_PAGE)
    expect(result.sections[0].type).toBe('hero')
    expect(result.sections.map(s => s.type)).toContain('feature-cards')
    expect(result.needs_ai_fallback).toBe(false)
  })

  it('maps a GWM-like (Storyblok) page with different class names', () => {
    const result = mapPageToSections(GWM_PAGE)
    expect(result.sections[0].type).toBe('hero')
    expect(result.sections.map(s => s.type)).toContain('feature-cards')
    expect(result.needs_ai_fallback).toBe(false)
  })

  it('maps a Kia-like (kwcms) page: hero then gallery', () => {
    const result = mapPageToSections(KIA_PAGE)
    expect(result.sections[0].type).toBe('hero')
    expect(result.sections.map(s => s.type)).toContain('gallery')
  })

  it('maps a generic Bootstrap stack: hero then feature cards', () => {
    const result = mapPageToSections(GENERIC_PAGE)
    expect(result.sections[0].type).toBe('hero')
    expect(result.sections.map(s => s.type)).toContain('feature-cards')
  })

  it('assigns sequential order and stable ids', () => {
    const result = mapPageToSections(FORD_PAGE)
    expect(result.sections.map(s => s.order)).toEqual([0, 1])
    const ids = new Set(result.sections.map(s => s.id))
    expect(ids.size).toBe(result.sections.length)
  })

  it('marks all mapped sections as deterministic source', () => {
    const result = mapPageToSections(FORD_PAGE)
    expect(result.sections.every(s => s.source === 'deterministic')).toBe(true)
  })

  it('flags needs_ai_fallback when the page is mostly opaque prose', () => {
    const result = mapPageToSections(OPAQUE_PAGE)
    expect(result.needs_ai_fallback).toBe(true)
    expect(result.low_confidence_section_ids.length).toBeGreaterThan(0)
  })

  it('maps a deep AEM page into multiple sections (hero + cards), not one collapsed region', () => {
    const result = mapPageToSections(AEM_DEEP_PAGE)
    expect(result.sections.length).toBeGreaterThanOrEqual(3)
    expect(result.sections[0].type).toBe('hero')
    expect(result.sections.map(s => s.type)).toContain('feature-cards')
  })
})

// ---------------------------------------------------------------------------
// mapPage — orchestrator with deterministic-first, AI fallback
// ---------------------------------------------------------------------------

describe('mapPage (deterministic-first, AI fallback)', () => {
  it('does NOT call the AI fallback when deterministic confidence is high', async () => {
    const aiFallback = vi.fn(async (): Promise<MappedSection[]> => [])
    const result = await mapPage(FORD_PAGE, { aiFallback })
    expect(aiFallback).not.toHaveBeenCalled()
    expect(result.ai_fallback_used).toBe(false)
    expect(result.sections[0].type).toBe('hero')
  })

  it('calls the AI fallback when deterministic confidence is low, and uses its output', async () => {
    const aiSections: MappedSection[] = [
      { type: 'intro', data: { title: 'AI', body_html: '<p>x</p>' }, id: 'ai-0', order: 0, confidence: 1, source: 'ai' },
    ]
    const aiFallback = vi.fn(async () => aiSections)
    const result = await mapPage(OPAQUE_PAGE, { aiFallback })
    expect(aiFallback).toHaveBeenCalledOnce()
    expect(result.ai_fallback_used).toBe(true)
    expect(result.sections).toEqual(aiSections)
  })

  it('keeps deterministic output when low confidence but no AI fallback provided', async () => {
    const result = await mapPage(OPAQUE_PAGE)
    expect(result.ai_fallback_used).toBe(false)
    expect(result.sections.length).toBeGreaterThan(0)
    expect(result.sections.every(s => s.source === 'deterministic')).toBe(true)
  })
})
