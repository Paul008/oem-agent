// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'

import FidelityAssistantDialog from './FidelityAssistantDialog.vue'

const htmlToImageMocks = vi.hoisted(() => ({
  getFontEmbedCSS: vi.fn(() => Promise.resolve('')),
  toSvg: vi.fn(() => new Promise<string>(() => {})),
}))

vi.mock('html-to-image', () => ({
  getFontEmbedCSS: htmlToImageMocks.getFontEmbedCSS,
  toSvg: htmlToImageMocks.toSvg,
}))

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

function findMeasureButton(): HTMLButtonElement | null {
  return document.body.querySelector<HTMLButtonElement>('[data-fidelity-measure="true"]')
}

describe('fidelityAssistantDialog measurement lifecycle', () => {
  it('does not reopen in a permanently measuring state after cancellation', async () => {
    const open = ref(true)
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({
      setup: () => () => h(FidelityAssistantDialog, {
        'open': open.value,
        'oemId': 'nissan-au-navara',
        'regionId': 'hero',
        'originalHtml': '<main>OEM reference</main>',
        'originalCss': '',
        'candidateSection': { _generated_html: '<main>Candidate</main>' },
        'onUpdate:open': value => open.value = value,
      }),
    }))
    app.mount(container)
    await nextTick()

    const initialButton = findMeasureButton()
    expect(initialButton?.disabled).toBe(false)
    initialButton?.click()
    await nextTick()
    expect(findMeasureButton()?.textContent).toContain('Preparing OEM fonts')
    expect(findMeasureButton()?.disabled).toBe(true)

    open.value = false
    await nextTick()
    open.value = true
    await nextTick()

    expect(findMeasureButton()?.textContent).toContain('Measure all viewports')
    expect(findMeasureButton()?.disabled).toBe(false)

    app.unmount()
    container.remove()
  })

  it('captures the OEM and conversion sequentially to avoid Safari canvas contention', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(FidelityAssistantDialog, {
      open: true,
      oemId: 'nissan-au-navara',
      regionId: 'hero',
      originalHtml: '<main>OEM reference</main>',
      originalCss: '',
      candidateSection: { _generated_html: '<main>Candidate</main>' },
    })
    app.mount(container)
    await nextTick()

    findMeasureButton()?.click()
    await nextTick()
    await vi.advanceTimersByTimeAsync(600)

    expect(htmlToImageMocks.getFontEmbedCSS).toHaveBeenCalledTimes(2)
    expect(htmlToImageMocks.toSvg).toHaveBeenCalledTimes(1)
    expect(findMeasureButton()?.textContent).toContain('Capturing desktop OEM')

    app.unmount()
    container.remove()
  })
})
