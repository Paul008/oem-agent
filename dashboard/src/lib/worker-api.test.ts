import { beforeEach, describe, expect, it, vi } from 'vitest'

import { supabase } from '@/lib/supabase'

import {
  adaptivePipeline,
  buildModelPagePublicationCandidate,
  clonePage,
  compileTailwindRecipeArtifact,
  createSubpage,
  fetchCompileRunStatus,
  fetchGeneratedPage,
  fetchGeneratedPages,
  fetchModelPagePublicationCandidateHtml,
  fetchModelPagePublicationState,
  importLegacyPage,
  mapAndStructurePage,
  publishModelPagePublicationCandidate,
  rollbackModelPagePublication,
  requestAdaptiveMatch,
  saveDealerOverrides,
  scoreRegionQuality,
  updateClonePage,
  updatePageSections,
  workerTextFetch,
} from './worker-api'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}))

describe('worker-api scoreRegionQuality', () => {
  it('sends two stripped PNG payloads with the authenticated request', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { access_token: 'session-token' } },
    } as any)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      score: 91,
      feedback: 'Close match',
      suggestions: ['Reduce top padding'],
      scored_at: '2026-08-13T08:00:00.000Z',
    }), { headers: { 'content-type': 'application/json' } })))

    await expect(scoreRegionQuality(
      'nissan-au',
      'data:image/png;base64,reference',
      'data:image/png;base64,candidate',
    )).resolves.toMatchObject({ score: 91 })

    const [, options] = vi.mocked(fetch).mock.calls[0]
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer session-token')
    expect(JSON.parse(String(options?.body))).toEqual({
      oem_id: 'nissan-au',
      reference_base64: 'reference',
      candidate_base64: 'candidate',
    })
  })
})

describe('worker-api clonePage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('does not serialize model overrides for the non-AI clone workflow', async () => {
    await (clonePage as (...args: unknown[]) => Promise<unknown>)(
      'ford-au',
      'mustang',
      'https://www.ford.com.au/showroom/performance/mustang/',
      { provider: 'google_gemini', model: 'gemini-2.5-pro' },
    )

    const fetchMock = vi.mocked(fetch)
    const [, options] = fetchMock.mock.calls[0]

    expect(options?.body).toBe(JSON.stringify({
      source_url: 'https://www.ford.com.au/showroom/performance/mustang/',
    }))
  })
})

describe('worker-api adaptivePipeline', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('serializes force clone refresh requests for full preview rebuilds', async () => {
    await adaptivePipeline('volkswagen-au', 'amarok', { forceClone: true })

    const fetchMock = vi.mocked(fetch)
    const [, options] = fetchMock.mock.calls[0]

    expect(options?.method).toBe('POST')
    expect(options?.body).toBe(JSON.stringify({ force_clone: true }))
  })

  it('keeps the legacy source URL and model override signature compatible', async () => {
    await adaptivePipeline(
      'ford-au',
      'mustang',
      'https://www.ford.com.au/showroom/performance/mustang/',
      { provider: 'google_gemini', model: 'gemini-2.5-pro' },
    )

    const fetchMock = vi.mocked(fetch)
    const [, options] = fetchMock.mock.calls[0]

    expect(options?.body).toBe(JSON.stringify({
      source_url: 'https://www.ford.com.au/showroom/performance/mustang/',
      modelOverride: { provider: 'google_gemini', model: 'gemini-2.5-pro' },
    }))
  })
})

describe('worker-api fetchCompileRunStatus', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({
          runId: 'volkswagen-au:amarok:1',
          status: 'capturing',
          stageLabel: 'Capturing source page',
          startedAt: '2026-07-03T00:00:00.000Z',
          updatedAt: '2026-07-03T00:00:01.000Z',
          completedAt: null,
          error: null,
          warnings: [],
          artifacts: [],
        }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('reads the compile run status for a model page', async () => {
    const status = await fetchCompileRunStatus('volkswagen-au', 'amarok')

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toBe('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/compile-status/volkswagen-au/amarok')
    expect(status).toMatchObject({
      runId: 'volkswagen-au:amarok:1',
      status: 'capturing',
      stageLabel: 'Capturing source page',
    })
  })
})

