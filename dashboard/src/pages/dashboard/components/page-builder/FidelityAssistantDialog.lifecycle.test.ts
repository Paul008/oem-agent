// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'

import type { CandidateGraph } from '@/lib/adaptive-match-contracts'

import FidelityAssistantDialog from './FidelityAssistantDialog.vue'

const adaptiveMocks = vi.hoisted(() => ({ useAdaptiveMatch: vi.fn() }))

vi.mock('./use-adaptive-match', () => ({
  useAdaptiveMatch: adaptiveMocks.useAdaptiveMatch,
}))

vi.mock('html-to-image', () => ({
  getFontEmbedCSS: vi.fn(async () => ''),
  toSvg: vi.fn(async () => 'data:image/svg+xml;base64,PHN2Zy8+'),
}))

function candidateGraph(): CandidateGraph {
  return {
    version: 1,
    kind: 'carousel',
    regionId: 'safety',
    confidence: 0.9,
    section: {
      type: 'gallery',
      title: 'Safety',
      description: '',
      layout: 'carousel',
      images: [{ url: 'https://example.test/safety.png', alt: 'Safety', caption: 'Safety', description: '' }],
      initialIndex: 0,
      lightbox: false,
      layoutTokens: {},
      appearanceTokens: {},
    },
    interaction: { kind: 'carousel', wrap: true, keyboard: true, showIndicators: true },
    provenance: { strategy: 'ai-interpretation', attempt: 1 },
  }
}

function mockController(ready = false) {
  const graph = candidateGraph()
  return {
    state: reactive({ stage: ready ? 'ready' : 'idle', runId: 'dialog-run', error: '' }),
    attempts: ref(ready
      ? [{
          attempt: 1,
          safe: true,
          graph,
          qa: {
            passed: true,
            failures: [],
            failureCount: 0,
            worstMismatchRatio: 0.02,
            interactionPassed: 1,
            contentMatched: 2,
            overflowFailures: 0,
          },
        }]
      : []),
    progress: ref(null),
    candidateGraph: ref(null),
    bestAttempt: ref(ready
      ? {
          attempt: 1,
          safe: true,
          graph,
          qa: {
            passed: true,
            failures: [],
            failureCount: 0,
            worstMismatchRatio: 0.02,
            interactionPassed: 1,
            contentMatched: 2,
            overflowFailures: 0,
          },
        }
      : null),
    bestCandidate: ref(ready ? graph : null),
    start: vi.fn(async () => {}),
    cancel: vi.fn(),
  }
}

function props(open: boolean) {
  return {
    open,
    oemId: 'nissan-au',
    modelSlug: 'navara',
    sourceUrl: 'https://www.nissan.com.au/navara',
    regionId: 'safety',
    originalHtml: '<section>Safety</section>',
    originalCss: '',
    recipeArtifact: null,
    candidateSection: { type: 'content-block', _generated_html: '<section>Safety</section>' },
  }
}

beforeEach(() => {
  adaptiveMocks.useAdaptiveMatch.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('adaptive Match dialog lifecycle', () => {
  it('starts on open, cancels on close, and starts cleanly when reopened', async () => {
    const controller = mockController()
    adaptiveMocks.useAdaptiveMatch.mockReturnValue(controller)
    const open = ref(true)
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(defineComponent({
      setup: () => () => h(FidelityAssistantDialog, {
        ...props(open.value),
        'onUpdate:open': value => open.value = value,
      }),
    }))
    app.mount(host)
    await nextTick()
    await nextTick()
    expect(controller.start).toHaveBeenCalledTimes(1)

    open.value = false
    await nextTick()
    expect(controller.cancel).toHaveBeenCalled()
    open.value = true
    await nextTick()
    await nextTick()
    expect(controller.start).toHaveBeenCalledTimes(2)
    app.unmount()
  })

  it('emits Apply only after the explicit enabled action', async () => {
    const controller = mockController(true)
    adaptiveMocks.useAdaptiveMatch.mockReturnValue(controller)
    const applied = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(FidelityAssistantDialog, {
      ...props(true),
      onApply: applied,
    })
    app.mount(host)
    await nextTick()

    expect(applied).not.toHaveBeenCalled()
    const apply = document.body.querySelector<HTMLButtonElement>('[data-adaptive-apply]')
    expect(apply?.disabled).toBe(false)
    apply?.click()
    await nextTick()
    expect(applied).toHaveBeenCalledTimes(1)
    expect(applied.mock.calls[0][0]).toMatchObject({
      type: 'gallery',
      _adaptive_match: { run_id: 'dialog-run', qa: { passed: true } },
    })
    app.unmount()
  })
})
