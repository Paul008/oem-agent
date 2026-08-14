import { describe, expect, it } from 'vitest'

import type { InferenceRequest, InferenceResponse } from '../ai/router'

import { executeAdaptiveMatch } from './adaptive-match'

const graph = {
  version: 1,
  kind: 'carousel',
  regionId: 'safety',
  confidence: 0.93,
  section: {
    type: 'gallery',
    title: 'Safety',
    layout: 'carousel',
    images: [
      { url: 'https://example.test/braking.png', alt: 'Braking', caption: 'Intelligent braking', description: '' },
      { url: 'https://example.test/lane.png', alt: 'Lane departure', caption: 'Lane departure warning', description: '' },
    ],
    initialIndex: 0,
    lightbox: false,
    layoutTokens: { desktopColumns: 3, tabletColumns: 2, mobileColumns: 1, gapPx: 16 },
    appearanceTokens: { backgroundColor: '#ffffff', textColor: '#111111', imageFit: 'contain' },
  },
  interaction: { kind: 'carousel', wrap: true, keyboard: true, showIndicators: true },
  provenance: { strategy: 'ai-interpretation', attempt: 1 },
}

const request = {
  version: 1,
  mode: 'interpret',
  runId: 'run-123',
  attempt: 1,
  contactSheetBase64: 'ZmFrZS1wbmc=',
  evidence: {
    version: 1,
    oemId: 'nissan-au',
    modelSlug: 'navara',
    sourceUrl: 'https://www.nissan.com.au/vehicles/browse-range/navara.html',
    regionId: 'safety',
    html: '<section class="swiper"><article class="swiper-slide">Safety</article></section>',
    css: '.swiper{display:flex}',
    recipeArtifact: null,
    detection: { kind: 'carousel', confidence: 0.95, markers: ['swiper'], itemCount: 2, requiresAi: true },
    interactionStates: [{ id: 'initial', activeIndex: 0, visibleItems: [0], expandedItems: [] }],
    viewports: [
      { name: 'desktop', width: 1440, height: 1100 },
      { name: 'tablet', width: 1024, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ],
    content: {
      text: ['Safety', 'Intelligent braking', 'Lane departure warning'],
      assets: [
        { url: 'https://example.test/braking.png', alt: 'Braking', required: true },
        { url: 'https://example.test/lane.png', alt: 'Lane departure', required: true },
      ],
    },
  },
  qaFailures: [],
} as const

function inference(content: string): InferenceResponse {
  return {
    content,
    usage: { prompt_tokens: 1200, completion_tokens: 400, total_tokens: 1600 },
    provider: 'google_gemini',
    model: 'gemini-3.1-pro',
    latency_ms: 321,
    wasFallback: false,
  }
}

function memoryBucket() {
  const values = new Map<string, string>()
  const writes: Array<{ key: string, options: R2PutOptions | undefined }> = []
  return {
    values,
    writes,
    bucket: {
      async put(key: string, value: string, options?: R2PutOptions) {
        writes.push({ key, options })
        if (options?.onlyIf instanceof Headers && options.onlyIf.get('if-none-match') === '*' && values.has(key))
          return null
        values.set(key, value)
        return {} as R2Object
      },
    } as Pick<R2Bucket, 'put'>,
  }
}

describe('executeAdaptiveMatch', () => {
  it('validates interpretation output and persists an immutable attempt ledger', async () => {
    const { bucket, values, writes } = memoryBucket()
    const response = await executeAdaptiveMatch(request, {
      infer: async () => inference(JSON.stringify(graph)),
      bucket,
    })

    expect(response).toMatchObject({
      success: true,
      runId: 'run-123',
      attempt: 1,
      provider: 'google_gemini',
      model: 'gemini-3.1-pro',
      graph: {
        regionId: 'safety',
        provenance: {
          strategy: 'ai-interpretation',
          attempt: 1,
          provider: 'google_gemini',
          model: 'gemini-3.1-pro',
        },
      },
    })
    const key = 'model-pages/nissan-au/navara/adaptive-match/run-123/attempt-1.json'
    expect(values.has(key)).toBe(true)
    expect(JSON.parse(values.get(key)!)).toMatchObject({
      runId: 'run-123',
      attempt: 1,
      status: 'accepted',
      evidence: { regionId: 'safety', kind: 'carousel' },
    })
    expect(values.get(key)).not.toContain(request.evidence.html)
    expect(writes[0].options?.onlyIf).toBeInstanceOf(Headers)
    expect((writes[0].options?.onlyIf as Headers).get('if-none-match')).toBe('*')
  })

  it('hydrates server-owned interpretation fields before validating model output', async () => {
    const { bucket } = memoryBucket()
    const modelGraph = {
      kind: graph.kind,
      confidence: graph.confidence,
      section: graph.section,
      interaction: graph.interaction,
    }

    const response = await executeAdaptiveMatch(request, {
      infer: async () => inference(JSON.stringify(modelGraph)),
      bucket,
    })

    expect(response.graph).toMatchObject({
      version: 1,
      regionId: 'safety',
      provenance: {
        strategy: 'ai-interpretation',
        attempt: 1,
        provider: 'google_gemini',
        model: 'gemini-3.1-pro',
      },
    })
  })

  it('requests a schema-constrained candidate graph for the detected interaction kind', async () => {
    const { bucket } = memoryBucket()
    const routed: InferenceRequest[] = []

    await executeAdaptiveMatch(request, {
      infer: async (input) => {
        routed.push(input)
        return inference(JSON.stringify(graph))
      },
      bucket,
    })

    expect(routed[0].responseJsonSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        version: { type: 'integer', enum: [1] },
        kind: { type: 'string', enum: ['carousel'] },
        regionId: { type: 'string', enum: ['safety'] },
        section: {
          type: 'object',
          properties: { type: { type: 'string', enum: ['gallery'] } },
        },
        interaction: {
          type: 'object',
          properties: { kind: { type: 'string', enum: ['carousel'] } },
        },
      },
      required: ['version', 'kind', 'regionId', 'confidence', 'section', 'interaction'],
    })
    expect(routed[0].prompt).toContain('Do not wrap the object in a content, candidate, result, or section key')
  })

  it('never overwrites an existing run attempt ledger', async () => {
    const { bucket, values } = memoryBucket()
    await executeAdaptiveMatch(request, { infer: async () => inference(JSON.stringify(graph)), bucket })
    await executeAdaptiveMatch(request, {
      infer: async () => inference(JSON.stringify({ ...graph, section: { ...graph.section, title: 'Changed' } })),
      bucket,
    })

    const stored = JSON.parse(values.get('model-pages/nissan-au/navara/adaptive-match/run-123/attempt-1.json')!)
    expect(stored.graph.section.title).toBe('Safety')
  })

  it('applies a validated repair mutation without changing the previous graph', async () => {
    const { bucket } = memoryBucket()
    const mutation = {
      version: 1,
      regionId: 'safety',
      operations: [{ op: 'set', path: '/section/title', value: 'Advanced safety' }],
      explanation: 'Match the captured heading.',
    }
    const response = await executeAdaptiveMatch({
      ...request,
      mode: 'repair',
      attempt: 2,
      previousGraph: graph,
      qaFailures: ['desktop pixel mismatch exceeds 3%'],
    }, {
      infer: async () => inference(JSON.stringify(mutation)),
      bucket,
    })

    expect(response.graph.section.title).toBe('Advanced safety')
    expect(response.graph.provenance).toMatchObject({ strategy: 'ai-repair', attempt: 2 })
    expect(graph.section.title).toBe('Safety')
  })

  it('hydrates server-owned repair fields before applying a model mutation', async () => {
    const { bucket } = memoryBucket()
    const response = await executeAdaptiveMatch({
      ...request,
      mode: 'repair',
      attempt: 2,
      previousGraph: graph,
      qaFailures: ['desktop pixel mismatch exceeds 3%'],
    }, {
      infer: async () => inference(JSON.stringify({
        operations: [{ op: 'set', path: '/section/title', value: 'Safety technology' }],
        explanation: 'Restore the captured heading.',
      })),
      bucket,
    })

    expect(response.graph.section.title).toBe('Safety technology')
    expect(response.mutation).toMatchObject({ version: 1, regionId: 'safety' })
  })

  it('normalizes safe JSON Patch repair aliases before validation', async () => {
    const { bucket } = memoryBucket()
    const response = await executeAdaptiveMatch({
      ...request,
      mode: 'repair',
      attempt: 2,
      previousGraph: graph,
      qaFailures: ['2 required text items are missing'],
    }, {
      infer: async () => inference(JSON.stringify({
        operations: [
          { op: 'replace', target: '/section/title', value: 'Advanced safety technology' },
          { action: 'set', target: '/section/appearanceTokens/bodySizePx', value: 16 },
        ],
        explanation: 'Restore the captured content and type scale.',
      })),
      bucket,
    })

    expect(response.graph.section.title).toBe('Advanced safety technology')
    expect(response.graph.section.appearanceTokens.bodySizePx).toBe(16)
    expect(response.mutation?.operations).toEqual([
      { op: 'set', path: '/section/title', value: 'Advanced safety technology' },
      { op: 'set', path: '/section/appearanceTokens/bodySizePx', value: 16 },
    ])
  })

  it('gives schema-less fallback models an exact repair-operation example', async () => {
    const { bucket } = memoryBucket()
    const routed: InferenceRequest[] = []
    await executeAdaptiveMatch({
      ...request,
      mode: 'repair',
      attempt: 2,
      previousGraph: graph,
      qaFailures: ['2 required text items are missing'],
    }, {
      infer: async (input) => {
        routed.push(input)
        return inference(JSON.stringify({
          operations: [{ op: 'set', path: '/section/title', value: 'Advanced safety' }],
          explanation: 'Restore the captured heading.',
        }))
      },
      bucket,
    })

    expect(routed[0].prompt).toContain('"op":"set","path":"/section/title"')
    expect(routed[0].prompt).toContain('use path (not target)')
  })

  it('keeps repair alias paths inside the section and interaction allowlist', async () => {
    const { bucket } = memoryBucket()
    await expect(executeAdaptiveMatch({
      ...request,
      mode: 'repair',
      attempt: 2,
      previousGraph: graph,
      qaFailures: ['content mismatch'],
    }, {
      infer: async () => inference(JSON.stringify({
        operations: [{ action: 'set', target: '/provenance/provider', value: 'forged' }],
        explanation: 'Invalid server-owned mutation.',
      })),
      bucket,
    })).rejects.toThrow(/path is not allowed/i)
  })

  it('keeps graph discriminators server-owned during repair', async () => {
    const { bucket } = memoryBucket()
    const response = await executeAdaptiveMatch({
      ...request,
      mode: 'repair',
      attempt: 3,
      previousGraph: graph,
      qaFailures: ['mobile pixel mismatch exceeds 3%'],
    }, {
      infer: async () => inference(JSON.stringify({
        operations: [
          { op: 'replace', path: '/section/type', value: 'carousel' },
          { op: 'replace', path: '/interaction/kind', value: 'gallery' },
          { op: 'replace', path: '/section/title', value: 'Safety technology' },
        ],
        explanation: 'Repair the carousel presentation.',
      })),
      bucket,
    })

    expect(response.graph.section.type).toBe('gallery')
    expect(response.graph.interaction?.kind).toBe('carousel')
    expect(response.graph.section.title).toBe('Safety technology')
    expect(response.mutation?.operations.slice(0, 2)).toEqual([
      { op: 'set', path: '/section/type', value: 'gallery' },
      { op: 'set', path: '/interaction/kind', value: 'carousel' },
    ])
  })

  it('rejects executable model output and records the rejected attempt without raw output', async () => {
    const { bucket, values } = memoryBucket()
    await expect(executeAdaptiveMatch(request, {
      infer: async () => inference(JSON.stringify({
        ...graph,
        section: { ...graph.section, title: '<script>alert(1)</script>' },
      })),
      bucket,
    })).rejects.toThrow(/executable|candidate|validation/i)

    const stored = values.get('model-pages/nissan-au/navara/adaptive-match/run-123/attempt-1.json')!
    expect(JSON.parse(stored)).toMatchObject({ status: 'rejected' })
    expect(stored).not.toContain('<script>')
    expect(stored).not.toContain('rawModelOutput')
  })

  it('rejects active markup and inline styles in model-authored rich text', async () => {
    const { bucket } = memoryBucket()
    const tabs = {
      ...graph,
      kind: 'tabs',
      section: {
        type: 'tabs',
        title: 'Safety',
        category: '',
        tabs: [{
          label: 'Safety',
          contentHtml: '<meta http-equiv="refresh" content="0;url=https://example.test"><p style="position:fixed">Safety</p>',
          imageUrl: '',
          imageAlt: '',
        }],
        defaultTab: 0,
        layoutTokens: {},
        appearanceTokens: {},
      },
      interaction: { kind: 'tabs', keyboard: true, activation: 'automatic' },
    }

    await expect(executeAdaptiveMatch(request, {
      infer: async () => inference(JSON.stringify(tabs)),
      bucket,
    })).rejects.toThrow(/validation|unsafe|executable/i)
  })

  it('rejects AI output that changes the selected region identity', async () => {
    const { bucket } = memoryBucket()
    await expect(executeAdaptiveMatch(request, {
      infer: async () => inference(JSON.stringify({ ...graph, regionId: 'other' })),
      bucket,
    })).rejects.toThrow(/region/i)
  })

  it('removes scripts, event handlers, and URL credentials before inference', async () => {
    const { bucket } = memoryBucket()
    const routed: InferenceRequest[] = []
    await executeAdaptiveMatch({
      ...request,
      evidence: {
        ...request.evidence,
        sourceUrl: 'https://www.nissan.com.au/navara?token=secret#private',
        html: '<script>secret-script</script><div onclick="secret-handler()">Safe content</div>',
      },
    }, {
      infer: async (input) => {
        routed.push(input)
        return inference(JSON.stringify(graph))
      },
      bucket,
    })

    expect(routed[0].prompt).toContain('Safe content')
    expect(routed[0].prompt).not.toContain('secret-script')
    expect(routed[0].prompt).not.toContain('secret-handler')
    expect(routed[0].prompt).not.toContain('token=secret')
    expect(routed[0]).toMatchObject({
      taskType: 'section_deep_analysis',
      requireJson: true,
      imageBase64: 'ZmFrZS1wbmc=',
      imageMimeType: 'image/png',
      oemId: 'nissan-au',
    })
  })

  it('rejects malformed JSON and oversized evidence', async () => {
    const { bucket } = memoryBucket()
    await expect(executeAdaptiveMatch(request, {
      infer: async () => inference('not json'),
      bucket,
    })).rejects.toThrow(/JSON/i)

    await expect(executeAdaptiveMatch({
      ...request,
      evidence: { ...request.evidence, html: 'x'.repeat(120_001) },
    }, {
      infer: async () => inference(JSON.stringify(graph)),
      bucket,
    })).rejects.toThrow()
  })
})
