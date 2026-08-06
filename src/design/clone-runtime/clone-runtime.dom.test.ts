// @vitest-environment jsdom
//
// Behavioral coverage for the clone runtime's $el -> this.root binding fix (commit 13d6a07).
// Every other clone-runtime test asserts on the generated SOURCE string; this one EXECUTES the
// component factories in jsdom and drives their lifecycle to prove the runtime keeps working after
// Alpine's CSP build rebinds $el to the descendant element that fired an event.
import { describe, expect, it } from 'vitest'

import { ALPINE_CSP_JS } from './alpine-csp'
import { buildCloneRuntimeScript } from './clone-runtime'

type Factory = () => Record<string, any>

// The runtime script is `${COMPONENTS_JS}\n;${ALPINE_CSP_JS}`: the registration block registers each
// component via Alpine.data(name, factory) inside an 'alpine:init' listener. Slice off the Alpine
// library, run just the registration block against a stub Alpine that captures the factories, then
// fire alpine:init so the listener runs. (indexOf on the lib's first 80 chars mirrors the existing
// buildCloneRuntimeScript ordering test.)
function captureFactories(): Record<string, Factory> {
  const full = buildCloneRuntimeScript()
  const libStart = full.indexOf(ALPINE_CSP_JS.slice(0, 80))
  const registrationSource = libStart > -1 ? full.slice(0, libStart) : full

  const captured: Record<string, Factory> = {}
  const AlpineStub = { data: (name: string, factory: Factory) => { captured[name] = factory } }
  // eslint-disable-next-line no-new-func
  const register = new Function('Alpine', 'document', registrationSource)
  register(AlpineStub, document)
  document.dispatchEvent(new Event('alpine:init'))
  return captured
}

const factories = captureFactories()

