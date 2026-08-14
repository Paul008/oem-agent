// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { inlineFidelityFrameImages } from './fidelity-assets'

describe('fidelity frame image preparation', () => {
  it('replaces remote frame images with data URLs before html-to-image clones them', async () => {
    const frameDocument = document.implementation.createHTMLDocument('fidelity frame')
    frameDocument.body.innerHTML = [
      '<img src="https://oem-agent.adme-dev.workers.dev/media/pages/assets/nissan-au/navara/vehicle.png" srcset="vehicle-small.png 1x">',
      '<img src="data:image/png;base64,existing">',
    ].join('')
    const fetchAsset = async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['navara'], { type: 'image/webp' }),
    }) as Response

    await inlineFidelityFrameImages(frameDocument, { fetch: fetchAsset })

    expect(frameDocument.images[0].src).toBe('data:image/webp;base64,bmF2YXJh')
    expect(frameDocument.images[0].hasAttribute('srcset')).toBe(false)
    expect(frameDocument.images[1].src).toBe('data:image/png;base64,existing')
  })
})
