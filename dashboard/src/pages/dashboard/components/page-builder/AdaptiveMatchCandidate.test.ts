// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'

import type { CandidateGraph } from '@/lib/adaptive-match-contracts'

import AdaptiveMatchCandidate from './AdaptiveMatchCandidate.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

function mountCandidate(graph: CandidateGraph) {
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp(AdaptiveMatchCandidate, { graph, oemId: 'nissan-au' })
  app.mount(container)
  mounted.push(app)
  return container
}

function graph(section: CandidateGraph['section'], interaction: CandidateGraph['interaction']): CandidateGraph {
  const kind = section.type === 'content-block'
    ? 'static'
    : interaction!.kind
  return {
    version: 1,
    kind,
    regionId: 'safety',
    confidence: 0.92,
    section,
    interaction,
    provenance: {
      strategy: kind === 'static' ? 'deterministic' : 'ai-interpretation',
      attempt: 1,
    },
  } as CandidateGraph
}

afterEach(() => {
  for (const app of mounted.splice(0)) app.unmount()
  document.body.innerHTML = ''
})

describe('adaptiveMatchCandidate', () => {
  it('advances a carousel through stable interaction hooks', async () => {
    const container = mountCandidate(graph({
      type: 'gallery',
      title: 'Safety',
      layout: 'carousel',
      images: [
        { url: 'https://example.test/one.png', alt: 'One', caption: 'One', description: '' },
        { url: 'https://example.test/two.png', alt: 'Two', caption: 'Two', description: '' },
      ],
      initialIndex: 0,
      lightbox: false,
      layoutTokens: { desktopColumns: 1 },
      appearanceTokens: {},
    }, { kind: 'carousel', wrap: true, keyboard: true, showIndicators: true }))

    expect(container.querySelector('[data-adaptive-item="0"]')?.getAttribute('data-adaptive-active')).toBe('true')
    ;(container.querySelector('[data-adaptive-next]') as HTMLButtonElement).click()
    await nextTick()
    expect(container.querySelector('[data-adaptive-item="1"]')?.getAttribute('data-adaptive-active')).toBe('true')
  })

  it('opens and closes a gallery lightbox with Escape', async () => {
    const container = mountCandidate(graph({
      type: 'gallery',
      title: 'Gallery',
      layout: 'grid',
      images: [{ url: 'https://example.test/one.png', alt: 'One', caption: 'One', description: 'First image' }],
      initialIndex: 0,
      lightbox: true,
      layoutTokens: {},
      appearanceTokens: {},
    }, { kind: 'gallery-lightbox', wrap: true, keyboard: true }))

    ;(container.querySelector('[data-adaptive-item="0"]') as HTMLElement).click()
    await nextTick()
    const lightbox = document.querySelector('[data-adaptive-lightbox]') as HTMLElement
    expect(lightbox).toBeTruthy()
    lightbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(document.querySelector('[data-adaptive-lightbox]')).toBeNull()
  })

  it('updates accessible tabs and panels', async () => {
    const container = mountCandidate(graph({
      type: 'tabs',
      title: 'Features',
      category: '',
      tabs: [
        { label: 'Comfort', contentHtml: '<p>Comfort copy</p>', imageUrl: '', imageAlt: '' },
        { label: 'Safety', contentHtml: '<p>Safety copy</p>', imageUrl: '', imageAlt: '' },
      ],
      defaultTab: 0,
      layoutTokens: {},
      appearanceTokens: {},
    }, { kind: 'tabs', keyboard: true, activation: 'automatic' }))

    const tabs = container.querySelectorAll('[data-adaptive-tab]')
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    ;(tabs[1] as HTMLButtonElement).click()
    await nextTick()
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-adaptive-panel="1"]')?.textContent).toContain('Safety copy')
  })

  it('updates accessible accordion state', async () => {
    const container = mountCandidate(graph({
      type: 'accordion',
      title: 'Questions',
      items: [{ question: 'Warranty?', answer: 'Five years.' }],
      allowMultiple: true,
      layoutTokens: {},
      appearanceTokens: {},
    }, { kind: 'accordion', allowMultiple: true, keyboard: true }))
    const trigger = container.querySelector('[data-adaptive-accordion-trigger="0"]') as HTMLButtonElement

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    trigger.click()
    await nextTick()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('Five years.')
  })

  it('renders deterministic content without executable nodes', () => {
    const container = mountCandidate(graph({
      type: 'content-block',
      title: 'Safety',
      contentHtml: '<p>Five-star ANCAP safety.</p>',
      generatedHtml: '<div><strong>Five-star ANCAP safety.</strong></div>',
      generatedCss: '',
      layoutTokens: {},
      appearanceTokens: {},
    }, null))

    expect(container.textContent).toContain('Five-star ANCAP safety.')
    expect(container.querySelector('script,iframe,object,embed')).toBeNull()
  })
})