describe('clone runtime components (jsdom-executed)', () => {
  it('cloneCarousel.next() writes to this.root/this.track, not the rebound $el (a descendant button)', () => {
    const root = document.createElement('div')
    // Track is a DESCENDANT wrapper (normal, non-C2 path); the next button is nested inside a
    // controls wrapper — a descendant of root, NOT a direct child — matching real slider markup.
    root.innerHTML = `
      <div data-clone-track>
        <div data-clone-slide="0"></div>
        <div data-clone-slide="1"></div>
      </div>
      <div class="controls"><button class="next">next</button></div>`
    const track = root.querySelector('[data-clone-track]') as HTMLElement
    const slides = Array.from(root.querySelectorAll('[data-clone-slide]')) as HTMLElement[]
    const nextBtn = root.querySelector('.next') as HTMLElement
    // jsdom has no layout, so stub offsetLeft to give the transform a measurable delta.
    slides.forEach((slide, i) => Object.defineProperty(slide, 'offsetLeft', { get: () => i * 300, configurable: true }))

    const carousel = factories.cloneCarousel()
    carousel.$el = root
    carousel.init()

    expect(carousel.track).toBe(track)
    expect(carousel.slides).toHaveLength(2)
    expect(root.getAttribute('data-clone-carousel-index')).toBe('0')

    // Simulate the Alpine CSP build rebinding $el to the clicked descendant button before next runs.
    carousel.$el = nextBtn
    carousel.next()

    expect(carousel.index).toBe(1)
    // Written against the root cached at init — NOT the rebound $el (the button).
    expect(root.getAttribute('data-clone-carousel-index')).toBe('1')
    expect(nextBtn.getAttribute('data-clone-carousel-index')).toBeNull()
    // Transform written against the track cached at init — NOT the button.
    expect(track.style.transform).toContain('translateX(-300px)')
    expect(nextBtn.style.transform).toBe('')
  })

  it('cloneTabs.selectTab() shows the right panel via panels cached at init, after $el is rebound to a trigger', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="tablist">
        <button data-clone-tab="0" aria-selected="true">A</button>
        <button data-clone-tab="1" aria-selected="false">B</button>
      </div>
      <div data-clone-panel="0">Panel A</div>
      <div data-clone-panel="1">Panel B</div>`
    const tab1 = root.querySelectorAll('[data-clone-tab]')[1] as HTMLElement
    const panel0 = root.querySelector('[data-clone-panel="0"]') as HTMLElement
    const panel1 = root.querySelector('[data-clone-panel="1"]') as HTMLElement

    const tabs = factories.cloneTabs()
    tabs.$el = root
    tabs.init()

    // init resolved the aria-selected trigger (index 0) and showed its panel.
    expect(panel0.style.display).toBe('block')
    expect(panel1.style.display).toBe('none')

    // Rebind $el to the descendant trigger (as Alpine would inside the x-on handler), then select it.
    tabs.$el = tab1
    tabs.selectTab({ currentTarget: tab1 })

    // show() operated on the panels captured at init (root-scoped), not a re-query of the rebound
    // $el (tab1 has no [data-clone-panel] descendants — that path would update nothing).
    expect(panel1.style.display).toBe('block')
    expect(panel0.style.display).toBe('none')
  })
})

describe('cloneFeatureOverlay (jsdom-executed)', () => {
  const COMPPROPS = JSON.stringify({
    featureItems: [{
      label: 'ProPILOT',
      featureDescription: 'Driver assist tech <script>not html</script>',
      desktopImagePath: '//www-asia.nissan-cdn.net/content/dam/ariya/ProPilot-hp.png',
      tabletImagePath: '//www-asia.nissan-cdn.net/content/dam/ariya/ProPilot-hp.png',
      mobileImagePath: '//www-asia.nissan-cdn.net/content/dam/ariya/ProPilot-hp.png',
      imageAltText: 'ProPILOT Assist',
    }],
    ctaText: 'LEARN MORE',
    ctaRedirect: 'modalIframe',
    ctaDesign: 'modalCta',
    title: 'High-tech, low-stress',
    subtitle: 'DRIVER ASSIST & SAFETY',
  })

  function mountComponent(root: HTMLElement) {
    const component = factories['cloneFeatureOverlay']() as Record<string, any>
    component.$el = root
    component.init()
    return component
  }

  function makeRoot(): HTMLElement {
    const root = document.createElement('div')
    root.setAttribute('data-clone-interaction', 'feature-overlay')
    root.setAttribute('data-compprops', COMPPROPS)
    document.body.appendChild(root)
    return root
  }

  it('renders its own trigger when no captured trigger exists, labelled from compprops', () => {
    const root = makeRoot()
    const component = mountComponent(root)

    const trigger = root.querySelector('.clone-fo-trigger') as HTMLButtonElement
    expect(trigger).not.toBeNull()
    expect(trigger.textContent).toContain('LEARN MORE')
    expect(component.overlay).toBeNull()
    root.remove()
  })

  it('open() renders overlay content as text (no HTML injection), close() restores the page', () => {
    const root = makeRoot()
    document.body.style.overflow = ''
    const component = mountComponent(root)

    component.open()
    const overlay = root.querySelector('.clone-fo-overlay') as HTMLElement
    expect(overlay).not.toBeNull()
    expect(overlay.getAttribute('role')).toBe('dialog')
    expect(overlay.getAttribute('aria-modal')).toBe('true')
    // untrusted description rendered as text, not parsed as markup
    expect(overlay.querySelector('script')).toBeNull()
    expect(overlay.textContent).toContain('<script>not html</script>')
    expect(overlay.textContent).toContain('DRIVER ASSIST & SAFETY')
    expect(overlay.textContent).toContain('High-tech, low-stress')
    // image resolved to absolute https (no proxied img present on this page)
    const img = overlay.querySelector('img.clone-fo-image') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://www-asia.nissan-cdn.net/content/dam/ariya/ProPilot-hp.png')
    expect(img.alt).toBe('ProPILOT Assist')
    // scroll locked while open
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')

    component.close()
    expect(root.querySelector('.clone-fo-overlay')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(document.documentElement.style.overflow).toBe('')
    root.remove()
  })

  it('routes overlay images through the media proxy when the page already uses it', () => {
    const proxied = document.createElement('img')
    proxied.src = 'https://oem-agent.example.workers.dev/media/pages/assets/nissan-au/ariya/existing.png'
    document.body.appendChild(proxied)
    const root = makeRoot()
    const component = mountComponent(root)

    component.open()
    const img = root.querySelector('img.clone-fo-image') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://oem-agent.example.workers.dev/media/pages/assets/nissan-au/ariya/ProPilot-hp.png')

    component.close()
    root.remove()
    proxied.remove()
  })

  it('falls back to the absolute CDN URL when the proxied overlay image errors', () => {
    const proxied = document.createElement('img')
    proxied.src = 'https://oem-agent.example.workers.dev/media/pages/assets/nissan-au/x-trail/existing.png'
    document.body.appendChild(proxied)
    const root = makeRoot()
    const component = mountComponent(root)

    component.open()
    const img = root.querySelector('img.clone-fo-image') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://oem-agent.example.workers.dev/media/pages/assets/nissan-au/x-trail/ProPilot-hp.png')
    img.dispatchEvent(new Event('error'))
    expect(img.getAttribute('src')).toBe('https://www-asia.nissan-cdn.net/content/dam/ariya/ProPilot-hp.png')

    component.close()
    root.remove()
    proxied.remove()
  })

  it('closes on Escape and on backdrop click, but not on panel click', () => {
    const root = makeRoot()
    const component = mountComponent(root)

    component.open()
    const panel = root.querySelector('.clone-fo-panel') as HTMLElement
    panel.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(root.querySelector('.clone-fo-overlay')).not.toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(root.querySelector('.clone-fo-overlay')).toBeNull()

    component.open()
    const overlay = root.querySelector('.clone-fo-overlay') as HTMLElement
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(root.querySelector('.clone-fo-overlay')).toBeNull()
    root.remove()
  })

  it('injects overlay styles once, scoped under the stamped region attribute', () => {
    const root = makeRoot()
    mountComponent(root)
    const second = makeRoot()
    mountComponent(second)

    const styles = document.querySelectorAll('#clone-feature-overlay-styles')
    expect(styles).toHaveLength(1)
    expect(styles[0].textContent).toContain('[data-clone-interaction="feature-overlay"]')
    // every rule is scoped — no bare selectors that could leak into the dealer shell
    const bare = (styles[0].textContent || '').split('\n').filter(line => line.trim() && !line.includes('[data-clone-interaction="feature-overlay"]') && !line.trim().startsWith('@media') && !line.trim().startsWith('}'))
    expect(bare).toEqual([])
    root.remove(); second.remove()
  })

  it('does not throw and renders nothing for drifted compprops', () => {
    const root = document.createElement('div')
    root.setAttribute('data-compprops', '{"featureItems":"drifted"}')
    document.body.appendChild(root)
    const component = mountComponent(root)

    expect(() => component.open()).not.toThrow()
    expect(root.querySelector('.clone-fo-overlay')).toBeNull()
    root.remove()
  })
})

describe('cloneFeatureSlider (jsdom-executed)', () => {
  const ITEMS = [
    { label: 'OVERALL DIMENSIONS', featureDescription: 'A - Overall length: 4,595 mm', desktopImagePath: '//cdn.example/side-EVOLVE-vlp.png', tabletImagePath: null, mobileImagePath: null, imageAltText: 'Side Angle' },
    { label: 'OVERALL DIMENSIONS', featureDescription: 'C - Overall width: 2,172 mm', desktopImagePath: '//cdn.example/Front-EVOLVE-vlp.png', tabletImagePath: null, mobileImagePath: null, imageAltText: 'Front Angle' },
  ]

  function makeSlider() {
    const host = document.createElement('div')
    host.setAttribute('data-compprops', JSON.stringify({ featureItems: ITEMS }))
    host.innerHTML = `
      <div class="custom-slider-container" data-clone-interaction="feature-slider">
        <button class="previous arrow-button disabled" data-clone-prev="" disabled></button>
        <button class="next arrow-button" data-clone-next=""></button>
        <div class="slider-list" data-id="feature-slider-list">
          <div class="slider-media" data-id="feature-slider-media">
            <picture>
              <source media="(min-width: 1024px)" srcset="/item0-large.png">
              <img alt="Side Angle" src="/item0.png">
            </picture>
            <h4 data-id="C402-feature-item-0-label">OVERALL DIMENSIONS</h4>
            <p data-id="C402-feature-item-0-featureDescription">A - Overall length: 4,595 mm</p>
          </div>
        </div>
      </div>`
    document.body.appendChild(host)
    const root = host.querySelector('.custom-slider-container') as HTMLElement
    const component = factories['cloneFeatureSlider']() as Record<string, any>
    component.$el = root
    component.init()
    return { host, root, component }
  }

  it('binds items from the compprops ancestor and starts with prev disabled', () => {
    const { host, root, component } = makeSlider()
    expect(component.items).toHaveLength(2)
    expect((root.querySelector('[data-clone-prev]') as HTMLButtonElement).disabled).toBe(true)
    expect((root.querySelector('[data-clone-next]') as HTMLButtonElement).disabled).toBe(false)
    host.remove()
  })

  it('next() swaps image/label/description, drops <source> overrides, and toggles arrow states', () => {
    const { host, root, component } = makeSlider()
    component.next()

    const img = root.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://cdn.example/Front-EVOLVE-vlp.png')
    expect(img.alt).toBe('Front Angle')
    expect(root.querySelectorAll('source')).toHaveLength(0)
    expect(root.querySelector('[data-id$="-featureDescription"]')!.textContent).toContain('Overall width')
    expect((root.querySelector('[data-clone-prev]') as HTMLButtonElement).disabled).toBe(false)
    expect((root.querySelector('[data-clone-next]') as HTMLButtonElement).disabled).toBe(true)
    expect(root.getAttribute('data-clone-slider-index')).toBe('1')

    component.prev()
    expect((root.querySelector('img') as HTMLImageElement).getAttribute('src')).toBe('https://cdn.example/side-EVOLVE-vlp.png')
    expect((root.querySelector('[data-clone-prev]') as HTMLButtonElement).disabled).toBe(true)
    host.remove()
  })

  it('clamps at bounds and stays inert on drifted compprops', () => {
    const { host, component } = makeSlider()
    component.prev() // already at 0
    expect(component.index).toBe(0)

    const bare = document.createElement('div')
    bare.setAttribute('data-compprops', 'not json')
    const inner = document.createElement('div')
    bare.appendChild(inner)
    document.body.appendChild(bare)
    const drifted = factories['cloneFeatureSlider']() as Record<string, any>
    drifted.$el = inner
    expect(() => { drifted.init(); drifted.next() }).not.toThrow()
    expect(drifted.items).toHaveLength(0)
    bare.remove()
    host.remove()
  })
})
