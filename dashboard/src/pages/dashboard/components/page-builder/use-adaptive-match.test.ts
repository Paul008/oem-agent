import { describe, expect, it, vi } from 'vitest'

import type { AdaptiveMatchAttemptQa, CandidateGraph } from '@/lib/adaptive-match-contracts'
import type { AdaptiveMatchApiRequest, AdaptiveMatchApiResponse } from '@/lib/worker-api'

import { useAdaptiveMatch } from './use-adaptive-match'

const passingQa: AdaptiveMatchAttemptQa = {
  passed: true,
  failures: [],
  failureCount: 0,
  worstMismatchRatio: 0.02,
  interactionPassed: 3,
  contentMatched: 4,
  overflowFailures: 0,
}

function failingQa(mismatchRatio: number, failures = ['desktop pixel mismatch exceeds 3%']): AdaptiveMatchAttemptQa {
  return {
    passed: false,
    failures,
    failureCount: failures.length,
    worstMismatchRatio: mismatchRatio,
    interactionPassed: 3,
    contentMatched: 4,
    overflowFailures: 0,
  }
}

function carouselGraph(attempt = 1): CandidateGraph {
  return {
    version: 1,
    kind: 'carousel',
    regionId: 'safety',
    confidence: 0.92,
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
    provenance: { strategy: attempt === 1 ? 'ai-interpretation' : 'ai-repair', attempt },
  }
}

function captured(kind: 'static' | 'carousel' = 'carousel') {
  return {
    contactSheetBase64: 'data:image/png;base64,ZmFrZQ==',
    evidence: {
      version: 1 as const,
      oemId: 'nissan-au',
      modelSlug: 'navara',
      sourceUrl: 'https://www.nissan.com.au/navara',
      regionId: 'safety',
      html: kind === 'carousel' ? '<section class="swiper"><div class="swiper-slide">Safety</div></section>' : '<section>Safety</section>',
      css: '',
      recipeArtifact: null,
      detection: {
        kind,
        confidence: 1,
        markers: kind === 'carousel' ? ['swiper'] : [],
        itemCount: kind === 'carousel' ? 1 : 0,
        requiresAi: kind !== 'static',
      },
      interactionStates: [{ id: 'initial', activeIndex: 0, visibleItems: [0], expandedItems: [] }],
      viewports: [
        { name: 'desktop' as const, width: 1440, height: 1100 },
        { name: 'tablet' as const, width: 1024, height: 900 },
        { name: 'mobile' as const, width: 390, height: 844 },
      ],
      content: { text: ['Safety'], assets: [] },
    },
  }
}

function response(request: AdaptiveMatchApiRequest): AdaptiveMatchApiResponse {
  return {
    success: true,
    runId: request.runId,
    attempt: request.attempt,
    graph: carouselGraph(request.attempt),
    provider: 'google_gemini',
    model: 'gemini-3.1-pro-preview',
    latencyMs: 100,
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  }
}

describe('useAdaptiveMatch', () => {
  it('uses the deterministic static path without calling AI', async () => {
    const request = vi.fn()
    const controller = useAdaptiveMatch({
      captureEvidence: async () => captured('static'),
      deterministicSection: {
        type: 'content-block',
        title: 'Safety',
        content_html: '<p>Safety</p>',
        _generated_html: '<section><p>Safety</p></section>',
      },
      evaluateCandidate: async () => passingQa,
      requestAdaptiveMatch: request,
    })

    await controller.start()

    expect(request).not.toHaveBeenCalled()
    expect(controller.state.stage).toBe('ready')
    expect(controller.attempts.value).toHaveLength(1)
    expect(controller.bestAttempt.value?.qa?.passed).toBe(true)
  })

  it('interprets an interactive region and stops on the first passing candidate', async () => {
    const request = vi.fn(async (input: AdaptiveMatchApiRequest) => response(input))
    const evaluate = vi.fn(async () => passingQa)
    const controller = useAdaptiveMatch({
      captureEvidence: async () => captured(),
      evaluateCandidate: evaluate,
      requestAdaptiveMatch: request,
    })

    await controller.start()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0].mode).toBe('interpret')
    expect(evaluate).toHaveBeenCalledTimes(1)
    expect(controller.state.stage).toBe('ready')
  })

  it('tries exactly two repairs and shows the best safe candidate after three failures', async () => {
    const request = vi.fn(async (input: AdaptiveMatchApiRequest) => response(input))
    const qa = [failingQa(0.08), failingQa(0.04), failingQa(0.05)]
    const controller = useAdaptiveMatch({
      captureEvidence: async () => captured(),
      evaluateCandidate: async () => qa.shift()!,
      requestAdaptiveMatch: request,
    })

    await controller.start()

    expect(request).toHaveBeenCalledTimes(3)
    expect(request.mock.calls.map(call => call[0].mode)).toEqual(['interpret', 'repair', 'repair'])
    expect(request.mock.calls[1][0].previousGraph).toBeTruthy()
    expect(request.mock.calls[1][0].qaFailures).toContain('desktop pixel mismatch exceeds 3%')
    expect(controller.attempts.value).toHaveLength(3)
    expect(controller.bestAttempt.value?.attempt).toBe(2)
    expect(controller.candidateGraph.value?.provenance.attempt).toBe(2)
    expect(controller.state.stage).toBe('ready')
  })

  it('counts model failures toward the three-attempt limit', async () => {
    const request = vi.fn(async () => {
      throw new Error('invalid model output')
    })
    const controller = useAdaptiveMatch({
      captureEvidence: async () => captured(),
      evaluateCandidate: async () => passingQa,
      requestAdaptiveMatch: request,
    })

    await controller.start()

    expect(request).toHaveBeenCalledTimes(3)
    expect(controller.attempts.value).toHaveLength(3)
    expect(controller.attempts.value.every(attempt => !attempt.safe)).toBe(true)
    expect(controller.state.stage).toBe('failed')
  })

  it('captures reference evidence once and discards stale completions after cancellation', async () => {
    let resolveRequest!: (value: AdaptiveMatchApiResponse) => void
    const pending = new Promise<AdaptiveMatchApiResponse>((resolve) => {
      resolveRequest = resolve
    })
    const capture = vi.fn(async () => captured())
    const controller = useAdaptiveMatch({
      captureEvidence: capture,
      evaluateCandidate: async () => passingQa,
      requestAdaptiveMatch: async () => pending,
    })

    const run = controller.start()
    await Promise.resolve()
    controller.cancel()
    resolveRequest(response({ runId: controller.state.runId, attempt: 1 } as AdaptiveMatchApiRequest))
    await run

    expect(capture).toHaveBeenCalledTimes(1)
    expect(controller.state.stage).toBe('cancelled')
    expect(controller.attempts.value).toHaveLength(0)
  })
})