describe('worker-api fetchGeneratedPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ slug: 'ford-au-mustang' }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('requests cloned HTML and modes only when the caller needs them', async () => {
    await fetchGeneratedPage('ford-au-mustang')
    await fetchGeneratedPage('ford-au-mustang', { includeRendered: true, includeModes: true })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/pages/ford-au-mustang')
    expect(fetchMock.mock.calls[0][0]).not.toContain('includeRendered=true')
    expect(fetchMock.mock.calls[0][0]).not.toContain('includeModes=true')
    expect(fetchMock.mock.calls[1][0]).toContain('/api/v1/oem-agent/pages/ford-au-mustang?includeRendered=true&includeModes=true')
  })

  it('uses the Worker host for generated page list and detail reads', async () => {
    await fetchGeneratedPages('mazda-au')
    await fetchGeneratedPage('mazda-au-cx-5', { includeRendered: true, includeModes: true })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toBe('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages?oemId=mazda-au')
    expect(fetchMock.mock.calls[1][0]).toBe('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/mazda-au-cx-5?includeRendered=true&includeModes=true')
  })

  it('requests modes without cloned HTML when only modes are needed', async () => {
    await fetchGeneratedPage('ford-au-mustang', { includeModes: true })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/pages/ford-au-mustang?includeModes=true')
    expect(fetchMock.mock.calls[0][0]).not.toContain('includeRendered=true')
  })

  it('sends Supabase Authorization on generated page reads', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { access_token: 'supabase-token' } },
    } as any)

    await fetchGeneratedPage('toyota-au-rav4', { includeRendered: true, includeModes: true })

    const fetchMock = vi.mocked(fetch)
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer supabase-token')
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include')
  })
})

describe('worker-api updateClonePage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, version: 6 }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('saves edited clone HTML and section index', async () => {
    await updateClonePage('ford-au', 'mustang', {
      edited_rendered: '<main>Edited Mustang</main>',
      section_index: [{ id: 'r1', label: 'Hero', selector: 'main', tag: 'main', classes: [], top: 0, height: 400, editable_fields: [] }],
    })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/admin/update-clone/ford-au/mustang')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({
      edited_rendered: '<main>Edited Mustang</main>',
      section_index: [{ id: 'r1', label: 'Hero', selector: 'main', tag: 'main', classes: [], top: 0, height: 400, editable_fields: [] }],
    }))
  })

  it('saves edited clone HTML without replacing the section index', async () => {
    await updateClonePage('ford-au', 'mustang', {
      edited_rendered: '<main>Edited Mustang</main>',
    })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/admin/update-clone/ford-au/mustang')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({
      edited_rendered: '<main>Edited Mustang</main>',
    }))
    expect(fetchMock.mock.calls[0][1]?.body).not.toContain('section_index')
  })
})

describe('worker-api mapAndStructurePage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, mapping_source: 'deterministic' }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('serializes selected model overrides for AI fallback', async () => {
    await mapAndStructurePage('ford-au', 'mustang', {
      provider: 'google_gemini',
      model: 'gemini-2.5-pro',
    })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/admin/map-and-structure/ford-au/mustang')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({
      modelOverride: {
        provider: 'google_gemini',
        model: 'gemini-2.5-pro',
      },
    }))
  })

  it('omits the request body when no model override is selected', async () => {
    await mapAndStructurePage('ford-au', 'mustang')

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined()
  })
})

describe('worker-api compileTailwindRecipeArtifact', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, result: { section_type: 'variant-color-explorer' } }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('posts the captured artifact to the Tailwind recipe compiler endpoint', async () => {
    const artifact = {
      oem_id: 'mitsubishi-au',
      model_slug: 'outlander',
      source_url: 'https://www.mitsubishi-motors.com.au/vehicles/outlander.html',
      region_id: 'range-picker',
      viewport: { name: 'desktop', width: 1440, height: 1200 },
      root: {
        path: '0',
        tag: 'section',
        text: 'Make Your Mark.',
        attributes: { class: 'range-selector' },
        computed_style: { display: 'grid' },
        children: [],
      },
    }

    await compileTailwindRecipeArtifact(artifact)

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/admin/compile-tailwind-recipe')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ artifact }))
  })
})

const adaptiveMatchApiGraph = {
  version: 1,
  kind: 'carousel',
  regionId: 'safety',
  confidence: 0.93,
  section: {
    type: 'gallery',
    title: 'Safety',
    layout: 'carousel',
    images: [{ url: 'https://example.test/braking.png', alt: 'Braking', caption: 'Braking', description: '' }],
    initialIndex: 0,
    lightbox: false,
    layoutTokens: {},
    appearanceTokens: {},
  },
  interaction: { kind: 'carousel', wrap: true, keyboard: true, showIndicators: true },
  provenance: {
    strategy: 'ai-interpretation',
    attempt: 1,
    provider: 'google_gemini',
    model: 'gemini-3.1-pro-preview',
  },
}

