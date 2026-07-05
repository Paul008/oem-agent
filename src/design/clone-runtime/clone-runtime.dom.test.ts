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
