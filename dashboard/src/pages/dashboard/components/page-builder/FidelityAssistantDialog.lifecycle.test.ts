// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'

import FidelityAssistantDialog from './FidelityAssistantDialog.vue'

vi.mock('html-to-image', () => ({
  toCanvas: vi.fn(() => new Promise<HTMLCanvasElement>(() => {})),
}))

afterEach(() => {
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
    expect(findMeasureButton()?.textContent).toContain('Measuring desktop (1/3)')
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
})