function adaptiveMatchApiResponse() {
  return {
    success: true,
    runId: 'client-run-1',
    attempt: 1,
    graph: adaptiveMatchApiGraph,
    provider: 'google_gemini',
    model: 'gemini-3.1-pro-preview',
    latencyMs: 321,
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  }
}

function adaptiveMatchApiRequest() {
  return {
    version: 1 as const,
    mode: 'interpret' as const,
    runId: 'client-run-1',
    attempt: 1,
    contactSheetBase64: 'data:image/png;base64,ZmFrZS1wbmc=',
    evidence: {
      version: 1 as const,
      oemId: 'nissan-au',
      modelSlug: 'navara',
      sourceUrl: 'https://www.nissan.com.au/navara',
      regionId: 'safety',
      html: '<section class="swiper">Safety</section>',
      css: '.swiper{display:flex}',
      recipeArtifact: null,
      detection: { kind: 'carousel' as const, confidence: 0.9, markers: ['swiper'], itemCount: 1, requiresAi: true },
      interactionStates: [{ id: 'initial', activeIndex: 0, visibleItems: [0], expandedItems: [] }],
      viewports: [{ name: 'desktop' as const, width: 1440, height: 900 }],
      content: { text: ['Safety'], assets: [] },
    },
    qaFailures: [],
  }
}

describe('worker-api requestAdaptiveMatch', () => {
  it('streams authenticated progress and returns the validated complete event', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { access_token: 'adaptive-session-token' } },
    } as any)
    const result = adaptiveMatchApiResponse()
    const sse = [
      'event: accepted\ndata: {"attempt":1}\n\n',
      'event: interpreting\ndata: {"attempt":1}\n\n',
      'event: validated\ndata: {"attempt":1}\n\n',
      'event: persisted\ndata: {"attempt":1}\n\n',
      `event: complete\ndata: ${JSON.stringify(result)}\n\n`,
    ].join('')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse, {
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    })))
    const progress: string[] = []

    await expect(requestAdaptiveMatch(adaptiveMatchApiRequest(), {
      onProgress: event => progress.push(event.event),
    })).resolves.toMatchObject({ graph: { kind: 'carousel', regionId: 'safety' } })

    expect(progress).toEqual(['accepted', 'interpreting', 'validated', 'persisted', 'complete'])
    const [url, options] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/api/v1/oem-agent/admin/adaptive-match')
    const headers = new Headers(options?.headers)
    expect(headers.get('Authorization')).toBe('Bearer adaptive-session-token')
    expect(headers.get('Accept')).toBe('text/event-stream')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(options?.method).toBe('POST')
    expect(JSON.parse(String(options?.body)).contactSheetBase64).toBe('ZmFrZS1wbmc=')
  })

  it('accepts the JSON fallback response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(adaptiveMatchApiResponse()), {
      headers: { 'content-type': 'application/json' },
    })))

    await expect(requestAdaptiveMatch(adaptiveMatchApiRequest())).resolves.toMatchObject({
      success: true,
      runId: 'client-run-1',
      graph: { regionId: 'safety' },
    })
  })
})

describe('worker-api protected model page writes', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it.each([
    ['clonePage', () => clonePage('foton-au', 'tunland')],
    ['adaptivePipeline', () => adaptivePipeline('foton-au', 'tunland')],
    ['updateClonePage', () => updateClonePage('foton-au', 'tunland', { edited_rendered: '<main />' })],
    ['updatePageSections', () => updatePageSections('foton-au', 'tunland', [])],
    ['createSubpage', () => createSubpage('foton-au', 'tunland', 'specs', 'Specifications', 'specs')],
    ['saveDealerOverrides', () => saveDealerOverrides('foton-au', 'tunland', { dealer_name: 'Dealer' })],
    ['importLegacyPage', () => importLegacyPage('foton-au', 'tunland', undefined, { header: {}, content: {} })],
  ])('blocks %s before making a request', async (_, call) => {
    await expect(call()).rejects.toThrow('protected from dashboard writes')
    expect(fetch).not.toHaveBeenCalled()
  })
})

