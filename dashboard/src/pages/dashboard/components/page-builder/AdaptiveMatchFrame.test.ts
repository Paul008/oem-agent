// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

import type { CandidateGraph } from '@/lib/adaptive-match-contracts'

import AdaptiveMatchFrame from './AdaptiveMatchFrame.vue'

function carouselGraph(title = 'Safety'): CandidateGraph {
  return {
    version: 1,
    kind: 'carousel',
    regionId: 'safety',
    confidence: 0.92,
    section: {
      type: 'gallery',
      title,
      layout: 'carousel',
      images: [{ url: 'https://example.test/safety.png', alt: 'Safety', caption: title, description: '' }],
      initialIndex: 0,
      lightbox: false,
      layoutTokens: {},
      appearanceTokens: {},
    },
    interaction: { kind: 'carousel', wrap: true, keyboard: true, showIndicators: true },
    provenance: { strategy: 'ai-interpretation', attempt: 1 },
  }
}

afterEach(() => {
  document.head.querySelectorAll('[data-frame-test-style]').forEach(node => node.remove())
  document.body.innerHTML = ''
})

describe('adaptiveMatchFrame', () => {
  it('mounts the candidate in a same-origin scriptless frame and clones dashboard styles', async () => {
    const style = document.createElement('style')
    style.dataset.frameTestStyle = 'true'
    style.textContent = '.frame-test { color: red; }'
    document.head.append(style)
    const graph = ref(carouselGraph())
    const frame = ref<InstanceType<typeof AdaptiveMatchFrame> | null>(null)
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({
      setup: () => () => h(AdaptiveMatchFrame, {
        ref: frame,
        graph: graph.value,
        oemId: 'nissan-au',
        viewport: { width: 390, height: 844 },
      }),
    })
    app.mount(host)
    await nextTick()
    await frame.value!.ready()

    const iframe = host.querySelector('iframe')!
    expect(iframe.getAttribute('sandbox')).toBe('allow-same-origin')
    expect(iframe.style.width).toBe('390px')
    expect(frame.value!.document()?.head.textContent).toContain('.frame-test')
    expect(frame.value!.root()?.textContent).toContain('Safety')

    graph.value = carouselGraph('Advanced safety')
    await nextTick()
    expect(frame.value!.root()?.textContent).toContain('Advanced safety')

    const mountedRoot = frame.value!.root()!
    app.unmount()
    expect(mountedRoot.isConnected).toBe(false)
  })
})