function publicationStatePayload(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    next_revision: 13,
    published_revision: 9,
    published_at: '2026-08-04T08:00:00.000Z',
    published_by: 'editor@example.com',
    candidate: null,
    history: [9],
    ...overrides,
  }
}

function historyManifestPayload(overrides: Record<string, unknown> = {}) {
  return {
    pageId: 'nissan-au-ariya',
    revision: 9,
    draftVersion: 20,
    format: 'composed-html-body',
    bodyPath: 'model-pages/nissan-au-ariya/publication/revisions/9/body.html',
    publishedAt: null,
    publishedBy: null,
    platformRegions: ['hero', 'variants', 'inventory'],
    etag: '"sha256-body-9"',
    bodyBytes: 1400,
    bodySha256: 'sha256-body-9',
    regionRenderers: [{ regionId: 'intro', renderer: 'clone', interactionKind: 'none' }],
    ...overrides,
  }
}

function stubPublicationJson(value: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  })))
}

describe('worker-api publication requests', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('candidate-html')) {
          return new Response('<main>Candidate 12</main>', {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
        }
        if (url.endsWith('/history')) {
          return new Response(JSON.stringify({ state: null, history: [], candidateValidation: null }), {
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url.endsWith('/candidate')) {
          return new Response(JSON.stringify({
            status: 'ready',
            revision: 12,
            validation: {
              publishable: true,
              blocking: [],
              warnings: [],
              viewports: [],
              digest: 'sha256-validation-12',
            },
            state: {
              schema_version: 1,
              next_revision: 13,
              published_revision: 9,
              published_at: '2026-08-04T08:00:00.000Z',
              published_by: 'editor@example.com',
              candidate: {
                revision: 12,
                draft_version: 24,
                status: 'ready',
                validation_digest: 'sha256-validation-12',
                created_at: '2026-08-04T08:10:00.000Z',
                created_by: 'editor@example.com',
              },
              history: [9],
            },
          }), {
            headers: { 'content-type': 'application/json' },
          })
        }
        const isPublish = url.endsWith('/publish')
        return new Response(JSON.stringify({
          ...publicationStatePayload(isPublish
            ? { published_revision: 12, history: [12, 9] }
            : undefined),
          propagation: 'delivered',
        }), {
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
  })

  it('maps publication history to the Task 5 admin route', async () => {
    await fetchModelPagePublicationState('nissan-au-ariya')

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      'https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/history',
    )
  })

  it('sends the saved draft version when building a candidate', async () => {
    await buildModelPagePublicationCandidate('nissan-au-ariya', 24)

    const [url, options] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/candidate')
    expect(options?.method).toBe('POST')
    expect(options?.body).toBe(JSON.stringify({ expectedDraftVersion: 24 }))
  })

  it('sends the ready candidate identity when publishing', async () => {
    await publishModelPagePublicationCandidate('nissan-au-ariya', {
      revision: 12,
      expectedDraftVersion: 24,
      validationDigest: 'sha256-validation-12',
    })

    const [, options] = vi.mocked(fetch).mock.calls[0]
    expect(options?.method).toBe('POST')
    expect(options?.body).toBe(JSON.stringify({
      revision: 12,
      expectedDraftVersion: 24,
      validationDigest: 'sha256-validation-12',
    }))
  })

  it('sends the rollback target and currently observed published revision', async () => {
    await rollbackModelPagePublication('nissan-au-ariya', 9, 12)

    const [, options] = vi.mocked(fetch).mock.calls[0]
    expect(options?.method).toBe('POST')
    expect(options?.body).toBe(JSON.stringify({ targetRevision: 9, expectedPublishedRevision: 12 }))
  })

  it('fetches candidate HTML with the same session authentication as JSON requests', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { access_token: 'candidate-token' } },
    } as any)

    const html = await fetchModelPagePublicationCandidateHtml('nissan-au-ariya', 12)

    const [url, options] = vi.mocked(fetch).mock.calls[0]
    const headers = new Headers(options?.headers)
    expect(url).toBe('https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/candidate-html?revision=12')
    expect(html).toBe('<main>Candidate 12</main>')
    expect(headers.get('Authorization')).toBe('Bearer candidate-token')
    expect(options?.credentials).toBe('include')
  })

  it('surfaces text-response HTTP status and response details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        error: 'Ready publication candidate no longer matches',
        code: 'candidate_conflict',
      }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      })),
    )

    await expect(workerTextFetch('/admin/pages/nissan-au-ariya/publication/candidate-html?revision=12'))
      .rejects
      .toThrow('Worker API error 409: {"error":"Ready publication candidate no longer matches","code":"candidate_conflict"}')
  })

  it('rejects malformed history state before returning it to the composable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      state: {
        schema_version: 2,
        next_revision: 13,
        published_revision: null,
        candidate: null,
        history: [],
      },
      history: [],
      candidateValidation: null,
    }), { headers: { 'content-type': 'application/json' } })))

    await expect(fetchModelPagePublicationState('nissan-au-ariya'))
      .rejects
      .toThrow('Invalid model page publication history response')
  })

  it('rejects publication state whose published revision is absent from retained history', async () => {
    stubPublicationJson({
      state: publicationStatePayload({ history: [] }),
      history: [],
      candidateValidation: null,
    })

    await expect(fetchModelPagePublicationState('nissan-au-ariya'))
      .rejects
      .toThrow('Invalid model page publication history response')
  })

  it('rejects a candidate revision that is not below the next allocated revision', async () => {
    stubPublicationJson({
      status: 'ready',
      revision: 13,
      validation: {
        publishable: true,
        blocking: [],
        warnings: [],
        viewports: [],
        digest: 'sha256-validation-13',
      },
      state: publicationStatePayload({
        candidate: {
          revision: 13,
          draft_version: 24,
          status: 'ready',
          validation_digest: 'sha256-validation-13',
          created_at: '2026-08-04T08:10:00.000Z',
          created_by: 'editor@example.com',
        },
      }),
    })

    await expect(buildModelPagePublicationCandidate('nissan-au-ariya', 24))
      .rejects
      .toThrow('Invalid model page publication candidate response')
  })

  it.each([
    ['wrong page', { pageId: 'nissan-au-qashqai' }],
    ['unretained revision', { revision: 8 }],
  ])('rejects a history manifest with %s identity', async (_, manifestOverrides) => {
    stubPublicationJson({
      state: publicationStatePayload(),
      history: [historyManifestPayload(manifestOverrides)],
      candidateValidation: null,
    })

    await expect(fetchModelPagePublicationState('nissan-au-ariya'))
      .rejects
      .toThrow('Invalid model page publication history response')
  })

  it('accepts candidate validation only with explicit matching candidate identity', async () => {
    const failedValidation = {
      publishable: false,
      blocking: [{ code: 'visual-mismatch', message: 'Candidate mismatch is blocking' }],
      warnings: [],
      viewports: [],
      digest: 'sha256-failed-12',
    }
    stubPublicationJson({
      state: publicationStatePayload({
        candidate: {
          revision: 12,
          draft_version: 24,
          status: 'failed',
          validation_digest: failedValidation.digest,
          created_at: '2026-08-04T08:10:00.000Z',
          created_by: 'editor@example.com',
        },
      }),
      history: [historyManifestPayload()],
      candidateValidation: {
        revision: 12,
        status: 'failed',
        validation: failedValidation,
      },
    })

    await expect(fetchModelPagePublicationState('nissan-au-ariya')).resolves.toMatchObject({
      candidateValidation: { revision: 12, status: 'failed' },
    })
  })

  it.each([
    ['revision', { revision: 11, status: 'failed', validationDigest: 'sha256-failed-12' }],
    ['status', { revision: 12, status: 'ready', validationDigest: 'sha256-failed-12' }],
    ['digest', { revision: 12, status: 'failed', validationDigest: 'sha256-other' }],
  ])('rejects candidate validation with mismatched %s identity', async (_, identity) => {
    const failedValidation = {
      publishable: false,
      blocking: [{ code: 'visual-mismatch', message: 'Candidate mismatch is blocking' }],
      warnings: [],
      viewports: [],
      digest: identity.validationDigest,
    }
    stubPublicationJson({
      state: publicationStatePayload({
        candidate: {
          revision: 12,
          draft_version: 24,
          status: 'failed',
          validation_digest: 'sha256-failed-12',
          created_at: '2026-08-04T08:10:00.000Z',
          created_by: 'editor@example.com',
        },
      }),
      history: [historyManifestPayload()],
      candidateValidation: {
        revision: identity.revision,
        status: identity.status,
        validation: failedValidation,
      },
    })

    await expect(fetchModelPagePublicationState('nissan-au-ariya'))
      .rejects
      .toThrow('Invalid model page publication history response')
  })

  it('rejects candidate validation whose status contradicts the current candidate', async () => {
    const validation = {
      publishable: true,
      blocking: [],
      warnings: [],
      viewports: [],
      digest: 'sha256-validation-12',
    }
    stubPublicationJson({
      state: publicationStatePayload({
        candidate: {
          revision: 12,
          draft_version: 24,
          status: 'failed',
          validation_digest: validation.digest,
          created_at: '2026-08-04T08:10:00.000Z',
          created_by: 'editor@example.com',
        },
      }),
      history: [historyManifestPayload()],
      candidateValidation: validation,
    })

    await expect(fetchModelPagePublicationState('nissan-au-ariya'))
      .rejects
      .toThrow('Invalid model page publication history response')
  })

  it('rejects candidate responses whose revision and digest do not match state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'ready',
      revision: 13,
      validation: {
        publishable: true,
        blocking: [],
        warnings: [],
        viewports: [],
        digest: 'sha256-wrong',
      },
      state: {
        schema_version: 1,
        next_revision: 13,
        published_revision: 9,
        candidate: {
          revision: 12,
          draft_version: 24,
          status: 'ready',
          validation_digest: 'sha256-validation-12',
          created_at: '2026-08-04T08:10:00.000Z',
          created_by: 'editor@example.com',
        },
        history: [9],
      },
    }), { headers: { 'content-type': 'application/json' } })))

    await expect(buildModelPagePublicationCandidate('nissan-au-ariya', 24))
      .rejects
      .toThrow('Invalid model page publication candidate response')
  })

  it('rejects publish responses with an unknown propagation status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      schema_version: 1,
      next_revision: 13,
      published_revision: 12,
      candidate: null,
      history: [12, 9],
      propagation: 'complete',
    }), { headers: { 'content-type': 'application/json' } })))

    await expect(publishModelPagePublicationCandidate('nissan-au-ariya', {
      revision: 12,
      expectedDraftVersion: 24,
      validationDigest: 'sha256-validation-12',
    })).rejects.toThrow('Invalid model page publication publish response')
  })

  it('rejects publish responses for a different revision', async () => {
    stubPublicationJson({
      ...publicationStatePayload({ published_revision: 9 }),
      propagation: 'delivered',
    })

    await expect(publishModelPagePublicationCandidate('nissan-au-ariya', {
      revision: 12,
      expectedDraftVersion: 24,
      validationDigest: 'sha256-validation-12',
    })).rejects.toThrow('Invalid model page publication publish response')
  })

  it('rejects publish responses that retain a candidate', async () => {
    stubPublicationJson({
      ...publicationStatePayload({
        published_revision: 12,
        history: [12, 9],
        candidate: {
          revision: 11,
          draft_version: 24,
          status: 'ready',
          validation_digest: 'sha256-validation-11',
          created_at: '2026-08-04T08:10:00.000Z',
          created_by: 'editor@example.com',
        },
      }),
      propagation: 'delivered',
    })

    await expect(publishModelPagePublicationCandidate('nissan-au-ariya', {
      revision: 12,
      expectedDraftVersion: 24,
      validationDigest: 'sha256-validation-12',
    })).rejects.toThrow('Invalid model page publication publish response')
  })

  it('rejects rollback responses that do not select the requested target', async () => {
    stubPublicationJson({
      ...publicationStatePayload({ published_revision: 12, history: [12, 9] }),
      propagation: 'delivered',
    })

    await expect(rollbackModelPagePublication('nissan-au-ariya', 9, 12))
      .rejects
      .toThrow('Invalid model page publication rollback response')
  })

  it('rejects rollback responses with invalid revision history', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      schema_version: 1,
      next_revision: 13,
      published_revision: 0,
      candidate: null,
      history: [0],
      propagation: 'delivered',
    }), { headers: { 'content-type': 'application/json' } })))

    await expect(rollbackModelPagePublication('nissan-au-ariya', 9, 12))
      .rejects
      .toThrow('Invalid model page publication rollback response')
  })

  it('rejects non-HTML candidate responses before preview creation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"html":"not html"}', {
      headers: { 'content-type': 'application/json' },
    })))

    await expect(fetchModelPagePublicationCandidateHtml('nissan-au-ariya', 12))
      .rejects
      .toThrow('Expected text/html')
  })
})
